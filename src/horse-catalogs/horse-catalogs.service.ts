import { HttpStatus, Injectable } from '@nestjs/common';
import { HorseCatalogType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import {
  CreateHorseCatalogItemDto,
  QueryHorseCatalogDto,
  SetHorseCatalogStatusDto,
  UpdateHorseCatalogItemDto,
} from './dto/horse-catalog.dto';

type Tx = Prisma.TransactionClient | PrismaService;

/** Cột của Horse lưu tên mục danh mục tương ứng. */
const HORSE_FIELD: Record<HorseCatalogType, 'breed' | 'color'> = {
  BREED: 'breed',
  COLOR: 'color',
};

/**
 * SC-1.06 Danh mục Giống & Màu lông. CM thêm / sửa / ngừng dùng / dùng lại; mọi vai trò xem.
 * Không có xóa cứng (Q-1.19). Horse.breed / Horse.color lưu Tên của mục, nên đổi tên thì cập nhật
 * luôn các ngựa đang dùng trong cùng transaction.
 */
@Injectable()
export class HorseCatalogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryHorseCatalogDto) {
    const where: Prisma.HorseCatalogItemWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.status === 'ACTIVE') where.isActive = true;
    if (query.status === 'INACTIVE') where.isActive = false;
    const term = query.search?.trim();
    if (term) {
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.horseCatalogItem.findMany({
      where,
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    const [breeds, colors] = await Promise.all([
      this.prisma.horse.groupBy({
        by: ['breed'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.horse.groupBy({
        by: ['color'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
    ]);
    const used = {
      BREED: new Map(breeds.map((b) => [b.breed.toLowerCase(), b._count._all])),
      COLOR: new Map(colors.map((c) => [c.color.toLowerCase(), c._count._all])),
    };
    return items.map((item) => ({
      ...item,
      horseCount: used[item.type].get(item.name.toLowerCase()) ?? 0,
    }));
  }

  async create(dto: CreateHorseCatalogItemDto, user: CurrentUserPayload) {
    await this.assertUnique(dto.type, dto.code, dto.name);
    const item = await this.prisma.horseCatalogItem.create({
      data: {
        type: dto.type,
        code: dto.code,
        name: dto.name,
        description: dto.description || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'HORSE_CATALOG_CREATED',
      `Created ${item.type} catalog item ${item.code} "${item.name}"`,
      item.id,
      { entityName: 'HorseCatalogItem', newValues: item },
    );
    return item;
  }

  async update(id: string, dto: UpdateHorseCatalogItemDto, user: CurrentUserPayload) {
    const existing = await this.findOrThrow(id);
    const renamed = dto.name !== undefined && dto.name !== existing.name;
    if (renamed) await this.assertUnique(existing.type, undefined, dto.name, id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.horseCatalogItem.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description || null }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        },
      });
      if (renamed) {
        const field = HORSE_FIELD[existing.type];
        await tx.horse.updateMany({
          where: { [field]: { equals: existing.name, mode: 'insensitive' } },
          data: { [field]: item.name },
        });
      }
      return item;
    });

    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      'HORSE_CATALOG_UPDATED',
      `Updated ${updated.type} catalog item ${updated.code}`,
      id,
      { entityName: 'HorseCatalogItem', oldValues: existing, newValues: updated },
    );
    return updated;
  }

  async setStatus(id: string, dto: SetHorseCatalogStatusDto, user: CurrentUserPayload) {
    const existing = await this.findOrThrow(id);
    const updated = await this.prisma.horseCatalogItem.update({
      where: { id },
      data: { isActive: dto.isActive },
    });
    await this.auditService.record(
      { id: user.userId, name: user.fullName || user.email },
      dto.isActive ? 'HORSE_CATALOG_ACTIVATED' : 'HORSE_CATALOG_DEACTIVATED',
      `${dto.isActive ? 'Activated' : 'Deactivated'} ${existing.type} catalog item ${existing.code}`,
      id,
      {
        entityName: 'HorseCatalogItem',
        oldValues: { isActive: existing.isActive },
        newValues: { isActive: dto.isActive },
      },
    );
    return updated;
  }

  /**
   * Kiểm Giống / Màu lông khi tạo hoặc sửa ngựa (SC-1.02): phải là mục đang dùng. Khi sửa, giữ nguyên
   * giá trị cũ thì vẫn hợp lệ dù mục đó đã ngừng dùng. Trả về tên chuẩn của mục (đúng hoa thường).
   */
  async resolveName(
    type: HorseCatalogType,
    value: string,
    currentValue?: string,
    db: Tx = this.prisma,
  ): Promise<string> {
    const name = value.trim();
    if (currentValue && name.toLowerCase() === currentValue.toLowerCase()) return currentValue;
    const item = await db.horseCatalogItem.findFirst({
      where: { type, name: { equals: name, mode: 'insensitive' } },
    });
    if (!item || !item.isActive) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        type === HorseCatalogType.BREED ? 'INVALID_BREED' : 'INVALID_COLOR',
        type === HorseCatalogType.BREED
          ? 'Giống ngựa không tồn tại hoặc đã ngừng sử dụng.'
          : 'Màu lông không tồn tại hoặc đã ngừng sử dụng.',
      );
    }
    return item.name;
  }

  private async findOrThrow(id: string) {
    const item = await this.prisma.horseCatalogItem.findUnique({ where: { id } });
    if (!item) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'CATALOG_ITEM_NOT_FOUND',
        'Không tìm thấy mục danh mục.',
      );
    }
    return item;
  }

  private async assertUnique(
    type: HorseCatalogType,
    code?: string,
    name?: string,
    exceptId?: string,
  ) {
    const notSelf = exceptId ? { id: { not: exceptId } } : {};
    if (code) {
      const dup = await this.prisma.horseCatalogItem.findFirst({
        where: { type, code, ...notSelf },
      });
      if (dup) throw apiError(HttpStatus.CONFLICT, 'DUPLICATE_CATALOG_CODE', 'Mã đã tồn tại.');
    }
    if (name) {
      const dup = await this.prisma.horseCatalogItem.findFirst({
        where: { type, name: { equals: name, mode: 'insensitive' }, ...notSelf },
      });
      if (dup) throw apiError(HttpStatus.CONFLICT, 'DUPLICATE_CATALOG_NAME', 'Tên đã tồn tại.');
    }
  }
}
