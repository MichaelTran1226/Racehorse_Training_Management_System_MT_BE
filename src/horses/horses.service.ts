import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HorseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/exceptions/api-error';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateHorseDto } from './dto/create-horse.dto';
import { UpdateHorseDto } from './dto/update-horse.dto';
import { QueryHorseDto } from './dto/query-horse.dto';
import { ChangeHorseStatusDto } from './dto/change-status.dto';

@Injectable()
export class HorsesService {
  private readonly logger = new Logger(HorsesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Sinh tự động mã định danh ngựa dạng HR-XXXXXX (6 chữ số).
   */
  async generateHorseCode(): Promise<string> {
    const count = await this.prisma.horse.count();
    let seq = count + 1;
    let candidate = `HR-${String(seq).padStart(6, '0')}`;

    while (await this.prisma.horse.findUnique({ where: { horseCode: candidate } })) {
      seq += 1;
      candidate = `HR-${String(seq).padStart(6, '0')}`;
    }
    return candidate;
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
      const activeStall = cloned.stallAllocations[0];
      cloned.stallCode = activeStall.stall?.code || null;
      cloned.zone = activeStall.stall?.zone || null;
      cloned.primaryGroom = activeStall.assignedGroom?.fullName || null;
    }

    return cloned;
  }

  /**
   * Tạo hồ sơ ngựa mới (FR-1.01).
   */
  async create(dto: CreateHorseDto, user: CurrentUserPayload) {
    const dob = new Date(dto.dob);
    const now = new Date();
    const fortyYearsAgo = new Date();
    fortyYearsAgo.setFullYear(now.getFullYear() - 40);

    if (dob > now) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_DOB',
        'Ngày sinh không được sau ngày hiện tại.',
      );
    }
    if (dob < fortyYearsAgo) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_DOB',
        'Ngày sinh không được sớm hơn 40 năm tính đến ngày hiện tại.',
      );
    }

    // Kiểm tra trùng tên (không phân biệt chữ hoa/thường)
    const existingName = await this.prisma.horse.findFirst({
      where: { name: { equals: dto.name.trim(), mode: 'insensitive' } },
    });
    if (existingName) {
      throw apiError(HttpStatus.CONFLICT, 'DUPLICATE_NAME', 'Tên ngựa đã tồn tại trong hệ thống.');
    }

    // Kiểm tra trùng số microchip
    const existingChip = await this.prisma.horse.findFirst({
      where: {
        OR: [{ microchip: dto.microchip }, { microchipRfid: dto.microchip }],
      },
    });
    if (existingChip) {
      throw apiError(
        HttpStatus.CONFLICT,
        'DUPLICATE_MICROCHIP',
        'Số microchip đã được gán cho ngựa khác.',
      );
    }

    // Kiểm tra trùng mã thẻ RFID nếu có
    if (dto.rfid) {
      const existingRfid = await this.prisma.horse.findFirst({
        where: {
          OR: [{ rfid: dto.rfid }, { microchipRfid: dto.rfid }],
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

    const horseCode = await this.generateHorseCode();
    const initialStatus = dto.status || HorseStatus.RESTING;
    const microchipRfid = dto.microchip;

    const horse = await this.prisma.horse.create({
      data: {
        horseCode,
        name: dto.name.trim(),
        breed: dto.breed.trim(),
        dob,
        gender: dto.gender,
        color: dto.color.trim(),
        microchip: dto.microchip,
        rfid: dto.rfid ? dto.rfid.toUpperCase() : null,
        microchipRfid,
        status: initialStatus,
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

    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'HORSE_CREATED',
      `Tạo mới hồ sơ ngựa ${horse.name} (${horse.horseCode})`,
      horse.id,
      { newValues: { name: horse.name, horseCode: horse.horseCode, status: horse.status } },
    );

    return this.applyRolePolicy(horse, user);
  }

  /**
   * Cập nhật thông tin định danh hồ sơ ngựa (FR-1.02).
   */
  async update(id: string, dto: UpdateHorseDto, user: CurrentUserPayload) {
    const horse = await this.prisma.horse.findUnique({
      where: { id },
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

    if (dto.dob) {
      const dob = new Date(dto.dob);
      const now = new Date();
      const fortyYearsAgo = new Date();
      fortyYearsAgo.setFullYear(now.getFullYear() - 40);

      if (dob > now) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'INVALID_DOB',
          'Ngày sinh không được sau ngày hiện tại.',
        );
      }
      if (dob < fortyYearsAgo) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'INVALID_DOB',
          'Ngày sinh không được sớm hơn 40 năm tính đến ngày hiện tại.',
        );
      }
    }

    if (dto.name && dto.name.trim().toLowerCase() !== horse.name.toLowerCase()) {
      const existingName = await this.prisma.horse.findFirst({
        where: {
          name: { equals: dto.name.trim(), mode: 'insensitive' },
          id: { not: id },
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

    const updated = await this.prisma.horse.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.breed ? { breed: dto.breed.trim() } : {}),
        ...(dto.dob ? { dob: new Date(dto.dob) } : {}),
        ...(dto.gender ? { gender: dto.gender } : {}),
        ...(dto.color ? { color: dto.color.trim() } : {}),
        ...(dto.microchip
          ? {
              microchip: dto.microchip,
              microchipRfid: dto.microchip,
            }
          : {}),
        ...(dto.rfid !== undefined ? { rfid: dto.rfid ? dto.rfid.toUpperCase() : null } : {}),
        ...(dto.status ? { status: dto.status } : {}),
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
      `Cập nhật hồ sơ định danh ngựa ${updated.name} (${updated.horseCode || updated.id})`,
      updated.id,
      {
        oldValues: { name: horse.name, status: horse.status, microchip: horse.microchip },
        newValues: { name: updated.name, status: updated.status, microchip: updated.microchip },
      },
    );

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

    const where: Prisma.HorseWhereInput = {};

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
      where: { id },
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
   * Xóa hồ sơ ngựa (chỉ khi chưa có dữ liệu phụ thuộc ở Flow 2-5).
   */
  async remove(id: string, user: CurrentUserPayload) {
    const horse = await this.prisma.horse.findUnique({
      where: { id },
      include: {
        workoutSessions: { take: 1 },
        trainingPlans: { take: 1 },
        medicalRecords: { take: 1 },
      },
    });

    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Không tìm thấy hồ sơ ngựa.');
    }

    if (horse.isMedicalLocked) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'HORSE_LOCKED',
        'Không thể xóa hồ sơ ngựa đang trong thời gian Khóa huấn luyện.',
      );
    }

    if (
      horse.workoutSessions.length > 0 ||
      horse.trainingPlans.length > 0 ||
      horse.medicalRecords.length > 0
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'HAS_DEPENDENT_DATA',
        'Ngựa đã có dữ liệu huấn luyện, y tế, chăm sóc hoặc thi đấu. Vui lòng dùng Ngừng quản lý.',
      );
    }

    await this.prisma.horse.delete({ where: { id } });

    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'HORSE_DELETED',
      `Xóa hồ sơ ngựa ${horse.name} (${horse.horseCode || horse.id})`,
      horse.id,
    );

    return { success: true, message: `Đã xóa hồ sơ ngựa ${horse.name}.` };
  }
  async changeStatus(id: string, dto: ChangeHorseStatusDto, user: CurrentUserPayload) {
    const horse = await this.prisma.horse.findUnique({ where: { id } });
    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Không tìm thấy hồ sơ ngựa.');
    }

    if (horse.status === dto.status) {
      throw apiError(HttpStatus.BAD_REQUEST, 'SAME_STATUS', `Ngựa đang ở trạng thái ${dto.status}.`);
    }

    if (horse.isMedicalLocked) {
      if (user.role === UserRole.VETERINARIAN) {
        if (!['INJURED', 'ISOLATED', 'UNDER_OBSERVATION'].includes(dto.status)) {
           throw apiError(HttpStatus.FORBIDDEN, 'MEDICAL_LOCK_ACTIVE', 'Ngựa đang bị Khóa huấn luyện y tế. Không thể chuyển sang trạng thái vận hành.');
        }
      } else if (user.role === UserRole.CLUB_MANAGER && dto.status === 'RETIRED') {
        // allow CM to retire
      } else {
        throw apiError(HttpStatus.FORBIDDEN, 'MEDICAL_LOCK_ACTIVE', 'Ngựa đang bị Khóa huấn luyện y tế. Không thể thực hiện thao tác này cho đến khi Bác sĩ thú y mở khóa.');
      }
    }

    if (user.role === UserRole.HEAD_TRAINER) {
      if (!['RESTING', 'IN_TRAINING', 'ACTIVE'].includes(dto.status as string)) {
        throw apiError(HttpStatus.FORBIDDEN, 'ROLE_RESTRICTION', 'Head Trainer chỉ được chuyển các trạng thái vận hành.');
      }
    } else if (user.role === UserRole.VETERINARIAN) {
      if (!['INJURED', 'ISOLATED', 'UNDER_OBSERVATION', 'RESTING', 'IN_TRAINING'].includes(dto.status as string)) {
        throw apiError(HttpStatus.FORBIDDEN, 'ROLE_RESTRICTION', 'Veterinarian chỉ được thiết lập/gỡ các trạng thái y tế.');
      }
    }

    const updated = await this.prisma.horse.update({
      where: { id },
      data: { status: dto.status },
    });

    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'HORSE_STATUS_CHANGED',
      `Chuyển trạng thái ngựa ${horse.name} từ ${horse.status} sang ${dto.status}. Lý do: ${dto.reason || 'Không có'}`,
      horse.id,
    );

    return { success: true, data: updated, message: `Đã chuyển trạng thái sang ${dto.status}.` };
  }
}
