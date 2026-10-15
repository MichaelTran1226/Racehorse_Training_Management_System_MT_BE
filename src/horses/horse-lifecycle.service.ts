import { HttpStatus, Injectable } from '@nestjs/common';
import {
  HorseStatus,
  PlanStatus,
  Prisma,
  RetireReason,
  Role,
  StallStatus,
  WorkoutStatus,
} from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ChangeHorseStatusDto } from './dto/change-status.dto';
import { DeleteHorseDto } from './dto/delete-horse.dto';
import { RestoreHorseDto } from './dto/restore-horse.dto';
import { QueryDeletedHorseDto } from './dto/query-deleted-horse.dto';
import { assertStatusTransition } from './horse-rules';
import { PENDING_WORKOUT_STATUSES } from '../training/training-rules';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Thời gian (ms) cho phép bấm Hoàn tác sau khi xóa. FE hiện nút 10 giây; BE nới 60 giây cho mạng chậm. */

const UNDO_WINDOW_MS = 60 * 1000;

/** P1-08, P1-11: đổi trạng thái, ngừng quản lý / kích hoạt lại, xóa mềm, hoàn tác, khôi phục (FR-1.05 → FR-1.08, FR-1.20, FR-1.21). */
@Injectable()
export class HorseLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
  ) { }

  /**
   * Kết thúc phân bổ ô chuồng đang hiệu lực của ngựa và trả ô về AVAILABLE
   * (dùng khi Ngừng quản lý và khi Xóa hồ sơ). Trả về mã các ô đã trả.
   */
  private async releaseStalls(tx: Prisma.TransactionClient, horseId: string): Promise<string[]> {
    const active = await tx.stallAllocation.findMany({
      where: { horseId, isActive: true },
      include: { stall: { select: { id: true, code: true } } },
    });
    if (active.length === 0) return [];
    await tx.stallAllocation.updateMany({
      where: { horseId, isActive: true },
      data: { isActive: false, endDate: new Date() },
    });
    await tx.stall.updateMany({
      where: { id: { in: active.map((a) => a.stallId) } },
      data: { status: StallStatus.AVAILABLE },
    });
    return active.map((a) => a.stall.code);
  }

  /**
   * Xóa mềm hồ sơ ngựa (DL-1.10). Chỉ dùng khi hồ sơ tạo nhầm: ngựa chưa có dữ liệu ở Flow 2-5
   * và không đang Khóa huấn luyện. Hồ sơ không mất mà chuyển sang mục Hồ sơ đã xóa (SC-1.05).
   */
  async remove(id: string, dto: DeleteHorseDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id" = ${id} FOR UPDATE`;
      const horse = await tx.horse.findUnique({
        where: { id, deletedAt: null },
        include: {
          workoutSessions: { take: 1 },
          trainingPlans: { take: 1 },
          medicalRecords: { take: 1 },
          injuryLogs: { take: 1 },
          medicalLocks: { take: 1 },
          preventiveSchedules: { take: 1 },
          nutritionPlans: { take: 1 },
          dailyGroomingLogs: { take: 1 },
          tournamentRegistrations: { take: 1 },
          financialInvoices: { take: 1 },
        },
      });

      if (!horse) {
        throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse profile not found.');
      }

      const typed = dto.confirmName.trim().replace(/\s+/g, ' ').toLowerCase();
      if (typed !== horse.name.toLowerCase()) {
        throw apiError(HttpStatus.BAD_REQUEST, 'CONFIRM_NAME_MISMATCH', 'Tên nhập vào không khớp.');
      }

      if (horse.isMedicalLocked) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'HORSE_LOCKED',
          'Cannot delete horse profile while an active Medical Lock is in effect.',
        );
      }

      if (
        horse.workoutSessions.length > 0 ||
        horse.trainingPlans.length > 0 ||
        horse.medicalRecords.length > 0 ||
        horse.injuryLogs.length > 0 ||
        horse.medicalLocks.length > 0 ||
        horse.preventiveSchedules.length > 0 ||
        horse.nutritionPlans.length > 0 ||
        horse.dailyGroomingLogs.length > 0 ||
        horse.tournamentRegistrations.length > 0 ||
        horse.financialInvoices.length > 0
      ) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'HAS_DEPENDENT_DATA',
          'Ngựa đã phát sinh dữ liệu huấn luyện, y tế, chăm sóc hoặc thi đấu nên không thể xóa. Vui lòng dùng chức năng Ngừng quản lý.',
        );
      }

      const releasedStalls = await this.releaseStalls(tx, id);

      const deleted = await tx.horse.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: user.userId, deleteReason: dto.reason.trim() },
      });

      await this.auditService.record(
        { id: user.userId, name: user.fullName || user.email },
        'HORSE_DELETED',
        `Soft-deleted horse profile ${horse.name} (${horse.horseCode || horse.id}). Reason: ${dto.reason.trim()}`,
        horse.id,
        { entityName: 'Horse', newValues: { reason: dto.reason.trim(), releasedStalls } },
        tx,
      );

      return {
        success: true,
        id: deleted.id,
        name: deleted.name,
        deletedAt: deleted.deletedAt,
        message: `Đã xóa hồ sơ ngựa ${deleted.name}.`,
      };
    });
  }

  /** Danh sách hồ sơ đã xóa mềm (SC-1.05, chỉ CM). Mới xóa nhất lên trước. */
  async findDeleted(query: QueryDeletedHorseDto) {
    const { search, from, to, page = 1, limit = 20 } = query;

    const deletedAt: Prisma.DateTimeNullableFilter = { not: null };
    if (from) deletedAt.gte = new Date(from);
    // "Đến ngày" tính cả ngày đó: lấy < 0 giờ của ngày hôm sau.
    if (to) deletedAt.lt = new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000);

    const where: Prisma.HorseWhereInput = { deletedAt };
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { horseCode: { contains: q, mode: 'insensitive' } },
        { microchip: { contains: q } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.horse.findMany({
        where,
        orderBy: { deletedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { deletedBy: { select: { id: true, fullName: true } } },
      }),
      this.prisma.horse.count({ where }),
    ]);

    return {
      items: rows.map((h) => ({
        id: h.id,
        horseCode: h.horseCode,
        name: h.name,
        microchip: h.microchip,
        status: h.status,
        deletedAt: h.deletedAt,
        deletedBy: h.deletedBy ? { id: h.deletedBy.id, fullName: h.deletedBy.fullName } : null,
        deleteReason: h.deleteReason,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Khôi phục hồ sơ đã xóa (DL-1.11) hoặc Hoàn tác ngay sau khi xóa (undo = true).
   * Ngựa trở về trạng thái lúc bị xóa, chưa có ô chuồng.
   * Microchip/RFID là UNIQUE trong DB nên không thể bị hồ sơ khác chiếm; chỉ Tên có thể trùng.
   */
  async restore(id: string, dto: RestoreHorseDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id" = ${id} FOR UPDATE`;
      const horse = await tx.horse.findUnique({ where: { id } });
      if (!horse || !horse.deletedAt) {
        throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Không tìm thấy hồ sơ đã xóa.');
      }

      let reason: string;
      if (dto.undo) {
        const expired = Date.now() - horse.deletedAt.getTime() > UNDO_WINDOW_MS;
        if (expired || horse.deletedById !== user.userId) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            'UNDO_EXPIRED',
            'Đã hết thời gian hoàn tác. Hãy khôi phục trong mục Hồ sơ đã xóa.',
          );
        }
        reason = 'Hoàn tác thao tác xóa';
      } else {
        if (!dto.reason) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            'REASON_REQUIRED',
            'Lý do phải từ 10 đến 500 ký tự.',
          );
        }
        reason = dto.reason.trim();
      }

      const nameTaken = await tx.horse.findFirst({
        where: {
          id: { not: id },
          deletedAt: null,
          name: { equals: horse.name, mode: 'insensitive' },
        },
      });
      if (nameTaken) {
        throw apiError(
          HttpStatus.CONFLICT,
          'RESTORE_CONFLICT',
          `Không thể khôi phục vì Tên ngựa ${horse.name} đã được dùng cho ngựa khác. Hãy sửa hồ sơ đang dùng giá trị trùng rồi thử lại.`,
          { field: 'name', conflictHorseId: nameTaken.id },
        );
      }

      const restored = await tx.horse.update({
        where: { id },
        data: { deletedAt: null, deletedById: null, deleteReason: null },
      });

      await this.auditService.record(
        { id: user.userId, name: user.fullName || user.email },
        'HORSE_RESTORED',
        `Restored horse profile ${horse.name} (${horse.horseCode || horse.id}). Reason: ${reason}`,
        horse.id,
        {
          entityName: 'Horse',
          oldValues: { deletedAt: horse.deletedAt, deleteReason: horse.deleteReason },
          newValues: { reason, undo: Boolean(dto.undo) },
        },
        tx,
      );

      return {
        success: true,
        data: restored,
        message: `Đã khôi phục hồ sơ ngựa ${restored.name}.`,
      };
    });
  }

  /**
   * Đổi trạng thái ngựa theo bảng §4.2 (luật nằm ở horse-rules.ts).
   * Ngừng quản lý: trả ô chuồng; lý do Đã bán / Chuyển CLB thì kết thúc sở hữu;
   * lý do Đã chết khi đang khóa thì tự kết thúc Khóa huấn luyện.
   */
  async changeStatus(id: string, dto: ChangeHorseStatusDto, user: CurrentUserPayload) {
    const { updated, effects, oldStatus, horseName, previousOwnerId } =
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id" = ${id} FOR UPDATE`;
        const horse = await tx.horse.findUnique({ where: { id, deletedAt: null } });
        if (!horse) {
          throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse profile not found.');
        }

        assertStatusTransition({
          role: user.role,
          from: horse.status,
          to: dto.status,
          isMedicalLocked: horse.isMedicalLocked,
          reason: dto.reason,
          retireReason: dto.retireReason,
          currentRetireReason: horse.retireReason,
        });

        const effects: string[] = [];
        const data: Prisma.HorseUpdateInput = { status: dto.status };

        if (dto.status === HorseStatus.RETIRED) {
          data.retireReason = dto.retireReason;

          const stalls = await this.releaseStalls(tx, id);
          if (stalls.length > 0) effects.push(`Trả ô chuồng ${stalls.join(', ')}`);

          // Chỉ lý do Đã chết mới qua được luật khi đang khóa.
          if (horse.isMedicalLocked) {
            await tx.medicalLock.updateMany({
              where: { horseId: id, isLocked: true },
              data: {
                isLocked: false,
                unlockedAt: new Date(),
                unlockReason: 'Ngựa đã chết - tự kết thúc khi Ngừng quản lý',
              },
            });
            data.isMedicalLocked = false;
            effects.push('Kết thúc Khóa huấn luyện');
          }

          // Flow 2 §4.1: giáo án Nháp / Đang áp dụng tự hủy, buổi tập chưa diễn ra -> Đã hủy.
          const plans = await tx.trainingPlan.updateMany({
            where: { horseId: id, status: { in: [PlanStatus.DRAFT, PlanStatus.ACTIVE] } },
            data: { status: PlanStatus.CANCELLED, cancelReason: 'Ngựa ngừng quản lý' },
          });
          await tx.workoutSession.updateMany({
            where: { horseId: id, status: { in: PENDING_WORKOUT_STATUSES } },
            data: { status: WorkoutStatus.CANCELLED, statusReason: 'Ngựa ngừng quản lý' },
          });
          if (plans.count > 0)
            effects.push(`Hủy ${plans.count} giáo án và các buổi tập chưa diễn ra`);

          const ownershipEnds =
            dto.retireReason === RetireReason.SOLD || dto.retireReason === RetireReason.TRANSFERRED;
          if (ownershipEnds && horse.ownerId) {
            data.owner = { disconnect: true };
            effects.push('Kết thúc sở hữu của 1 chủ sở hữu');
          }
        } else if (horse.status === HorseStatus.RETIRED) {
          // Kích hoạt lại: về Nghỉ ngơi, chưa có ô chuồng và nhân viên chăm sóc.
          data.retireReason = null;
        }

        const updated = await tx.horse.update({ where: { id }, data });

        await this.auditService.record(
          { id: user.userId, name: user.fullName || user.email },
          'HORSE_STATUS_CHANGED',
          `Changed status of horse ${horse.name} from ${horse.status} to ${dto.status}. Reason: ${dto.reason || 'None specified'}`,
          horse.id,
          {
            entityName: 'Horse',
            oldValues: { oldStatus: horse.status, ownerId: horse.ownerId },
            newValues: {
              oldStatus: horse.status,
              newStatus: dto.status,
              reason: dto.reason ?? null,
              retireReason: dto.retireReason ?? null,
              effects,
            },
          },
          tx,
        );

        return {
          updated,
          effects,
          oldStatus: horse.status,
          horseName: horse.name,
          previousOwnerId: horse.ownerId,
        };
      });

    // Báo HT, chủ ngựa (kể cả chủ vừa bị bỏ khi bán/chuyển CLB) và groom đang chăm.
    const retired = dto.status === HorseStatus.RETIRED;
    const audience = await this.notifications.horseAudience(id, {
      roles: [Role.HEAD_TRAINER],
      owner: true,
      groom: true,
    });
    await this.notifications.notifyUsers(
      [...audience, previousOwnerId],
      {
        type: retired ? 'HORSE_RETIRED' : 'HORSE_STATUS_CHANGED',
        category: 'HORSE',
        title: retired ? 'Horse no longer managed' : 'Horse status changed',
        message: retired
          ? `${horseName} is no longer managed by the club (${dto.retireReason ?? 'retired'}).`
          : `${horseName}: ${oldStatus} → ${dto.status}.`,
        params: {
          horse: horseName,
          from: oldStatus,
          to: dto.status,
          reason: dto.retireReason ?? '',
        },
        link: `/horses/${id}`,
        senderName: user.fullName,
      },
      user.userId,
    );

    return {
      success: true,
      data: updated,
      oldStatus,
      effects,
      message: `Status successfully updated to ${dto.status}.`,
    };
  }
}
