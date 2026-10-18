import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import {
  AssignShiftRosterDto,
  CopyWeekRosterDto,
  QueryShiftRosterDto,
} from './dto/shift-roster.dto';

function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return date;
}

function getMondayOfDate(d: Date): Date {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

@Injectable()
export class ShiftRostersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * SC-4.01 Danh sách phân ca theo khoảng ngày và khu.
   */
  async findAll(query: QueryShiftRosterDto) {
    const where: Prisma.ShiftRosterWhereInput = {};

    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = parseDateOnly(query.startDate);
      if (query.endDate) where.date.lte = parseDateOnly(query.endDate);
    }

    if (query.zoneId) where.zoneId = query.zoneId;
    if (query.groomUserId) where.groomUserId = query.groomUserId;

    return this.prisma.shiftRoster.findMany({
      where,
      include: {
        shift: true,
        zone: true,
        groom: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phoneNumber: true,
            status: true,
            role: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: [{ date: 'asc' }, { shift: { sortOrder: 'asc' } }],
    });
  }

  /**
   * SC-4.01 / SC-4.05 View Mobile: Ca trực của tôi (Groom).
   */
  async getMyShifts(currentUser: CurrentUserPayload, query: QueryShiftRosterDto) {
    const where: Prisma.ShiftRosterWhereInput = {
      groomUserId: currentUser.userId,
    };

    if (query.zoneId) {
      where.zoneId = query.zoneId;
    }

    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = parseDateOnly(query.startDate);
      if (query.endDate) where.date.lte = parseDateOnly(query.endDate);
    }

    const rosters = await this.prisma.shiftRoster.findMany({
      where,
      include: {
        shift: true,
        zone: {
          include: {
            stalls: {
              where: { status: { not: 'INACTIVE' } },
              include: {
                allocations: {
                  where: { isActive: true },
                  include: {
                    horse: {
                      select: {
                        id: true,
                        name: true,
                        horseCode: true,
                        status: true,
                        isMedicalLocked: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { shift: { sortOrder: 'asc' } }],
    });

    return rosters.map((r) => {
      const assignedHorses = r.zone.stalls.flatMap((s) => s.allocations.map((a) => a.horse));
      return {
        id: r.id,
        date: r.date,
        shift: r.shift,
        zone: {
          id: r.zone.id,
          code: r.zone.code,
          name: r.zone.name,
        },
        notes: r.notes,
        assignedHorsesCount: assignedHorses.length,
        assignedHorses,
      };
    });
  }

  /**
   * BTN-4.04 / DL-4.01 Phân ca cho một ô (Ngày x Ca x Khu).
   */
  async assignSlot(dto: AssignShiftRosterDto, currentUser: CurrentUserPayload) {
    const shift = await this.prisma.shiftCatalog.findUnique({
      where: { id: dto.shiftId },
    });
    if (!shift || !shift.isActive) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'SHIFT_NOT_AVAILABLE',
        'Ca trực không tồn tại hoặc đã ngừng dùng.',
      );
    }

    const zone = await this.prisma.stallZone.findUnique({
      where: { id: dto.zoneId },
    });
    if (!zone || !zone.isActive) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'ZONE_NOT_AVAILABLE',
        'Khu chuồng không tồn tại hoặc đã ngừng dùng.',
      );
    }

    // Kiểm tra nhân viên Groom hợp lệ
    const uniqueGroomIds = Array.from(new Set(dto.groomUserIds));
    if (uniqueGroomIds.length > 0) {
      const grooms = await this.prisma.user.findMany({
        where: {
          id: { in: uniqueGroomIds },
          role: Role.GROOM,
          status: UserStatus.ACTIVE,
        },
      });

      if (grooms.length !== uniqueGroomIds.length) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'INVALID_GROOMS_SELECTED',
          'Một hoặc nhiều nhân viên không hợp lệ hoặc không ở trạng thái hoạt động.',
        );
      }
    }

    // Tính toán các ngày cần phân công dựa trên applyScope
    const baseDate = parseDateOnly(dto.date);
    const targetDates: Date[] = [];

    const scope = dto.applyScope || 'ONLY_THIS_DAY';
    if (scope === 'ONLY_THIS_DAY') {
      targetDates.push(baseDate);
    } else if (scope === 'REST_OF_WEEK') {
      const currentDay = baseDate.getUTCDay(); // 0 is Sunday, 1 is Monday
      const daysToSunday = currentDay === 0 ? 0 : 7 - currentDay;
      for (let i = 0; i <= daysToSunday; i++) {
        const nextDate = new Date(baseDate);
        nextDate.setUTCDate(baseDate.getUTCDate() + i);
        targetDates.push(nextDate);
      }
    } else if (scope === 'SAME_DAY_4_WEEKS') {
      for (let w = 0; w < 4; w++) {
        const nextDate = new Date(baseDate);
        nextDate.setUTCDate(baseDate.getUTCDate() + w * 7);
        targetDates.push(nextDate);
      }
    }

    // Thực hiện trong transaction
    await this.prisma.$transaction(async (tx) => {
      for (const tDate of targetDates) {
        // Xóa phân công cũ của ô này (tDate, shiftId, zoneId)
        await tx.shiftRoster.deleteMany({
          where: {
            date: tDate,
            shiftId: dto.shiftId,
            zoneId: dto.zoneId,
          },
        });

        // Tạo mới phân công cho danh sách groom
        if (uniqueGroomIds.length > 0) {
          await tx.shiftRoster.createMany({
            data: uniqueGroomIds.map((gId) => ({
              date: tDate,
              shiftId: dto.shiftId,
              zoneId: dto.zoneId,
              groomUserId: gId,
              notes: dto.notes?.trim() || null,
              createdById: currentUser.userId,
            })),
          });
        }
      }
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      'SHIFT_ROSTER_ASSIGNED',
      `Phân ca trực ${shift.name} tại ${zone.name} ngày ${dto.date}`,
      null,
      {
        entityName: 'ShiftRoster',
        newValues: {
          date: dto.date,
          shiftCode: shift.code,
          zoneCode: zone.code,
          scope,
          groomCount: uniqueGroomIds.length,
        },
      },
    );

    return {
      success: true,
      affectedDatesCount: targetDates.length,
      groomCount: uniqueGroomIds.length,
    };
  }

  /**
   * Xóa một dòng phân công.
   */
  async delete(id: string, currentUser: CurrentUserPayload) {
    const existing = await this.prisma.shiftRoster.findUnique({
      where: { id },
    });
    if (!existing) {
      throw apiError(HttpStatus.NOT_FOUND, 'ROSTER_NOT_FOUND', 'Bản ghi phân ca không tồn tại.');
    }

    await this.prisma.shiftRoster.delete({
      where: { id },
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      'SHIFT_ROSTER_REMOVED',
      `Xóa phân công ca trực ID ${id}`,
      id,
      { entityName: 'ShiftRoster' },
    );

    return { success: true };
  }

  /**
   * BTN-4.05 / DL-4.02 Sao chép phân ca tuần.
   */
  async copyWeek(dto: CopyWeekRosterDto, currentUser: CurrentUserPayload) {
    const sourceMonday = parseDateOnly(dto.sourceWeekStart);
    const targetMonday = parseDateOnly(dto.targetWeekStart);

    // Không thể sao chép vào tuần đã qua
    const currentMonday = getMondayOfDate(new Date());
    if (targetMonday < currentMonday) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'COPY_TARGET_WEEK_IN_PAST',
        'Không thể sao chép vào tuần đã qua.',
      );
    }

    const sourceSunday = new Date(sourceMonday);
    sourceSunday.setUTCDate(sourceMonday.getUTCDate() + 6);

    const targetSunday = new Date(targetMonday);
    targetSunday.setUTCDate(targetMonday.getUTCDate() + 6);

    // Lấy toàn bộ phân ca của tuần nguồn
    const sourceRosters = await this.prisma.shiftRoster.findMany({
      where: {
        date: {
          gte: sourceMonday,
          lte: sourceSunday,
        },
      },
    });

    if (sourceRosters.length === 0) {
      return { copiedCount: 0, skippedInactiveGrooms: 0 };
    }

    // Danh sách Groom ACTIVE hiện tại
    const activeGrooms = await this.prisma.user.findMany({
      where: {
        role: Role.GROOM,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    const activeGroomIds = new Set(activeGrooms.map((g) => g.id));

    let copiedCount = 0;
    let skippedInactiveGrooms = 0;

    const diffDays = Math.round(
      (targetMonday.getTime() - sourceMonday.getTime()) / (1000 * 60 * 60 * 24),
    );

    await this.prisma.$transaction(async (tx) => {
      // Nếu chọn ghi đè: xóa toàn bộ phân ca của tuần đích
      if (dto.overwrite) {
        await tx.shiftRoster.deleteMany({
          where: {
            date: {
              gte: targetMonday,
              lte: targetSunday,
            },
          },
        });
      }

      for (const s of sourceRosters) {
        if (!activeGroomIds.has(s.groomUserId)) {
          skippedInactiveGrooms++;
          continue;
        }

        const newDate = new Date(s.date);
        newDate.setUTCDate(s.date.getUTCDate() + diffDays);

        if (!dto.overwrite) {
          const exists = await tx.shiftRoster.findUnique({
            where: {
              date_shiftId_zoneId_groomUserId: {
                date: newDate,
                shiftId: s.shiftId,
                zoneId: s.zoneId,
                groomUserId: s.groomUserId,
              },
            },
          });
          if (exists) {
            continue;
          }
        }

        await tx.shiftRoster.create({
          data: {
            date: newDate,
            shiftId: s.shiftId,
            zoneId: s.zoneId,
            groomUserId: s.groomUserId,
            notes: s.notes,
            createdById: currentUser.userId,
          },
        });
        copiedCount++;
      }
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      'SHIFT_ROSTER_WEEK_COPIED',
      `Sao chép phân ca từ tuần ${dto.sourceWeekStart} sang tuần ${dto.targetWeekStart}`,
      null,
      {
        entityName: 'ShiftRoster',
        newValues: {
          sourceWeekStart: dto.sourceWeekStart,
          targetWeekStart: dto.targetWeekStart,
          copiedCount,
          skippedInactiveGrooms,
          overwrite: dto.overwrite,
        },
      },
    );

    return {
      copiedCount,
      skippedInactiveGrooms,
    };
  }
}
