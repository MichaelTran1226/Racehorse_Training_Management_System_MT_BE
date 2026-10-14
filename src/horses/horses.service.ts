import { HttpStatus, Injectable } from '@nestjs/common';
import {
  HorseCatalogType,
  HorseStatus,
  PlanStatus,
  Prisma,
  RetireReason,
  Role,
  StallStatus,
  UserStatus,
  WorkoutStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CounterService } from '../audit/counter.service';
import { HorseCatalogsService } from '../horse-catalogs/horse-catalogs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { apiError } from '../common/exceptions/api-error';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateHorseDto } from './dto/create-horse.dto';
import { UpdateHorseDto } from './dto/update-horse.dto';
import { QueryHorseDto } from './dto/query-horse.dto';
import { ChangeHorseStatusDto } from './dto/change-status.dto';
import { TransferHorseOwnerDto } from './dto/transfer-owner.dto';
import { DeleteHorseDto } from './dto/delete-horse.dto';
import { RestoreHorseDto } from './dto/restore-horse.dto';
import { QueryDeletedHorseDto } from './dto/query-deleted-horse.dto';
import { assertStatusTransition } from './horse-rules';
import { PENDING_WORKOUT_STATUSES } from '../training/training-rules';

/** Thời gian (ms) cho phép bấm Hoàn tác sau khi xóa. FE hiện nút 10 giây; BE nới 60 giây cho mạng chậm. */
const UNDO_WINDOW_MS = 60 * 1000;

@Injectable()
export class HorsesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly counter: CounterService,
    private readonly catalogs: HorseCatalogsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Sinh mã ngựa HR-XXXXXX từ bảng Counter (tăng nguyên tử nên 2 người tạo cùng lúc không trùng mã).
   * Dữ liệu cũ sinh mã bằng "đếm + 1" nên bộ đếm có thể đi sau: gặp mã đã có thì lấy số tiếp theo.
   */
  async generateHorseCode(): Promise<string> {
    for (;;) {
      const candidate = `HR-${String(await this.counter.next('horse_code')).padStart(6, '0')}`;
      const taken = await this.prisma.horse.findUnique({ where: { horseCode: candidate } });
      if (!taken) return candidate;
    }
  }

  /**
   * Tự sinh số microchip 15 chữ số theo chuẩn ISO (bắt đầu bằng 985 + 12 số ngẫu nhiên).
   */
  async generateMicrochip(): Promise<string> {
    for (let attempts = 0; attempts < 100; attempts++) {
      const random12 = Math.floor(Math.random() * 1e12)
        .toString()
        .padStart(12, '0');
      const candidate = `985${random12}`;
      const exists = await this.prisma.horse.findFirst({
        where: { OR: [{ microchip: candidate }, { microchipRfid: candidate }] },
      });
      if (!exists) return candidate;
    }
    return `985${Date.now().toString().slice(-12)}`;
  }

  /**
   * Tự sinh mã thẻ RFID (dạng RFID-XXXXXXXX).
   */
  async generateRfid(): Promise<string> {
    for (let attempts = 0; attempts < 100; attempts++) {
      const randStr = Math.random().toString(36).substring(2, 8).toUpperCase();
      const numStr = Math.floor(1000 + Math.random() * 9000).toString();
      const candidate = `RFID-${randStr}${numStr}`;
      const exists = await this.prisma.horse.findFirst({
        where: { OR: [{ rfid: candidate }, { microchipRfid: candidate }] },
      });
      if (!exists) return candidate;
    }
    return `RFID-${Date.now().toString(36).toUpperCase()}`;
  }

  /**
   * Che giấu số microchip với vai trò GROOM (chỉ hiển thị 4 số cuối).
   */
  private maskMicrochip(chip?: string | null): string | null {
    if (!chip) return null;
    if (chip.length <= 4) return '****';
    return '*'.repeat(chip.length - 4) + chip.slice(-4);
  }

  /**
   * Áp dụng chính sách bảo mật dữ liệu và che giấu trường nhạy cảm theo vai trò người dùng.
   */
  private applyRolePolicy(horse: any, user: CurrentUserPayload): any {
    if (!horse) return horse;
    const cloned = { ...horse };

    // 1. Che giấu số microchip nếu là GROOM
    if (user.role === UserRole.GROOM) {
      if (cloned.microchip) {
        cloned.microchip = this.maskMicrochip(cloned.microchip);
      }
      if (cloned.microchipRfid) {
        cloned.microchipRfid = this.maskMicrochip(cloned.microchipRfid);
      }
    }

    // 2. Ẩn thông tin ô chuồng và người chăm sóc đối với HORSE_OWNER (Flow 1 Section 2)
    if (user.role === UserRole.HORSE_OWNER) {
      delete cloned.stallAllocations;
      cloned.stallCode = null;
      cloned.zone = null;
      cloned.primaryGroom = null;
    } else if (cloned.stallAllocations && cloned.stallAllocations.length > 0) {
      const activeStall = cloned.stallAllocations.find((a: any) => a.isActive !== false);
      // Tab 2 cần id phân bổ để Chuyển / Trả ô (BTN-1.14, BTN-1.15).
      cloned.allocationId = activeStall?.id ?? null;
      cloned.stallId = activeStall?.stallId ?? activeStall?.stall?.id ?? null;
      cloned.stallSince = activeStall?.startDate ?? null;
      cloned.stallCode = activeStall?.stall?.code || null;
      cloned.zone = activeStall?.stall?.zone || null;
      cloned.primaryGroom = activeStall?.assignedGroom?.fullName || null;
    }

    // 3. Ẩn thông tin chủ sở hữu đối với VET và GROOM (CL-1.07)
    if (user.role === UserRole.VETERINARIAN || user.role === UserRole.GROOM) {
      delete cloned.owner;
      cloned.owner = null;
      cloned.ownerName = null;
      cloned.ownerId = null;
    }

    return cloned;
  }

  /** Ô chuồng phải tồn tại, không bảo trì và chưa có ngựa. Gọi sau khi đã khóa dòng Stall. */
  private async assertStallFree(tx: Prisma.TransactionClient, stallId: string): Promise<void> {
    const stall = await tx.stall.findUnique({
      where: { id: stallId },
      include: { allocations: { where: { isActive: true }, take: 1 } },
    });
    if (!stall) {
      throw apiError(HttpStatus.NOT_FOUND, 'STALL_NOT_FOUND', 'Không tìm thấy ô chuồng.');
    }
    if (stall.status === StallStatus.MAINTENANCE || stall.status === StallStatus.INACTIVE) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'STALL_UNAVAILABLE',
        `Ô chuồng ${stall.code} đang bảo trì hoặc ngừng sử dụng.`,
      );
    }
    if (stall.allocations.length > 0) {
      throw apiError(HttpStatus.CONFLICT, 'STALL_OCCUPIED', 'Ô chuồng đã có ngựa.');
    }
  }

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
   * Tạo hồ sơ ngựa mới (FR-1.01).
   */
  async create(dto: CreateHorseDto, user: CurrentUserPayload) {
    const dob = new Date(dto.dob);
    const now = new Date();
    const twelveYearsAgo = new Date();
    twelveYearsAgo.setFullYear(now.getFullYear() - 12);

    if (dob > now) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_DOB',
        'Ngày sinh không được sau ngày hiện tại.',
      );
    }
    if (dob < twelveYearsAgo) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_DOB',
        'Tuổi đăng ký của ngựa không được vượt quá 12 tuổi (ngày sinh không sớm hơn 12 năm trước tính đến ngày hiện tại).',
      );
    }

    // Kiểm tra trùng tên (không phân biệt chữ hoa/thường)
    const existingName = await this.prisma.horse.findFirst({
      where: { name: { equals: dto.name.trim(), mode: 'insensitive' }, deletedAt: null },
    });
    if (existingName) {
      throw apiError(HttpStatus.CONFLICT, 'DUPLICATE_NAME', 'Tên ngựa đã tồn tại trong hệ thống.');
    }

    // Tự sinh số microchip nếu không cung cấp hoặc để trống
    let microchip = dto.microchip?.trim();
    if (!microchip) {
      microchip = await this.generateMicrochip();
    } else {
      // Kiểm tra trùng số microchip
      const existingChip = await this.prisma.horse.findFirst({
        where: {
          OR: [{ microchip }, { microchipRfid: microchip }],
        },
      });
      if (existingChip) {
        throw apiError(
          HttpStatus.CONFLICT,
          'DUPLICATE_MICROCHIP',
          existingChip.deletedAt
            ? 'Số microchip thuộc một hồ sơ trong mục Hồ sơ đã xóa. Hãy khôi phục hồ sơ đó thay vì tạo mới.'
            : 'Số microchip đã được gán cho ngựa khác.',
        );
      }
    }

    // Tự sinh mã thẻ RFID nếu không cung cấp hoặc để trống
    let rfid = dto.rfid?.trim() ? dto.rfid.trim().toUpperCase() : undefined;
    if (!rfid) {
      rfid = await this.generateRfid();
    } else {
      // Kiểm tra trùng mã thẻ RFID nếu có
      const existingRfid = await this.prisma.horse.findFirst({
        where: {
          OR: [{ rfid }, { microchipRfid: rfid }],
        },
      });
      if (existingRfid) {
        throw apiError(
          HttpStatus.CONFLICT,
          'DUPLICATE_RFID',
          existingRfid.deletedAt
            ? 'Mã thẻ RFID thuộc một hồ sơ trong mục Hồ sơ đã xóa.'
            : 'Mã thẻ RFID đã được gán cho ngựa khác.',
        );
      }
    }

    const breed = await this.catalogs.resolveName(HorseCatalogType.BREED, dto.breed);
    const color = await this.catalogs.resolveName(HorseCatalogType.COLOR, dto.color);
    const horseCode = await this.generateHorseCode();
    const microchipRfid = microchip;

    // Hồ sơ mới luôn ở Nghỉ ngơi. Nếu chọn ô chuồng ngay khi tạo: khóa dòng ô (FOR UPDATE),
    // kiểm ô còn trống rồi đặt OCCUPIED, tất cả trong một transaction -> 2 người không gán trùng 1 ô.
    const horse = await this.prisma.$transaction(async (tx) => {
      if (dto.stallId) {
        await tx.$queryRaw`SELECT "id" FROM "Stall" WHERE "id" = ${dto.stallId} FOR UPDATE`;
        await this.assertStallFree(tx, dto.stallId);
      }

      const created = await tx.horse.create({
        data: {
          horseCode,
          name: dto.name.trim(),
          breed,
          dob,
          gender: dto.gender,
          color,
          microchip,
          rfid: rfid || null,
          microchipRfid,
          status: HorseStatus.RESTING,
          isMedicalLocked: false,
          ownerId: dto.ownerId || null,
          avatarUrl: dto.avatarUrl || null,
          ...(dto.stallId
            ? {
                stallAllocations: {
                  create: {
                    stallId: dto.stallId,
                    startDate: now,
                    isActive: true,
                  },
                },
              }
            : {}),
        },
        include: {
          owner: { select: { id: true, fullName: true, email: true } },
          stallAllocations: {
            where: { isActive: true },
            include: { stall: true, assignedGroom: { select: { id: true, fullName: true } } },
          },
        },
      });

      if (dto.stallId) {
        await tx.stall.update({
          where: { id: dto.stallId },
          data: { status: StallStatus.OCCUPIED },
        });
      }
      return created;
    });

    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'HORSE_CREATED',
      `Tạo mới hồ sơ ngựa ${horse.name} (${horse.horseCode})`,
      horse.id,
      {
        entityName: 'Horse',
        newValues: { name: horse.name, horseCode: horse.horseCode, status: horse.status },
      },
    );

    return this.applyRolePolicy(horse, user);
  }

  /**
   * Cập nhật thông tin định danh hồ sơ ngựa (FR-1.02).
   */
  async update(id: string, dto: UpdateHorseDto, user: CurrentUserPayload) {
    const horse = await this.prisma.horse.findUnique({
      where: { id, deletedAt: null },
      include: {
        stallAllocations: { where: { isActive: true } },
      },
    });

    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Không tìm thấy hồ sơ ngựa.');
    }

    if (horse.status === HorseStatus.RETIRED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'HORSE_RETIRED',
        'Ngựa đã ngừng quản lý. Vui lòng kích hoạt lại trước khi thao tác.',
      );
    }

    // Chỉ kiểm tuổi khi đổi ngày sinh: ngựa đã có hồ sơ từ trước vẫn sửa được thông tin khác.
    const dobChanged = !!dto.dob && new Date(dto.dob).getTime() !== horse.dob.getTime();
    if (dto.dob && dobChanged) {
      const dob = new Date(dto.dob);
      const now = new Date();
      const twelveYearsAgo = new Date();
      twelveYearsAgo.setFullYear(now.getFullYear() - 12);

      if (dob > now) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'INVALID_DOB',
          'Ngày sinh không được sau ngày hiện tại.',
        );
      }
      if (dob < twelveYearsAgo) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'INVALID_DOB',
          'Tuổi của ngựa không được vượt quá 12 tuổi (ngày sinh không sớm hơn 12 năm trước tính đến ngày hiện tại).',
        );
      }
    }

    if (dto.name && dto.name.trim().toLowerCase() !== horse.name.toLowerCase()) {
      const existingName = await this.prisma.horse.findFirst({
        where: {
          name: { equals: dto.name.trim(), mode: 'insensitive' },
          id: { not: id },
          deletedAt: null,
        },
      });
      if (existingName) {
        throw apiError(
          HttpStatus.CONFLICT,
          'DUPLICATE_NAME',
          'Tên ngựa đã tồn tại trong hệ thống.',
        );
      }
    }

    if (dto.microchip && dto.microchip !== horse.microchip) {
      const existingChip = await this.prisma.horse.findFirst({
        where: {
          OR: [{ microchip: dto.microchip }, { microchipRfid: dto.microchip }],
          id: { not: id },
        },
      });
      if (existingChip) {
        throw apiError(
          HttpStatus.CONFLICT,
          'DUPLICATE_MICROCHIP',
          'Số microchip đã được gán cho ngựa khác.',
        );
      }
    }

    if (dto.rfid && dto.rfid !== horse.rfid) {
      const existingRfid = await this.prisma.horse.findFirst({
        where: {
          OR: [{ rfid: dto.rfid }, { microchipRfid: dto.rfid }],
          id: { not: id },
        },
      });
      if (existingRfid) {
        throw apiError(
          HttpStatus.CONFLICT,
          'DUPLICATE_RFID',
          'Mã thẻ RFID đã được gán cho ngựa khác.',
        );
      }
    }

    const breed = dto.breed
      ? await this.catalogs.resolveName(HorseCatalogType.BREED, dto.breed, horse.breed)
      : undefined;
    const color = dto.color
      ? await this.catalogs.resolveName(HorseCatalogType.COLOR, dto.color, horse.color)
      : undefined;

    if (dto.ownerId) {
      const owner = await this.prisma.user.findUnique({ where: { id: dto.ownerId } });
      if (!owner || owner.role !== Role.HORSE_OWNER) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'INVALID_OWNER',
          'The specified owner does not exist or does not hold the Horse Owner role.',
        );
      }
    }

    const updated = await this.prisma.horse.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(breed ? { breed } : {}),
        ...(dto.dob ? { dob: new Date(dto.dob) } : {}),
        ...(dto.gender ? { gender: dto.gender } : {}),
        ...(color ? { color } : {}),
        ...(dto.microchip
          ? {
              microchip: dto.microchip,
              microchipRfid: dto.microchip,
            }
          : {}),
        ...(dto.rfid !== undefined ? { rfid: dto.rfid ? dto.rfid.toUpperCase() : null } : {}),
        ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId || null } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        stallAllocations: {
          where: { isActive: true },
          include: { stall: true, assignedGroom: { select: { id: true, fullName: true } } },
        },
      },
    });

    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'HORSE_UPDATED',
      `Updated identification record for horse ${updated.name} (${updated.horseCode || updated.id})`,
      updated.id,
      {
        entityName: 'Horse',
        oldValues: { name: horse.name, status: horse.status, microchip: horse.microchip },
        newValues: { name: updated.name, status: updated.status, microchip: updated.microchip },
      },
    );

    return this.applyRolePolicy(updated, user);
  }

  /**
   * Chuyển quyền sở hữu ngựa sang chủ mới (FR-1.02, Flow 1 Governance).
   * Chỉ Club Manager được phép thực hiện.
   */
  async transferOwner(id: string, dto: TransferHorseOwnerDto, user: CurrentUserPayload) {
    const horse = await this.prisma.horse.findUnique({
      where: { id, deletedAt: null },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse profile not found.');
    }

    if (horse.status === HorseStatus.RETIRED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'HORSE_RETIRED',
        'Cannot transfer ownership of a retired horse. Please reactivate the horse profile first.',
      );
    }

    if (horse.ownerId === dto.newOwnerId) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'ALREADY_OWNED',
        'Horse is already assigned to this owner.',
      );
    }

    const newOwner = await this.prisma.user.findUnique({
      where: { id: dto.newOwnerId },
      select: { id: true, fullName: true, email: true, role: true, status: true },
    });

    if (!newOwner || newOwner.role !== Role.HORSE_OWNER) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_NEW_OWNER',
        'The specified account does not exist or is not registered as a Horse Owner.',
      );
    }

    if (newOwner.status !== UserStatus.ACTIVE) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INACTIVE_OWNER',
        'New owner account is not currently active.',
      );
    }

    const previousOwnerName = horse.owner ? horse.owner.fullName : 'Unassigned';

    const updated = await this.prisma.horse.update({
      where: { id },
      data: {
        ownerId: newOwner.id,
      },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        stallAllocations: {
          where: { isActive: true },
          include: { stall: true, assignedGroom: { select: { id: true, fullName: true } } },
        },
      },
    });

    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'HORSE_OWNERSHIP_TRANSFERRED',
      `Transferred ownership of horse ${horse.name} (${horse.horseCode || horse.id}) from ${previousOwnerName} to ${newOwner.fullName}. Reason: ${dto.reason || 'None specified'}`,
      horse.id,
      {
        entityName: 'Horse',
        oldValues: { ownerId: horse.ownerId, ownerName: previousOwnerName },
        newValues: { ownerId: newOwner.id, ownerName: newOwner.fullName, reason: dto.reason },
      },
    );
    await this.notifications.notifyUsers([newOwner.id], {
      type: 'HORSE_OWNER_ASSIGNED',
      category: 'HORSE',
      title: 'A horse was assigned to you',
      message: `You are now the registered owner of ${horse.name}.`,
      params: { horse: horse.name },
      link: `/horses/${horse.id}`,
      senderName: user.fullName,
    });

    return this.applyRolePolicy(updated, user);
  }

  /**
   * Tra cứu danh sách hồ sơ ngựa có tìm kiếm, lọc, sắp xếp, phân trang (FR-1.03).
   */
  async findAll(query: QueryHorseDto, user: CurrentUserPayload) {
    const {
      search,
      status,
      isMedicalLocked,
      breed,
      gender,
      sortBy = 'name',
      sortOrder = 'asc',
      page = 1,
      limit = 20,
    } = query;

    // Hồ sơ đã xóa mềm chỉ xem ở GET /horses/deleted.
    const where: Prisma.HorseWhereInput = { deletedAt: null };

    // Phân quyền phạm vi dữ liệu:
    if (user.role === UserRole.HORSE_OWNER) {
      where.ownerId = user.userId;
    } else if (user.role === UserRole.GROOM) {
      where.stallAllocations = {
        some: {
          assignedGroomUserId: user.userId,
          isActive: true,
        },
      };
    }

    // Bộ lọc tìm kiếm tự do (Tên, Mã ngựa, Microchip, RFID)
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { horseCode: { contains: q, mode: 'insensitive' } },
        { microchip: { contains: q, mode: 'insensitive' } },
        { rfid: { contains: q, mode: 'insensitive' } },
        { microchipRfid: { contains: q, mode: 'insensitive' } },
        { breed: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Bộ lọc trạng thái
    if (status && status !== 'ALL') {
      const statuses = status
        .split(',')
        .map((s) => s.trim())
        .filter((s) => Object.values(HorseStatus).includes(s as HorseStatus)) as HorseStatus[];

      if (statuses.length === 1) {
        where.status = statuses[0];
      } else if (statuses.length > 1) {
        where.status = { in: statuses };
      }
    }

    // Bộ lọc khóa y tế
    if (isMedicalLocked !== undefined && isMedicalLocked !== '') {
      where.isMedicalLocked = isMedicalLocked === 'true';
    }

    // DL-1.02 / SC-1.01 "Chưa có ô chuồng" (chỉ nhân sự nội bộ quản lý chuồng; GROOM đã lọc theo ô ở trên)
    if (
      query.noStall === 'true' &&
      user.role !== UserRole.GROOM &&
      user.role !== UserRole.HORSE_OWNER
    ) {
      where.stallAllocations = { none: { isActive: true } };
    }

    // Bộ lọc giống và giới tính
    if (breed && breed !== 'ALL') {
      where.breed = { equals: breed, mode: 'insensitive' };
    }
    if (gender && gender !== 'ALL') {
      where.gender = { equals: gender, mode: 'insensitive' };
    }

    // Sắp xếp
    let orderBy: Prisma.HorseOrderByWithRelationInput = { name: sortOrder };
    if (sortBy === 'horseCode') {
      orderBy = { horseCode: sortOrder };
    } else if (sortBy === 'status') {
      orderBy = { status: sortOrder };
    } else if (sortBy === 'dob') {
      orderBy = { dob: sortOrder };
    } else if (sortBy === 'createdAt') {
      orderBy = { createdAt: sortOrder };
    }

    const skip = (page - 1) * limit;

    const [horses, total] = await Promise.all([
      this.prisma.horse.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          owner: { select: { id: true, fullName: true, email: true } },
          stallAllocations: {
            where: { isActive: true },
            include: { stall: true, assignedGroom: { select: { id: true, fullName: true } } },
          },
          medicalLocks: {
            where: { isLocked: true },
            take: 1,
            select: { id: true, isLocked: true, lockReason: true, lockedAt: true },
          },
        },
      }),
      this.prisma.horse.count({ where }),
    ]);

    const items = horses.map((h) => this.applyRolePolicy(h, user));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Xem chi tiết hồ sơ ngựa theo ID (FR-1.04).
   */
  async findOne(id: string, user: CurrentUserPayload) {
    const horse = await this.prisma.horse.findUnique({
      where: { id, deletedAt: null },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        stallAllocations: {
          where: { isActive: true },
          include: { stall: true, assignedGroom: { select: { id: true, fullName: true } } },
        },
        medicalLocks: {
          where: { isLocked: true },
          include: { veterinarian: { select: { id: true, fullName: true } } },
          take: 1,
        },
      },
    });

    if (!horse) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'HORSE_NOT_FOUND',
        'Không tìm thấy hồ sơ ngựa hoặc bạn không có quyền xem.',
      );
    }

    // Kiểm tra phạm vi dữ liệu đối với OWNER và GROOM
    if (user.role === UserRole.HORSE_OWNER && horse.ownerId !== user.userId) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'HORSE_NOT_FOUND',
        'Không tìm thấy hồ sơ ngựa hoặc bạn không có quyền xem.',
      );
    }

    if (user.role === UserRole.GROOM) {
      const allocations = (horse as any).stallAllocations || [];
      const isAssigned = allocations.some(
        (a: any) => a.assignedGroomUserId === user.userId && a.isActive,
      );
      if (!isAssigned) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          'HORSE_NOT_FOUND',
          'Không tìm thấy hồ sơ ngựa hoặc bạn không có quyền xem.',
        );
      }
    }

    return this.applyRolePolicy(horse, user);
  }

  /**
   * Lấy lịch sử toàn diện vòng đời của ngựa (FR-1.04, Flow 1).
   */
  async getHistory(id: string, user: CurrentUserPayload) {
    const horse = await this.prisma.horse.findUnique({
      where: { id, deletedAt: null },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        stallAllocations: {
          include: {
            stall: true,
            assignedGroom: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { startDate: 'desc' },
        },
        medicalRecords: {
          include: {
            veterinarian: { select: { id: true, fullName: true } },
          },
          orderBy: { examinationDate: 'desc' },
        },
        injuryLogs: {
          orderBy: { discoveryDate: 'desc' },
        },
        medicalLocks: {
          include: {
            veterinarian: { select: { id: true, fullName: true } },
            unlockVet: { select: { id: true, fullName: true } },
          },
          orderBy: { lockedAt: 'desc' },
        },
        trainingPlans: {
          include: {
            trainer: { select: { id: true, fullName: true } },
            workoutSessions: {
              orderBy: { scheduledDate: 'desc' },
            },
          },
          orderBy: { startDate: 'desc' },
        },
        tournamentRegistrations: {
          include: {
            tournament: true,
            result: true,
          },
          orderBy: { registrationDate: 'desc' },
        },
      },
    });

    if (!horse) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'HORSE_NOT_FOUND',
        'Không tìm thấy hồ sơ ngựa hoặc bạn không có quyền xem.',
      );
    }

    if (user.role === UserRole.HORSE_OWNER && horse.ownerId !== user.userId) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'HORSE_NOT_FOUND',
        'Không tìm thấy hồ sơ ngựa hoặc bạn không có quyền xem.',
      );
    }

    if (user.role === UserRole.GROOM) {
      const allocations = horse.stallAllocations || [];
      const isAssigned = allocations.some(
        (a) => a.assignedGroomUserId === user.userId && a.isActive,
      );
      if (!isAssigned) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          'HORSE_NOT_FOUND',
          'Không tìm thấy hồ sơ ngựa hoặc bạn không có quyền xem.',
        );
      }
    }

    // Nhật ký của chính con ngựa (không giới hạn số dòng: lịch sử trạng thái và chủ sở hữu dựng từ đây).
    const auditLogs = await this.prisma.auditLog.findMany({
      where: { entityId: id },
      orderBy: { timestamp: 'desc' },
      include: { user: { select: { id: true, fullName: true, role: true } } },
    });

    // 1. Lịch sử trạng thái (Tab 4). Nguồn: Thủ công / Khóa huấn luyện (Flow 3 ghi kèm source) / Hệ thống.
    const statusHistory = auditLogs
      .filter((l) => l.action === 'HORSE_STATUS_CHANGED')
      .map((l) => {
        let details: any = {};
        try {
          details = l.newValuesJson ? JSON.parse(l.newValuesJson) : {};
        } catch {
          details = {};
        }
        return {
          id: l.id,
          timestamp: l.timestamp,
          changedBy: l.user?.fullName || 'System',
          changedByRole: l.user?.role ?? null,
          action: l.action,
          source: (details.source as string) || (l.user ? 'MANUAL' : 'SYSTEM'),
          notes: details.reason || null,
          oldStatus: details.oldStatus || null,
          newStatus: details.newStatus || null,
        };
      });

    // 2. Ownership History
    const ownershipHistory = auditLogs
      .filter((l) => l.action === 'HORSE_OWNERSHIP_TRANSFERRED')
      .map((l) => {
        let oldVal: any = {};
        let newVal: any = {};
        try {
          oldVal = l.oldValuesJson ? JSON.parse(l.oldValuesJson) : {};
          newVal = l.newValuesJson ? JSON.parse(l.newValuesJson) : {};
        } catch {
          // ignore
        }
        return {
          id: l.id,
          timestamp: l.timestamp,
          previousOwner: oldVal.ownerName || 'None',
          newOwner: newVal.ownerName || 'Unknown',
          reason: newVal.reason || 'None specified',
          transferredBy: l.user?.fullName || 'Club Manager',
        };
      });

    // 3. Stall History
    const stallHistory =
      user.role === UserRole.HORSE_OWNER
        ? []
        : horse.stallAllocations.map((a) => ({
            id: a.id,
            stallCode: a.stall.code,
            zone: a.stall.zone,
            groomName: a.assignedGroom?.fullName || 'Unassigned',
            startDate: a.startDate,
            endDate: a.endDate,
            isActive: a.isActive,
          }));

    // 4. Medical History
    const medicalHistory = {
      records: horse.medicalRecords.map((r) => ({
        id: r.id,
        examinationDate: r.examinationDate,
        veterinarianName: r.veterinarian?.fullName || 'Dr. Veterinarian',
        symptoms: r.symptoms,
        clinicalDiagnosis: r.clinicalDiagnosis,
        treatmentProtocol: r.treatmentProtocol,
      })),
      injuries: horse.injuryLogs.map((inj) => ({
        id: inj.id,
        discoveryDate: inj.discoveryDate,
        anatomicalZone: inj.anatomicalZone,
        layer: inj.layer,
        viewSide: inj.viewSide,
        injuryType: inj.injuryType,
        severity: inj.severity,
        stage: inj.stage,
        status: inj.status,
      })),
      locks: horse.medicalLocks.map((l) => ({
        id: l.id,
        lockCode: l.lockCode,
        lockedAt: l.lockedAt,
        lockReason: l.lockReason,
        veterinarianName: l.veterinarian?.fullName,
        isLocked: l.isLocked,
        unlockedAt: l.unlockedAt,
        unlockReason: l.unlockReason,
        unlockVetName: l.unlockVet?.fullName,
      })),
    };

    // 5. Training History
    const trainingHistory = horse.trainingPlans.map((p) => ({
      id: p.id,
      phaseName: p.phaseName,
      targetSpeed: p.targetSpeed,
      targetDistance: p.targetDistance,
      trackSurface: p.trackSurface,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      trainerName: p.trainer?.fullName,
      totalWorkouts: p.workoutSessions.length,
      completedWorkouts: p.workoutSessions.filter((w) => w.status === 'COMPLETED').length,
    }));

    // 6. Dòng thời gian (Tab 6): mỗi mục thuộc 1 nhóm để FE lọc; mục của Flow 2/3 có link sang màn chi tiết.
    type TimelineCategory =
      | 'IDENTITY'
      | 'STATUS'
      | 'STALL'
      | 'CARE'
      | 'OWNERSHIP'
      | 'MEDICAL'
      | 'TRAINING'
      | 'TOURNAMENT';
    const timeline: Array<{
      id: string;
      category: TimelineCategory;
      title: string;
      description: string;
      timestamp: Date | string;
      actor?: string | null;
      link?: string | null;
      badgeTone?: string;
    }> = [];

    timeline.push({
      id: `created-${horse.id}`,
      category: 'IDENTITY',
      title: 'Horse profile created',
      description: `Registered as ${horse.name} (${horse.horseCode || horse.id}), breed ${horse.breed}.`,
      timestamp: horse.createdAt,
      actor: auditLogs.find((l) => l.action === 'HORSE_CREATED')?.user?.fullName ?? null,
      badgeTone: 'info',
    });

    const IDENTITY_ACTIONS: Record<string, string> = {
      HORSE_UPDATED: 'Identity details updated',
      HORSE_RESTORED: 'Profile restored from Deleted horses',
    };
    auditLogs
      .filter((l) => IDENTITY_ACTIONS[l.action])
      .forEach((l) =>
        timeline.push({
          id: `audit-${l.id}`,
          category: 'IDENTITY',
          title: IDENTITY_ACTIONS[l.action],
          description:
            l.action === 'HORSE_UPDATED'
              ? 'Identification record edited.'
              : 'Profile is active again.',
          timestamp: l.timestamp,
          actor: l.user?.fullName ?? null,
          badgeTone: 'info',
        }),
      );

    const SOURCE_LABEL: Record<string, string> = {
      MANUAL: 'Manual change',
      MEDICAL_LOCK: 'Training Lock',
      SYSTEM: 'System',
      TRAINING_PLAN: 'Training plan activation',
    };
    statusHistory.forEach((st) =>
      timeline.push({
        id: `st-${st.id}`,
        category: 'STATUS',
        title: `Status changed${st.oldStatus ? ` from ${st.oldStatus}` : ''} to ${st.newStatus || 'unknown'}`,
        description: `${SOURCE_LABEL[st.source] ?? st.source}${st.notes ? `. Reason: ${st.notes}` : ''}.`,
        timestamp: st.timestamp,
        actor: st.changedBy,
        badgeTone: 'neutral',
      }),
    );

    if (user.role !== UserRole.HORSE_OWNER) {
      horse.stallAllocations.forEach((a) => {
        timeline.push({
          id: `stall-in-${a.id}`,
          category: 'STALL',
          title: `Moved into stall ${a.stall.code}`,
          description: `Zone ${a.stall.zone}${a.assignedGroom ? `. Groom: ${a.assignedGroom.fullName}` : ''}.`,
          timestamp: a.startDate,
          badgeTone: 'info',
        });
        if (a.endDate) {
          timeline.push({
            id: `stall-out-${a.id}`,
            category: 'STALL',
            title: `Left stall ${a.stall.code}`,
            description: `Zone ${a.stall.zone}.`,
            timestamp: a.endDate,
            badgeTone: 'neutral',
          });
        }
      });
    }

    // Tab Chủ sở hữu ẩn với VET, GROOM (CL-1.07) nên dòng thời gian cũng ẩn nhóm này.
    if (user.role !== UserRole.VETERINARIAN && user.role !== UserRole.GROOM) {
      ownershipHistory.forEach((o) =>
        timeline.push({
          id: `own-${o.id}`,
          category: 'OWNERSHIP',
          title: `Ownership transferred to ${o.newOwner}`,
          description: `Previous owner: ${o.previousOwner}. Reason: ${o.reason}.`,
          timestamp: o.timestamp,
          actor: o.transferredBy,
          badgeTone: 'info',
        }),
      );
    }

    horse.medicalLocks.forEach((l) => {
      timeline.push({
        id: `lock-${l.id}`,
        category: 'MEDICAL',
        title: `Training Lock placed (${l.lockCode || 'LOCK'})`,
        description: `Reason: ${l.lockReason}.`,
        timestamp: l.lockedAt,
        actor: l.veterinarian?.fullName ?? null,
        link: '/medical/locks',
        badgeTone: 'danger',
      });
      if (!l.isLocked && l.unlockedAt) {
        timeline.push({
          id: `unlock-${l.id}`,
          category: 'MEDICAL',
          title: `Training Lock lifted (${l.lockCode || 'LOCK'})`,
          description: `Reason: ${l.unlockReason || '—'}.`,
          timestamp: l.unlockedAt,
          actor: l.unlockVet?.fullName ?? null,
          link: '/medical/locks',
          badgeTone: 'ok',
        });
      }
    });
    horse.medicalRecords.forEach((r) =>
      timeline.push({
        id: `med-${r.id}`,
        category: 'MEDICAL',
        title: `Medical examination: ${r.clinicalDiagnosis}`,
        description: `Symptoms: ${r.symptoms}.`,
        timestamp: r.examinationDate,
        actor: r.veterinarian?.fullName ?? null,
        link: `/medical/records/${r.id}`,
        badgeTone: 'warn',
      }),
    );
    horse.injuryLogs.forEach((inj) =>
      timeline.push({
        id: `inj-${inj.id}`,
        category: 'MEDICAL',
        title: `Injury recorded: ${inj.anatomicalZone}`,
        description: `${inj.injuryType}, stage ${inj.stage}.`,
        timestamp: inj.discoveryDate,
        link: `/medical/horses/${horse.id}/injuries`,
        badgeTone: 'warn',
      }),
    );

    horse.trainingPlans.forEach((p) => {
      timeline.push({
        id: `plan-${p.id}`,
        category: 'TRAINING',
        title: `Training plan created: ${p.phaseName}`,
        description: `Trainer: ${p.trainer?.fullName || '—'}.`,
        timestamp: p.createdAt,
        actor: p.trainer?.fullName ?? null,
        link: `/training/plans/${p.id}`,
        badgeTone: 'ok',
      });
      if (p.status === PlanStatus.COMPLETED || p.status === PlanStatus.CANCELLED) {
        timeline.push({
          id: `plan-end-${p.id}`,
          category: 'TRAINING',
          title: `Training plan ${p.status === PlanStatus.COMPLETED ? 'completed' : 'cancelled'}: ${p.phaseName}`,
          description:
            (p.status === PlanStatus.COMPLETED ? p.completionSummary : p.cancelReason) || '—',
          timestamp: p.updatedAt,
          link: `/training/plans/${p.id}`,
          badgeTone: 'neutral',
        });
      }
    });

    horse.tournamentRegistrations.forEach((r) =>
      timeline.push({
        id: `race-${r.id}`,
        category: 'TOURNAMENT',
        title: `Race registration: ${r.tournament?.name ?? 'Tournament'}`,
        description: `Registration status: ${r.status}.`,
        timestamp: r.registrationDate,
        badgeTone: 'info',
      }),
    );

    // Sort timeline newest first
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      horse: this.applyRolePolicy(horse, user),
      statusHistory,
      ownershipHistory,
      stallHistory,
      medicalHistory,
      trainingHistory,
      timeline,
    };
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
