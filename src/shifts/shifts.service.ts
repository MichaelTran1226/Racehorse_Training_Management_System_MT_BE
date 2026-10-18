import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import {
  CreateShiftCatalogDto,
  QueryShiftCatalogDto,
  SetShiftStatusDto,
  UpdateShiftCatalogDto,
} from './dto/shift.dto';

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function calculateShiftMetrics(
  startTime: string,
  endTime: string,
): { durationMinutes: number; isOvernight: boolean } {
  const startM = parseTimeToMinutes(startTime);
  const endM = parseTimeToMinutes(endTime);

  if (startM === endM) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'SHIFT_DURATION_INVALID',
      'Giờ kết thúc phải khác giờ bắt đầu.',
    );
  }

  let durationMinutes: number;
  let isOvernight = false;

  if (endM < startM) {
    isOvernight = true;
    durationMinutes = 24 * 60 - startM + endM;
  } else {
    durationMinutes = endM - startM;
  }

  if (durationMinutes < 120 || durationMinutes > 720) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'SHIFT_DURATION_INVALID',
      'Ca trực phải kéo dài từ 2 đến 12 giờ.',
      { durationMinutes },
    );
  }

  return { durationMinutes, isOvernight };
}

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * SC-4.11 Danh sách ca trực.
   */
  async findAll(query: QueryShiftCatalogDto) {
    const where: Prisma.ShiftCatalogWhereInput = {};

    const includeInactive =
      query.includeInactive === true || query.includeInactive === 'true' || query.status === 'ALL';

    if (!includeInactive) {
      if (query.status === 'INACTIVE') {
        where.isActive = false;
      } else {
        where.isActive = true;
      }
    }

    const term = query.search?.trim();
    if (term) {
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
      ];
    }

    return this.prisma.shiftCatalog.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
    });
  }

  async findOne(id: string) {
    const shift = await this.prisma.shiftCatalog.findUnique({
      where: { id },
    });
    if (!shift) {
      throw apiError(HttpStatus.NOT_FOUND, 'SHIFT_NOT_FOUND', 'Ca trực không tồn tại.');
    }
    return shift;
  }

  /**
   * BTN-4.50 / DL-4.16 Thêm ca trực mới (Chỉ CM).
   */
  async create(dto: CreateShiftCatalogDto, currentUser: CurrentUserPayload) {
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();

    const existingCode = await this.prisma.shiftCatalog.findUnique({
      where: { code },
    });
    if (existingCode) {
      throw apiError(HttpStatus.CONFLICT, 'SHIFT_CODE_ALREADY_EXISTS', 'Mã ca trực đã tồn tại.', {
        code,
      });
    }

    const existingName = await this.prisma.shiftCatalog.findUnique({
      where: { name },
    });
    if (existingName) {
      throw apiError(HttpStatus.CONFLICT, 'SHIFT_NAME_ALREADY_EXISTS', 'Tên ca trực đã tồn tại.', {
        name,
      });
    }

    const { isOvernight } = calculateShiftMetrics(dto.startTime, dto.endTime);

    const shift = await this.prisma.shiftCatalog.create({
      data: {
        code,
        name,
        startTime: dto.startTime.trim(),
        endTime: dto.endTime.trim(),
        isOvernight,
        sortOrder: dto.sortOrder ?? 0,
        description: dto.description?.trim() || null,
        isActive: true,
      },
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      'SHIFT_CATALOG_CREATED',
      `Tạo ca trực ${shift.name} (${shift.code})`,
      shift.id,
      {
        entityName: 'ShiftCatalog',
        newValues: {
          code: shift.code,
          name: shift.name,
          startTime: shift.startTime,
          endTime: shift.endTime,
          isOvernight: shift.isOvernight,
        },
      },
    );

    return shift;
  }

  /**
   * BTN-4.51 / DL-4.16 Sửa thông tin ca trực (Chỉ CM).
   */
  async update(id: string, dto: UpdateShiftCatalogDto, currentUser: CurrentUserPayload) {
    const existing = await this.prisma.shiftCatalog.findUnique({
      where: { id },
    });
    if (!existing) {
      throw apiError(HttpStatus.NOT_FOUND, 'SHIFT_NOT_FOUND', 'Ca trực không tồn tại.');
    }

    const data: Prisma.ShiftCatalogUpdateInput = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== existing.name) {
        const dupName = await this.prisma.shiftCatalog.findUnique({
          where: { name },
        });
        if (dupName && dupName.id !== id) {
          throw apiError(
            HttpStatus.CONFLICT,
            'SHIFT_NAME_ALREADY_EXISTS',
            'Tên ca trực đã tồn tại.',
            {
              name,
            },
          );
        }
        data.name = name;
      }
    }

    const startTime = dto.startTime ? dto.startTime.trim() : existing.startTime;
    const endTime = dto.endTime ? dto.endTime.trim() : existing.endTime;

    if (dto.startTime !== undefined || dto.endTime !== undefined) {
      const { isOvernight } = calculateShiftMetrics(startTime, endTime);
      data.startTime = startTime;
      data.endTime = endTime;
      data.isOvernight = isOvernight;
    }

    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;

    const updated = await this.prisma.shiftCatalog.update({
      where: { id },
      data,
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      'SHIFT_CATALOG_UPDATED',
      `Cập nhật ca trực ${updated.name} (${updated.code})`,
      updated.id,
      {
        entityName: 'ShiftCatalog',
        oldValues: {
          name: existing.name,
          startTime: existing.startTime,
          endTime: existing.endTime,
        },
        newValues: {
          name: updated.name,
          startTime: updated.startTime,
          endTime: updated.endTime,
        },
      },
    );

    return updated;
  }

  /**
   * BTN-4.52 Ngừng dùng / Dùng lại ca trực (Chỉ CM).
   * Ngừng dùng bị chặn khi còn phân ca từ hôm nay trở đi.
   */
  async setStatus(id: string, dto: SetShiftStatusDto, currentUser: CurrentUserPayload) {
    const existing = await this.prisma.shiftCatalog.findUnique({
      where: { id },
    });
    if (!existing) {
      throw apiError(HttpStatus.NOT_FOUND, 'SHIFT_NOT_FOUND', 'Ca trực không tồn tại.');
    }

    if (!dto.isActive) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeFutureRosters = await this.prisma.shiftRoster.count({
        where: {
          shiftId: id,
          date: { gte: today },
        },
      });

      if (activeFutureRosters > 0) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'SHIFT_HAS_FUTURE_ROSTERS',
          `Ca đang được phân cho ${activeFutureRosters} ngày tới. Vui lòng xóa phân ca trước khi ngừng dùng.`,
          { activeFutureRosters },
        );
      }
    }

    const updated = await this.prisma.shiftCatalog.update({
      where: { id },
      data: { isActive: dto.isActive },
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      dto.isActive ? 'SHIFT_CATALOG_ACTIVATED' : 'SHIFT_CATALOG_DEACTIVATED',
      `${dto.isActive ? 'Kích hoạt lại' : 'Ngừng dùng'} ca trực ${updated.name} (${updated.code})`,
      updated.id,
      {
        entityName: 'ShiftCatalog',
        oldValues: { isActive: existing.isActive },
        newValues: { isActive: dto.isActive },
      },
    );

    return updated;
  }
}
