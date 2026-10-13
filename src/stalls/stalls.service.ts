import { HttpStatus, Injectable } from '@nestjs/common';
import { HorseStatus, Prisma, Role, StallStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStallDto,
  CreateZoneDto,
  SetStallStatusDto,
  SetZoneStatusDto,
  SettableStallStatus,
  UpdateStallDto,
  UpdateZoneDto,
} from './dto/stall.dto';
import { AssignHorseDto } from './dto/assign-horse.dto';
import { TransferHorseDto } from './dto/transfer-horse.dto';
import { ReturnStallDto } from './dto/return-stall.dto';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/exceptions/api-error';

type Tx = Prisma.TransactionClient;

const STALL_INCLUDE = {
  zoneRef: { select: { id: true, code: true, name: true, rows: true, cols: true, isActive: true } },
  allocations: {
    where: { isActive: true },
    include: {
      horse: {
        select: {
          id: true,
          horseCode: true,
          name: true,
          status: true,
          isMedicalLocked: true,
        },
      },
      assignedGroom: { select: { id: true, fullName: true, email: true } },
    },
  },
} satisfies Prisma.StallInclude;

/** Mã khu sinh từ tên khu cũ (dữ liệu trước khi có bảng StallZone): "Zone A - Barn 1" -> "ZONE-A-BARN-1". */
function codeFromName(name: string): string {
  const code = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return code || 'ZONE';
}

/**
 * Flow 1 – SC-1.04 Sơ đồ chuồng, SC-1.07 Danh mục khu & ô chuồng, DL-1.02 / DL-1.03 Gán, chuyển, trả ô.
 * Không xóa cứng ô (Q-1.C): ô không dùng nữa chuyển sang Ngừng dùng (INACTIVE).
 */
@Injectable()
export class StallsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  private actor(user: CurrentUserPayload) {
    return { id: user.userId, name: user.fullName || user.email };
  }

  /**
   * Dữ liệu trước khi có bảng khu chỉ có Stall.zone (chuỗi). Lần đầu đọc thì tạo khu tương ứng và xếp
   * các ô vào lưới theo thứ tự mã ô. Chạy lại bao nhiêu lần cũng cho cùng kết quả.
   */
  async ensureZones(): Promise<void> {
    const orphans = await this.prisma.stall.findMany({
      where: { zoneId: null },
      orderBy: { code: 'asc' },
    });
    if (orphans.length === 0) return;

    const byZone = new Map<string, typeof orphans>();
    for (const s of orphans) byZone.set(s.zone, [...(byZone.get(s.zone) ?? []), s]);

    await this.prisma.$transaction(async (tx) => {
      for (const [name, stalls] of byZone) {
        const existing = await tx.stallZone.findFirst({
          where: { name: { equals: name, mode: 'insensitive' } },
        });
        if (existing) {
          // Khu đã có: gắn ô vào khu, chưa có vị trí trên lưới (CM xếp lại ở SC-1.07).
          await tx.stall.updateMany({
            where: { id: { in: stalls.map((s) => s.id) } },
            data: { zoneId: existing.id, zone: existing.name },
          });
          continue;
        }
        let code = codeFromName(name);
        for (let i = 2; await tx.stallZone.findUnique({ where: { code } }); i++) {
          code = `${codeFromName(name).slice(0, 17)}-${i}`;
        }
        const cols = Math.min(stalls.length, 6);
        const zone = await tx.stallZone.create({
          data: { code, name, cols, rows: Math.ceil(stalls.length / cols) },
        });
        for (const [i, s] of stalls.entries()) {
          await tx.stall.update({
            where: { id: s.id },
            data: { zoneId: zone.id, row: Math.floor(i / cols) + 1, col: (i % cols) + 1 },
          });
        }
      }
    });
  }

  // ------------------------------------------------------------------ Khu chuồng

  /** Danh sách khu kèm số ô, số ô có ngựa (SC-1.07; dropdown khu ở SC-1.04). */
  async listZones(query: { includeInactive?: string } = {}) {
    await this.ensureZones();
    const zones = await this.prisma.stallZone.findMany({
      where: query.includeInactive === 'true' ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { stalls: { select: { status: true } } },
    });
    return zones.map(({ stalls, ...z }) => ({
      ...z,
      stallCount: stalls.filter((s) => s.status !== StallStatus.INACTIVE).length,
      occupiedCount: stalls.filter((s) => s.status === StallStatus.OCCUPIED).length,
    }));
  }

  async createZone(dto: CreateZoneDto, user: CurrentUserPayload) {
    await this.assertZoneUnique(dto.code, dto.name);
    const zone = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stallZone.create({
        data: {
          code: dto.code,
          name: dto.name,
          rows: dto.rows,
          cols: dto.cols,
          description: dto.description || null,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      if (dto.autoCreateStalls) {
        const data: Prisma.StallCreateManyInput[] = [];
        for (let r = 1; r <= dto.rows; r++) {
          for (let c = 1; c <= dto.cols; c++) {
            const n = (r - 1) * dto.cols + c;
            data.push({
              code: `${dto.code}-${String(n).padStart(2, '0')}`,
              zone: created.name,
              zoneId: created.id,
              row: r,
              col: c,
            });
          }
        }
        const taken = await tx.stall.findFirst({
          where: { code: { in: data.map((d) => d.code) } },
        });
        if (taken) {
          throw apiError(
            HttpStatus.CONFLICT,
            'DUPLICATE_STALL_CODE',
            `Mã ô ${taken.code} đã tồn tại. Bỏ chọn "Tự tạo ô" hoặc đổi mã khu.`,
          );
        }
        await tx.stall.createMany({ data });
      }
      return created;
    });
    await this.auditService.record(
      this.actor(user),
      'CREATE_STALL_ZONE',
      `Created stall zone ${zone.code}`,
      zone.id,
      {
        entityName: 'StallZone',
        newValues: { ...zone, autoCreateStalls: !!dto.autoCreateStalls },
      },
    );
    return zone;
  }

  async updateZone(id: string, dto: UpdateZoneDto, user: CurrentUserPayload) {
    const zone = await this.findZoneOrThrow(id);
    if (dto.name && dto.name.toLowerCase() !== zone.name.toLowerCase()) {
      await this.assertZoneUnique(undefined, dto.name, id);
    }
    const used = await this.prisma.stall.aggregate({
      where: { zoneId: id },
      _max: { row: true, col: true },
    });
    const maxRow = used._max.row ?? 0;
    const maxCol = used._max.col ?? 0;
    if (dto.rows !== undefined && dto.rows < maxRow) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'ZONE_ROWS_TOO_SMALL',
        `Số hàng không được nhỏ hơn ${maxRow} vì đã có ô chuồng ở hàng ${maxRow}.`,
        { min: maxRow },
      );
    }
    if (dto.cols !== undefined && dto.cols < maxCol) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'ZONE_COLS_TOO_SMALL',
        `Số cột không được nhỏ hơn ${maxCol} vì đã có ô chuồng ở cột ${maxCol}.`,
        { min: maxCol },
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const z = await tx.stallZone.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.rows !== undefined && { rows: dto.rows }),
          ...(dto.cols !== undefined && { cols: dto.cols }),
          ...(dto.description !== undefined && { description: dto.description || null }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        },
      });
      if (z.name !== zone.name) {
        await tx.stall.updateMany({ where: { zoneId: id }, data: { zone: z.name } });
      }
      return z;
    });
    await this.auditService.record(
      this.actor(user),
      'UPDATE_STALL_ZONE',
      `Updated stall zone ${zone.code}`,
      id,
      {
        entityName: 'StallZone',
        oldValues: zone,
        newValues: updated,
      },
    );
    return updated;
  }

  /** BTN-1.32: Ngừng dùng khu bị chặn khi khu còn ngựa. */
  async setZoneStatus(id: string, dto: SetZoneStatusDto, user: CurrentUserPayload) {
    const zone = await this.findZoneOrThrow(id);
    if (!dto.isActive) {
      const horses = await this.prisma.stallAllocation.count({
        where: { isActive: true, stall: { zoneId: id } },
      });
      if (horses > 0) {
        throw apiError(
          HttpStatus.CONFLICT,
          'ZONE_HAS_HORSES',
          `Khu còn ${horses} ngựa. Vui lòng chuyển hết ngựa trước.`,
          { count: horses },
        );
      }
    }
    const updated = await this.prisma.stallZone.update({
      where: { id },
      data: { isActive: dto.isActive },
    });
    await this.auditService.record(
      this.actor(user),
      dto.isActive ? 'ACTIVATE_STALL_ZONE' : 'DEACTIVATE_STALL_ZONE',
      `${dto.isActive ? 'Activated' : 'Deactivated'} stall zone ${zone.code}`,
      id,
      {
        entityName: 'StallZone',
        oldValues: { isActive: zone.isActive },
        newValues: { isActive: dto.isActive },
      },
    );
    return updated;
  }

  // ------------------------------------------------------------------ Ô chuồng

  /**
   * Danh sách ô. Mặc định bỏ ô Ngừng dùng (sơ đồ SC-1.04 không hiện); SC-1.07 truyền includeInactive=true.
   */
  async findAll(query: {
    zone?: string;
    zoneId?: string;
    status?: string;
    search?: string;
    includeInactive?: string;
  }) {
    await this.ensureZones();
    const where: Prisma.StallWhereInput = {};
    if (query.zoneId) where.zoneId = query.zoneId;
    if (query.zone) where.zone = query.zone;
    if (query.status && (Object.values(StallStatus) as string[]).includes(query.status)) {
      where.status = query.status as StallStatus;
    } else if (query.includeInactive !== 'true') {
      where.status = { not: StallStatus.INACTIVE };
    }
    const term = query.search?.trim();
    if (term) {
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { zone: { contains: term, mode: 'insensitive' } },
        {
          allocations: {
            some: {
              isActive: true,
              horse: {
                OR: [
                  { name: { contains: term, mode: 'insensitive' } },
                  { horseCode: { contains: term, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ];
    }
    return this.prisma.stall.findMany({
      where,
      include: STALL_INCLUDE,
      orderBy: [{ zone: 'asc' }, { row: 'asc' }, { col: 'asc' }, { code: 'asc' }],
    });
  }

  async create(dto: CreateStallDto, user: CurrentUserPayload) {
    const zone = await this.findZoneOrThrow(dto.zoneId);
    if (!zone.isActive) {
      throw apiError(HttpStatus.BAD_REQUEST, 'ZONE_INACTIVE', 'Khu chuồng đang ngừng dùng.');
    }
    await this.assertStallCodeFree(dto.code);
    await this.assertPositionFree(zone, dto.row, dto.col);

    const stall = await this.prisma.stall.create({
      data: {
        code: dto.code,
        zone: zone.name,
        zoneId: zone.id,
        row: dto.row,
        col: dto.col,
        status: dto.status ?? StallStatus.AVAILABLE,
        notes: dto.notes || null,
      },
      include: STALL_INCLUDE,
    });
    await this.auditService.record(
      this.actor(user),
      'CREATE_STALL',
      `Created stall ${stall.code}`,
      stall.id,
      {
        entityName: 'Stall',
        newValues: {
          code: stall.code,
          zone: zone.code,
          row: stall.row,
          col: stall.col,
          status: stall.status,
        },
      },
    );
    return stall;
  }

  async update(id: string, dto: UpdateStallDto, user: CurrentUserPayload) {
    const stall = await this.findStallOrThrow(id);
    if (dto.code && dto.code !== stall.code) await this.assertStallCodeFree(dto.code);
    const row = dto.row ?? stall.row;
    const col = dto.col ?? stall.col;
    if (stall.zoneRef && row != null && col != null && (row !== stall.row || col !== stall.col)) {
      await this.assertPositionFree(stall.zoneRef, row, col, id);
    }
    const status = dto.status ? this.nextStatus(stall, dto.status) : undefined;

    const updated = await this.prisma.stall.update({
      where: { id },
      data: {
        ...(dto.code && { code: dto.code }),
        ...(dto.row !== undefined && { row: dto.row }),
        ...(dto.col !== undefined && { col: dto.col }),
        ...(status && { status }),
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
      },
      include: STALL_INCLUDE,
    });
    await this.auditService.record(
      this.actor(user),
      'UPDATE_STALL',
      `Updated stall ${stall.code}`,
      id,
      {
        entityName: 'Stall',
        oldValues: {
          code: stall.code,
          row: stall.row,
          col: stall.col,
          status: stall.status,
          notes: stall.notes,
        },
        newValues: {
          code: updated.code,
          row: updated.row,
          col: updated.col,
          status: updated.status,
          notes: updated.notes,
        },
      },
    );
    return updated;
  }

  /** BTN-1.35 Đổi trạng thái ô: Hoạt động / Bảo trì / Ngừng dùng. */
  async setStatus(id: string, dto: SetStallStatusDto, user: CurrentUserPayload) {
    return this.update(id, { status: dto.status }, user);
  }

  /** "Hoạt động" giữ OCCUPIED nếu ô đang có ngựa; ô có ngựa không được Bảo trì / Ngừng dùng. */
  private nextStatus(
    stall: { code: string; status: StallStatus; allocations: { horse: { name: string } }[] },
    wanted: SettableStallStatus,
  ): StallStatus {
    const occupant = stall.allocations[0]?.horse;
    if (occupant) {
      if (wanted !== 'AVAILABLE') {
        throw apiError(
          HttpStatus.CONFLICT,
          'STALL_OCCUPIED',
          `Ô chuồng đang có ngựa ${occupant.name}. Vui lòng chuyển ngựa trước.`,
          { horseName: occupant.name },
        );
      }
      return StallStatus.OCCUPIED;
    }
    return wanted as StallStatus;
  }

  // ------------------------------------------------------------------ Gán / chuyển / trả ô

  /** Ô nhận ngựa phải đang Hoạt động, còn trống, thuộc khu đang dùng. Gọi sau khi đã khóa dòng ô. */
  private async assertStallReady(tx: Tx, stallId: string) {
    const stall = await tx.stall.findUnique({ where: { id: stallId }, include: STALL_INCLUDE });
    if (!stall) throw apiError(HttpStatus.NOT_FOUND, 'STALL_NOT_FOUND', 'Không tìm thấy ô chuồng.');
    const occupant = stall.allocations[0]?.horse;
    if (occupant) {
      throw apiError(
        HttpStatus.CONFLICT,
        'STALL_OCCUPIED',
        `Ô chuồng ${stall.code} đang có ngựa ${occupant.name}.`,
        { stallCode: stall.code, horseName: occupant.name },
      );
    }
    if (
      stall.status === StallStatus.MAINTENANCE ||
      stall.status === StallStatus.INACTIVE ||
      stall.zoneRef?.isActive === false
    ) {
      throw apiError(
        HttpStatus.CONFLICT,
        'STALL_UNAVAILABLE',
        `Ô chuồng ${stall.code} đang bảo trì hoặc ngừng sử dụng.`,
        { stallCode: stall.code },
      );
    }
    return stall;
  }

  private async assertGroom(tx: Tx, groomId?: string) {
    if (!groomId) return;
    const groom = await tx.user.findUnique({ where: { id: groomId } });
    if (!groom || groom.role !== Role.GROOM || groom.status !== UserStatus.ACTIVE) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_GROOM',
        'Người chăm sóc phải là nhân viên Groom đang hoạt động.',
      );
    }
  }

  async assignHorse(stallId: string, dto: AssignHorseDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      // Khóa dòng ô và dòng ngựa: 2 người gán cùng lúc thì người sau chờ và thấy ô đã có ngựa.
      await tx.$queryRaw`SELECT "id" FROM "Stall" WHERE "id" = ${stallId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id" = ${dto.horseId} FOR UPDATE`;
      const stall = await this.assertStallReady(tx, stallId);

      const horse = await tx.horse.findUnique({
        where: { id: dto.horseId, deletedAt: null },
        include: { stallAllocations: { where: { isActive: true }, include: { stall: true } } },
      });
      if (!horse)
        throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Không tìm thấy hồ sơ ngựa.');
      if (horse.status === HorseStatus.RETIRED) {
        throw apiError(HttpStatus.BAD_REQUEST, 'HORSE_RETIRED', 'Ngựa đã ngừng quản lý.');
      }
      const current = horse.stallAllocations[0];
      if (current) {
        throw apiError(
          HttpStatus.CONFLICT,
          'HORSE_HAS_STALL',
          `Ngựa đang ở ô chuồng ${current.stall.code}. Vui lòng dùng chức năng Chuyển ô chuồng.`,
          { stallCode: current.stall.code },
        );
      }
      await this.assertGroom(tx, dto.assignedGroomUserId);

      const allocation = await tx.stallAllocation.create({
        data: {
          stallId,
          horseId: dto.horseId,
          assignedGroomUserId: dto.assignedGroomUserId,
          isActive: true,
        },
      });
      await tx.stall.update({ where: { id: stallId }, data: { status: StallStatus.OCCUPIED } });

      await this.auditService.record(
        this.actor(user),
        'ASSIGN_HORSE',
        `Assigned horse ${horse.name} to stall ${stall.code}`,
        allocation.id,
        { entityName: 'StallAllocation', newValues: { ...allocation, notes: dto.notes } },
        tx,
      );
      return { ...allocation, stallCode: stall.code, horseName: horse.name };
    });
  }

  async transferHorse(allocationId: string, dto: TransferHorseDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "StallAllocation" WHERE "id" = ${allocationId} FOR UPDATE`;
      const old = await tx.stallAllocation.findUnique({
        where: { id: allocationId },
        include: { stall: true, horse: true },
      });
      if (!old || !old.isActive) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          'ALLOCATION_NOT_FOUND',
          'Ngựa không còn ở ô chuồng này. Vui lòng tải lại.',
        );
      }
      if (dto.newStallId === old.stallId) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'SAME_STALL',
          'Vui lòng chọn ô chuồng khác ô hiện tại.',
        );
      }
      await tx.$queryRaw`SELECT "id" FROM "Stall" WHERE "id" = ${dto.newStallId} FOR UPDATE`;
      const target = await this.assertStallReady(tx, dto.newStallId);
      await this.assertGroom(tx, dto.assignedGroomUserId);

      const now = new Date();
      await tx.stallAllocation.update({
        where: { id: allocationId },
        data: { isActive: false, endDate: now },
      });
      await tx.stall.update({
        where: { id: old.stallId },
        data: { status: StallStatus.AVAILABLE },
      });
      const created = await tx.stallAllocation.create({
        data: {
          stallId: dto.newStallId,
          horseId: old.horseId,
          assignedGroomUserId: dto.assignedGroomUserId || old.assignedGroomUserId,
          startDate: now,
          isActive: true,
        },
      });
      await tx.stall.update({
        where: { id: dto.newStallId },
        data: { status: StallStatus.OCCUPIED },
      });

      await this.auditService.record(
        this.actor(user),
        'TRANSFER_HORSE',
        `Moved horse ${old.horse.name} from stall ${old.stall.code} to ${target.code}`,
        created.id,
        {
          entityName: 'StallAllocation',
          oldValues: { stallId: old.stallId, stallCode: old.stall.code },
          newValues: { stallId: target.id, stallCode: target.code, notes: dto.notes },
        },
        tx,
      );
      return {
        ...created,
        fromStallCode: old.stall.code,
        stallCode: target.code,
        horseName: old.horse.name,
      };
    });
  }

  async returnStall(allocationId: string, dto: ReturnStallDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "StallAllocation" WHERE "id" = ${allocationId} FOR UPDATE`;
      const old = await tx.stallAllocation.findUnique({
        where: { id: allocationId },
        include: { stall: true, horse: true },
      });
      if (!old || !old.isActive) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          'ALLOCATION_NOT_FOUND',
          'Ngựa không còn ở ô chuồng này. Vui lòng tải lại.',
        );
      }
      await tx.stallAllocation.update({
        where: { id: allocationId },
        data: { isActive: false, endDate: new Date() },
      });
      await tx.stall.update({
        where: { id: old.stallId },
        data: { status: StallStatus.AVAILABLE },
      });

      await this.auditService.record(
        this.actor(user),
        'RETURN_STALL',
        `Horse ${old.horse.name} left stall ${old.stall.code}`,
        allocationId,
        {
          entityName: 'StallAllocation',
          oldValues: { isActive: true },
          newValues: { isActive: false, notes: dto?.notes },
        },
        tx,
      );
      return { success: true, stallCode: old.stall.code, horseName: old.horse.name };
    });
  }

  /** Groom đang hoạt động để chọn khi gán ô (DL-1.02), kèm số ngựa đang phụ trách. */
  async listGrooms() {
    const grooms = await this.prisma.user.findMany({
      where: { role: Role.GROOM, status: UserStatus.ACTIVE },
      select: {
        id: true,
        fullName: true,
        email: true,
        _count: { select: { stallAllocations: { where: { isActive: true } } } },
      },
      orderBy: { fullName: 'asc' },
    });
    return grooms.map(({ _count, ...g }) => ({ ...g, horseCount: _count.stallAllocations }));
  }

  // ------------------------------------------------------------------ Kiểm tra chung

  private async findZoneOrThrow(id: string) {
    const zone = await this.prisma.stallZone.findUnique({ where: { id } });
    if (!zone) throw apiError(HttpStatus.NOT_FOUND, 'ZONE_NOT_FOUND', 'Không tìm thấy khu chuồng.');
    return zone;
  }

  private async findStallOrThrow(id: string) {
    const stall = await this.prisma.stall.findUnique({ where: { id }, include: STALL_INCLUDE });
    if (!stall) throw apiError(HttpStatus.NOT_FOUND, 'STALL_NOT_FOUND', 'Không tìm thấy ô chuồng.');
    return stall;
  }

  private async assertZoneUnique(code?: string, name?: string, exceptId?: string) {
    const notSelf = exceptId ? { id: { not: exceptId } } : {};
    if (code && (await this.prisma.stallZone.findFirst({ where: { code, ...notSelf } }))) {
      throw apiError(HttpStatus.CONFLICT, 'DUPLICATE_ZONE_CODE', 'Mã khu đã tồn tại.');
    }
    if (
      name &&
      (await this.prisma.stallZone.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, ...notSelf },
      }))
    ) {
      throw apiError(HttpStatus.CONFLICT, 'DUPLICATE_ZONE_NAME', 'Tên khu đã tồn tại.');
    }
  }

  private async assertStallCodeFree(code: string) {
    if (await this.prisma.stall.findUnique({ where: { code } })) {
      throw apiError(HttpStatus.CONFLICT, 'DUPLICATE_STALL_CODE', 'Mã ô đã tồn tại.');
    }
  }

  private async assertPositionFree(
    zone: { id: string; rows: number; cols: number },
    row: number,
    col: number,
    exceptId?: string,
  ) {
    if (row > zone.rows) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'ROW_OUT_OF_RANGE',
        `Hàng phải từ 1 đến ${zone.rows}.`,
        {
          max: zone.rows,
        },
      );
    }
    if (col > zone.cols) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'COL_OUT_OF_RANGE',
        `Cột phải từ 1 đến ${zone.cols}.`,
        {
          max: zone.cols,
        },
      );
    }
    const other = await this.prisma.stall.findFirst({
      where: { zoneId: zone.id, row, col, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (other) {
      throw apiError(
        HttpStatus.CONFLICT,
        'POSITION_TAKEN',
        `Vị trí Hàng ${row} – Cột ${col} đã có ô ${other.code}.`,
        { stallCode: other.code },
      );
    }
  }
}
