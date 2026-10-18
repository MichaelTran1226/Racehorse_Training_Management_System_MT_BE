import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/role.enum';
import {
  CreateSupplyCatalogDto,
  QuerySupplyCatalogDto,
  SetSupplyStatusDto,
  UpdateSupplyCatalogDto,
} from './dto/supply.dto';

@Injectable()
export class SuppliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * SC-4.10 Danh mục vật tư.
   * Q-4.11: Đơn giá chỉ Club Manager được xem, các vai trò khác nhận null.
   */
  async findAll(query: QuerySupplyCatalogDto, currentUser?: CurrentUserPayload) {
    const where: Prisma.SupplyCatalogWhereInput = {};
    if (query.category) where.category = query.category;
    if (query.status === 'ACTIVE') where.isActive = true;
    if (query.status === 'INACTIVE') where.isActive = false;

    const term = query.search?.trim();
    if (term) {
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.supplyCatalog.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const isClubManager = currentUser?.role === UserRole.CLUB_MANAGER;

    return items.map((item) => ({
      ...item,
      unitPrice: isClubManager ? Number(item.unitPrice) : null,
    }));
  }

  async findOne(id: string, currentUser?: CurrentUserPayload) {
    const item = await this.prisma.supplyCatalog.findUnique({
      where: { id },
    });
    if (!item) {
      throw apiError(HttpStatus.NOT_FOUND, 'SUPPLY_NOT_FOUND', 'Vật tư không tồn tại.');
    }

    const isClubManager = currentUser?.role === UserRole.CLUB_MANAGER;
    return {
      ...item,
      unitPrice: isClubManager ? Number(item.unitPrice) : null,
    };
  }

  /**
   * BTN-4.47 / DL-4.15 Thêm vật tư mới (Chỉ CM).
   */
  async create(dto: CreateSupplyCatalogDto, currentUser: CurrentUserPayload) {
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();

    const existingCode = await this.prisma.supplyCatalog.findUnique({
      where: { code },
    });
    if (existingCode) {
      throw apiError(HttpStatus.CONFLICT, 'SUPPLY_CODE_ALREADY_EXISTS', 'Mã vật tư đã tồn tại.', {
        code,
      });
    }

    const existingName = await this.prisma.supplyCatalog.findUnique({
      where: { name },
    });
    if (existingName) {
      throw apiError(HttpStatus.CONFLICT, 'SUPPLY_NAME_ALREADY_EXISTS', 'Tên vật tư đã tồn tại.', {
        name,
      });
    }

    const item = await this.prisma.supplyCatalog.create({
      data: {
        code,
        name,
        category: dto.category,
        unit: dto.unit,
        unitPrice:
          dto.unitPrice !== undefined ? new Prisma.Decimal(dto.unitPrice) : new Prisma.Decimal(0),
        withdrawalDays: dto.withdrawalDays ?? null,
        description: dto.description?.trim() || null,
        isActive: true,
      },
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      'SUPPLY_CATALOG_CREATED',
      `Tạo vật tư ${item.name} (${item.code})`,
      item.id,
      {
        entityName: 'SupplyCatalog',
        newValues: {
          code: item.code,
          name: item.name,
          category: item.category,
          unit: item.unit,
        },
      },
    );

    return {
      ...item,
      unitPrice: Number(item.unitPrice),
    };
  }

  /**
   * BTN-4.48 / DL-4.15 Sửa thông tin vật tư (Chỉ CM).
   */
  async update(id: string, dto: UpdateSupplyCatalogDto, currentUser: CurrentUserPayload) {
    const existing = await this.prisma.supplyCatalog.findUnique({
      where: { id },
    });
    if (!existing) {
      throw apiError(HttpStatus.NOT_FOUND, 'SUPPLY_NOT_FOUND', 'Vật tư không tồn tại.');
    }

    const data: Prisma.SupplyCatalogUpdateInput = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== existing.name) {
        const dupName = await this.prisma.supplyCatalog.findUnique({
          where: { name },
        });
        if (dupName && dupName.id !== id) {
          throw apiError(
            HttpStatus.CONFLICT,
            'SUPPLY_NAME_ALREADY_EXISTS',
            'Tên vật tư đã tồn tại.',
            {
              name,
            },
          );
        }
        data.name = name;
      }
    }

    if (dto.category !== undefined) data.category = dto.category;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.unitPrice !== undefined) data.unitPrice = new Prisma.Decimal(dto.unitPrice);
    if (dto.withdrawalDays !== undefined) data.withdrawalDays = dto.withdrawalDays;
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;

    const updated = await this.prisma.supplyCatalog.update({
      where: { id },
      data,
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      'SUPPLY_CATALOG_UPDATED',
      `Cập nhật vật tư ${updated.name} (${updated.code})`,
      updated.id,
      {
        entityName: 'SupplyCatalog',
        oldValues: {
          name: existing.name,
          category: existing.category,
          unit: existing.unit,
          unitPrice: Number(existing.unitPrice),
        },
        newValues: {
          name: updated.name,
          category: updated.category,
          unit: updated.unit,
          unitPrice: Number(updated.unitPrice),
        },
      },
    );

    return {
      ...updated,
      unitPrice: Number(updated.unitPrice),
    };
  }

  /**
   * BTN-4.49 Ngừng dùng / Dùng lại vật tư (Chỉ CM).
   */
  async setStatus(id: string, dto: SetSupplyStatusDto, currentUser: CurrentUserPayload) {
    const existing = await this.prisma.supplyCatalog.findUnique({
      where: { id },
    });
    if (!existing) {
      throw apiError(HttpStatus.NOT_FOUND, 'SUPPLY_NOT_FOUND', 'Vật tư không tồn tại.');
    }

    const updated = await this.prisma.supplyCatalog.update({
      where: { id },
      data: { isActive: dto.isActive },
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      dto.isActive ? 'SUPPLY_CATALOG_ACTIVATED' : 'SUPPLY_CATALOG_DEACTIVATED',
      `${dto.isActive ? 'Kích hoạt lại' : 'Ngừng dùng'} vật tư ${updated.name} (${updated.code})`,
      updated.id,
      {
        entityName: 'SupplyCatalog',
        oldValues: { isActive: existing.isActive },
        newValues: { isActive: dto.isActive },
      },
    );

    return {
      ...updated,
      unitPrice: Number(updated.unitPrice),
    };
  }
}
