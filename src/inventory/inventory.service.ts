import { HttpStatus, Injectable } from '@nestjs/common';
import { NotificationCategory, Prisma, RestockStatus, Role, SupplyCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/role.enum';
import {
  AdjustStockDto,
  CreateRestockRequestDto,
  DeliverRestockRequestDto,
  QueryInventoryDto,
  QueryRestockRequestsDto,
  ReviewRestockRequestDto,
} from './dto/inventory.dto';

export type StockHealthStatus = 'SUFFICIENT' | 'LOW_STOCK' | 'OUT_OF_STOCK';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * TASK F4-06-BE: Lấy danh sách tồn kho vật tư theo Khu chuồng
   */
  async findAllStock(query: QueryInventoryDto, currentUser?: CurrentUserPayload) {
    const whereZone: Prisma.StallZoneWhereInput = { isActive: true };
    if (query.zoneId) whereZone.id = query.zoneId;

    const whereSupply: Prisma.SupplyCatalogWhereInput = { isActive: true };
    if (query.category) {
      const cat = query.category.toUpperCase().trim();
      if (cat === 'FEED') {
        whereSupply.category = { in: [SupplyCategory.FEED_HAY, SupplyCategory.FEED_GRAIN] };
      } else if (cat === 'MEDICINE') {
        whereSupply.category = {
          in: [
            SupplyCategory.MEDICINE,
            SupplyCategory.VACCINE,
            SupplyCategory.DEWORMER,
            SupplyCategory.SUPPLEMENT_VITAMIN,
            SupplyCategory.SUPPLEMENT_MINERAL,
            SupplyCategory.SUPPLEMENT_ELECTROLYTE,
            SupplyCategory.SUPPLEMENT_GENERAL,
          ],
        };
      } else if (cat === 'CARE') {
        whereSupply.category = {
          in: [
            SupplyCategory.SUPPLEMENT_VITAMIN,
            SupplyCategory.SUPPLEMENT_MINERAL,
            SupplyCategory.SUPPLEMENT_ELECTROLYTE,
            SupplyCategory.SUPPLEMENT_GENERAL,
          ],
        };
      } else if (cat === 'EQUIPMENT') {
        whereSupply.category = {
          in: [SupplyCategory.TOOL_EQUIPMENT, SupplyCategory.CLEANING_SUPPLY],
        };
      } else if (Object.values(SupplyCategory).includes(cat as SupplyCategory)) {
        whereSupply.category = cat as SupplyCategory;
      }
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      whereSupply.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [zones, supplies, stockBalances] = await Promise.all([
      this.prisma.stallZone.findMany({ where: whereZone, orderBy: { sortOrder: 'asc' } }),
      this.prisma.supplyCatalog.findMany({ where: whereSupply, orderBy: { category: 'asc' } }),
      this.prisma.stockBalance.findMany({
        where: {
          ...(query.zoneId ? { zoneId: query.zoneId } : {}),
        },
        include: {
          lastAdjustedBy: { select: { id: true, fullName: true, role: true } },
        },
      }),
    ]);

    const balanceMap = new Map<string, (typeof stockBalances)[0]>();
    for (const b of stockBalances) {
      balanceMap.set(`${b.zoneId}:${b.supplyId}`, b);
    }

    const result: Array<{
      id?: string;
      zoneId: string;
      zoneCode: string;
      zoneName: string;
      zone: { id: string; code: string; name: string };
      supplyId: string;
      supplyCode: string;
      supplyName: string;
      category: string;
      unit: string;
      supply: {
        id: string;
        code: string;
        name: string;
        category: string;
        unit: string;
        unitPrice: number | null;
      };
      quantity: number;
      minThreshold: number;
      status: StockHealthStatus;
      healthStatus: StockHealthStatus;
      lastInventoryDate?: string | null;
      lastAdjustedBy?: { id: string; fullName: string; role: string } | null;
      notes?: string | null;
    }> = [];

    const isClubManager = currentUser?.role === UserRole.CLUB_MANAGER;

    for (const zone of zones) {
      for (const supply of supplies) {
        const key = `${zone.id}:${supply.id}`;
        const existing = balanceMap.get(key);

        const qty = existing ? Number(existing.quantity) : 0;
        const threshold = existing ? Number(existing.minThreshold) : 10;

        let healthStatus: StockHealthStatus = 'SUFFICIENT';
        if (qty <= 0) {
          healthStatus = 'OUT_OF_STOCK';
        } else if (qty < threshold) {
          healthStatus = 'LOW_STOCK';
        }

        if (query.lowStockOnly && healthStatus === 'SUFFICIENT') {
          continue;
        }

        result.push({
          id: existing?.id || `${zone.id}_${supply.id}`,
          zoneId: zone.id,
          zoneCode: zone.code,
          zoneName: zone.name,
          zone: { id: zone.id, code: zone.code, name: zone.name },
          supplyId: supply.id,
          supplyCode: supply.code,
          supplyName: supply.name,
          category: supply.category,
          unit: supply.unit,
          supply: {
            id: supply.id,
            code: supply.code,
            name: supply.name,
            category: supply.category,
            unit: supply.unit,
            unitPrice: isClubManager ? Number(supply.unitPrice) : null,
          },
          quantity: qty,
          minThreshold: threshold,
          status: healthStatus,
          healthStatus,
          lastInventoryDate: existing?.lastInventoryDate
            ? existing.lastInventoryDate.toISOString()
            : null,
          lastAdjustedBy: existing?.lastAdjustedBy,
          notes: existing?.notes,
        });
      }
    }

    const lowStockCount = result.filter((i) => i.healthStatus === 'LOW_STOCK').length;
    const outOfStockCount = result.filter((i) => i.healthStatus === 'OUT_OF_STOCK').length;

    return {
      items: result,
      total: result.length,
      lowStockCount,
      outOfStockCount,
      summary: {
        totalItems: result.length,
        sufficientCount: result.filter((i) => i.healthStatus === 'SUFFICIENT').length,
        lowStockCount,
        outOfStockCount,
      },
    };
  }

  /**
   * TASK F4-06-BE: Kiểm kê & Điều chỉnh số lượng tồn kho (Chỉ Club Manager)
   */
  async adjustStock(dto: AdjustStockDto, currentUser: CurrentUserPayload) {
    if (currentUser.role !== UserRole.CLUB_MANAGER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Chỉ Quản lý CLB được quyền kiểm kê điều chỉnh tồn kho.',
      );
    }

    const [zone, supply] = await Promise.all([
      this.prisma.stallZone.findUnique({ where: { id: dto.zoneId } }),
      this.prisma.supplyCatalog.findUnique({ where: { id: dto.supplyId } }),
    ]);

    if (!zone) throw apiError(HttpStatus.NOT_FOUND, 'ZONE_NOT_FOUND', 'Khu chuồng không tồn tại.');
    if (!supply) throw apiError(HttpStatus.NOT_FOUND, 'SUPPLY_NOT_FOUND', 'Vật tư không tồn tại.');

    const now = new Date();
    const updated = await this.prisma.stockBalance.upsert({
      where: {
        zoneId_supplyId: {
          zoneId: dto.zoneId,
          supplyId: dto.supplyId,
        },
      },
      create: {
        zoneId: dto.zoneId,
        supplyId: dto.supplyId,
        quantity: new Prisma.Decimal(dto.actualQuantity),
        minThreshold:
          dto.minThreshold !== undefined
            ? new Prisma.Decimal(dto.minThreshold)
            : new Prisma.Decimal(10),
        lastInventoryDate: now,
        lastAdjustedById: currentUser.userId,
        notes: dto.notes || dto.reason,
      },
      update: {
        quantity: new Prisma.Decimal(dto.actualQuantity),
        ...(dto.minThreshold !== undefined
          ? { minThreshold: new Prisma.Decimal(dto.minThreshold) }
          : {}),
        lastInventoryDate: now,
        lastAdjustedById: currentUser.userId,
        notes: dto.notes || dto.reason,
      },
      include: {
        zone: { select: { id: true, code: true, name: true } },
        supply: { select: { id: true, code: true, name: true, category: true, unit: true } },
        lastAdjustedBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      'STOCK_ADJUSTED',
      `Kiểm kê điều chỉnh tồn kho vật tư ${supply.name} tại ${zone.name}: ${dto.actualQuantity} ${supply.unit}. Lý do: ${dto.reason || 'Kiểm kê định kỳ'}`,
      updated.id,
      {
        entityName: 'StockBalance',
        newValues: {
          zoneId: dto.zoneId,
          supplyId: dto.supplyId,
          quantity: dto.actualQuantity,
        },
      },
    );

    return {
      ...updated,
      quantity: Number(updated.quantity),
      minThreshold: Number(updated.minThreshold),
    };
  }

  /**
   * Helper: Trừ kho tự động khi hoàn thành bữa ăn (FEEDING task)
   */
  async deductStockForFeeding(
    zoneId: string,
    items: Array<{ supplyId?: string; amount?: number }>,
  ) {
    if (!zoneId || !items || !Array.isArray(items) || items.length === 0) return;

    for (const item of items) {
      if (!item.supplyId || !item.amount || Number(item.amount) <= 0) continue;
      const amount = Number(item.amount);

      try {
        await this.prisma.stockBalance.upsert({
          where: {
            zoneId_supplyId: {
              zoneId,
              supplyId: item.supplyId,
            },
          },
          create: {
            zoneId,
            supplyId: item.supplyId,
            quantity: new Prisma.Decimal(-amount),
            minThreshold: new Prisma.Decimal(10),
          },
          update: {
            quantity: { decrement: new Prisma.Decimal(amount) },
          },
        });
      } catch (err) {
        console.error(`Failed to deduct stock for zone ${zoneId}, supply ${item.supplyId}:`, err);
      }
    }
  }

  /**
   * Helper: Hoàn lại số lượng tồn kho khi hoàn tác bữa ăn
   */
  async restoreStockForFeeding(
    zoneId: string,
    items: Array<{ supplyId?: string; amount?: number }>,
  ) {
    if (!zoneId || !items || !Array.isArray(items) || items.length === 0) return;

    for (const item of items) {
      if (!item.supplyId || !item.amount || Number(item.amount) <= 0) continue;
      const amount = Number(item.amount);

      try {
        await this.prisma.stockBalance.update({
          where: {
            zoneId_supplyId: {
              zoneId,
              supplyId: item.supplyId,
            },
          },
          data: {
            quantity: { increment: new Prisma.Decimal(amount) },
          },
        });
      } catch (err) {
        console.error(`Failed to restore stock for zone ${zoneId}, supply ${item.supplyId}:`, err);
      }
    }
  }

  /**
   * TASK F4-07-BE: Tạo phiếu đề xuất bổ sung vật tư (RestockRequest)
   */
  async createRestockRequest(dto: CreateRestockRequestDto, currentUser: CurrentUserPayload) {
    const [zone, supply] = await Promise.all([
      this.prisma.stallZone.findUnique({ where: { id: dto.zoneId } }),
      this.prisma.supplyCatalog.findUnique({ where: { id: dto.supplyId } }),
    ]);

    if (!zone) throw apiError(HttpStatus.NOT_FOUND, 'ZONE_NOT_FOUND', 'Khu chuồng không tồn tại.');
    if (!supply) throw apiError(HttpStatus.NOT_FOUND, 'SUPPLY_NOT_FOUND', 'Vật tư không tồn tại.');

    const now = new Date();
    const count = await this.prisma.restockRequest.count();
    const yy = now.getFullYear().toString().slice(-2);
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const requestNumber = `REQ-${yy}${mm}-${(count + 1).toString().padStart(4, '0')}`;

    const created = await this.prisma.restockRequest.create({
      data: {
        requestNumber,
        zoneId: dto.zoneId,
        supplyId: dto.supplyId,
        requestedQuantity: new Prisma.Decimal(dto.requestedQuantity),
        urgencyReason: dto.urgencyReason,
        requestedById: currentUser.userId,
        status: RestockStatus.PENDING,
      },
      include: {
        zone: { select: { id: true, code: true, name: true } },
        supply: { select: { id: true, code: true, name: true, category: true, unit: true } },
        requestedBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    // Thông báo cho Club Manager
    await this.notificationsService.notifyRoles(
      [Role.CLUB_MANAGER],
      {
        type: 'RESTOCK_REQUEST_CREATED',
        category: NotificationCategory.SYSTEM,
        title: 'Phiếu đề xuất vật tư mới',
        message: `Nhân viên ${currentUser.fullName} đã đề xuất bổ sung ${dto.requestedQuantity} ${supply.unit} ${supply.name} cho ${zone.name}.`,
        link: '/supplies/requests',
        senderName: currentUser.fullName,
        params: { requestNumber, zoneName: zone.name, supplyName: supply.name },
        dedupeKey: `restock_${created.id}`,
      },
      currentUser.userId,
    );

    return {
      ...created,
      requestedQuantity: Number(created.requestedQuantity),
    };
  }

  /**
   * TASK F4-07-BE: Lấy danh sách phiếu đề xuất vật tư
   */
  async findAllRestockRequests(query: QueryRestockRequestsDto, currentUser?: CurrentUserPayload) {
    const where: Prisma.RestockRequestWhereInput = {};
    if (query.zoneId) where.zoneId = query.zoneId;
    if (query.status) where.status = query.status;

    // Nếu là Groom: chỉ xem phiếu của mình hoặc khu chuồng mình
    if (currentUser?.role === UserRole.GROOM) {
      where.requestedById = currentUser.userId;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { requestNumber: { contains: term, mode: 'insensitive' } },
        { supply: { name: { contains: term, mode: 'insensitive' } } },
        { supply: { code: { contains: term, mode: 'insensitive' } } },
        { urgencyReason: { contains: term, mode: 'insensitive' } },
      ];
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.restockRequest.findMany({
        where,
        include: {
          zone: { select: { id: true, code: true, name: true } },
          supply: { select: { id: true, code: true, name: true, category: true, unit: true } },
          requestedBy: { select: { id: true, fullName: true, role: true } },
          reviewedBy: { select: { id: true, fullName: true, role: true } },
          deliveredBy: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.restockRequest.count({ where }),
    ]);

    return {
      items: items.map((it) => ({
        ...it,
        requestedQuantity: Number(it.requestedQuantity),
        approvedQuantity: it.approvedQuantity ? Number(it.approvedQuantity) : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOneRestockRequest(id: string) {
    const it = await this.prisma.restockRequest.findUnique({
      where: { id },
      include: {
        zone: { select: { id: true, code: true, name: true } },
        supply: { select: { id: true, code: true, name: true, category: true, unit: true } },
        requestedBy: { select: { id: true, fullName: true, role: true } },
        reviewedBy: { select: { id: true, fullName: true, role: true } },
        deliveredBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    if (!it) {
      throw apiError(HttpStatus.NOT_FOUND, 'REQUEST_NOT_FOUND', 'Phiếu đề xuất không tồn tại.');
    }

    return {
      ...it,
      requestedQuantity: Number(it.requestedQuantity),
      approvedQuantity: it.approvedQuantity ? Number(it.approvedQuantity) : null,
    };
  }

  /**
   * TASK F4-07-BE: Phê duyệt hoặc từ chối phiếu đề xuất (Chỉ Club Manager)
   */
  async reviewRestockRequest(
    id: string,
    dto: ReviewRestockRequestDto,
    currentUser: CurrentUserPayload,
  ) {
    if (currentUser.role !== UserRole.CLUB_MANAGER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Chỉ Quản lý CLB được quyền phê duyệt đề xuất vật tư.',
      );
    }

    const request = await this.prisma.restockRequest.findUnique({
      where: { id },
      include: { supply: true, zone: true },
    });

    if (!request) {
      throw apiError(HttpStatus.NOT_FOUND, 'REQUEST_NOT_FOUND', 'Phiếu đề xuất không tồn tại.');
    }

    if (request.status !== RestockStatus.PENDING) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_STATUS',
        'Chỉ phê duyệt được các phiếu đang chờ duyệt (PENDING).',
      );
    }

    const now = new Date();
    const isApproved = dto.action === 'APPROVE';

    const updated = await this.prisma.restockRequest.update({
      where: { id },
      data: {
        status: isApproved ? RestockStatus.APPROVED : RestockStatus.REJECTED,
        approvedQuantity: isApproved
          ? new Prisma.Decimal(dto.approvedQuantity || Number(request.requestedQuantity))
          : null,
        rejectionReason: !isApproved ? dto.rejectionReason : null,
        reviewedAt: now,
        reviewedById: currentUser.userId,
      },
      include: {
        zone: { select: { id: true, code: true, name: true } },
        supply: { select: { id: true, code: true, name: true, category: true, unit: true } },
        requestedBy: { select: { id: true, fullName: true, role: true } },
        reviewedBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      isApproved ? 'RESTOCK_APPROVED' : 'RESTOCK_REJECTED',
      `Phiếu đề xuất ${request.requestNumber} (${request.supply.name} - ${request.zone.name}) đã được ${isApproved ? 'DUYỆT' : 'TỪ CHỐI'} bởi ${currentUser.fullName}.`,
      request.id,
      {
        entityName: 'RestockRequest',
        newValues: { status: updated.status, approvedQuantity: updated.approvedQuantity },
      },
    );

    // Bắn thông báo cho người tạo đề xuất
    await this.notificationsService.notifyUsers(
      [request.requestedById],
      {
        type: isApproved ? 'RESTOCK_APPROVED' : 'RESTOCK_REJECTED',
        category: NotificationCategory.SYSTEM,
        title: isApproved ? 'Đề xuất vật tư đã được phê duyệt' : 'Đề xuất vật tư bị từ chối',
        message: isApproved
          ? `Quản lý đã duyệt bổ sung ${updated.approvedQuantity} ${request.supply.unit} ${request.supply.name}.`
          : `Đề xuất ${request.requestNumber} bị từ chối. Lý do: ${dto.rejectionReason || 'Không phù hợp'}`,
        link: '/supplies/requests',
        senderName: currentUser.fullName,
        params: { requestNumber: request.requestNumber || '' },
      },
      currentUser.userId,
    );

    return {
      ...updated,
      requestedQuantity: Number(updated.requestedQuantity),
      approvedQuantity: updated.approvedQuantity ? Number(updated.approvedQuantity) : null,
    };
  }

  /**
   * TASK F4-07-BE: Xác nhận nhận hàng / Nhập kho & TỰ ĐỘNG CỘNG TỒN KHO
   */
  async deliverRestockRequest(
    id: string,
    dto: DeliverRestockRequestDto,
    currentUser: CurrentUserPayload,
  ) {
    if (currentUser.role !== UserRole.CLUB_MANAGER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Chỉ Quản lý CLB được quyền xác nhận nhập kho.',
      );
    }

    const request = await this.prisma.restockRequest.findUnique({
      where: { id },
      include: { supply: true, zone: true },
    });

    if (!request) {
      throw apiError(HttpStatus.NOT_FOUND, 'REQUEST_NOT_FOUND', 'Phiếu đề xuất không tồn tại.');
    }

    if (request.status !== RestockStatus.APPROVED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_STATUS',
        'Chỉ xác nhận nhập kho đối với phiếu đã được duyệt (APPROVED).',
      );
    }

    const amountToAdd = Number(request.approvedQuantity || request.requestedQuantity);
    const now = new Date();

    // Transaction: cập nhật phiếu sang DELIVERED & cộng dồn vào StockBalance
    const [updated] = await this.prisma.$transaction([
      this.prisma.restockRequest.update({
        where: { id },
        data: {
          status: RestockStatus.DELIVERED,
          deliveredAt: now,
          deliveredById: currentUser.userId,
        },
        include: {
          zone: { select: { id: true, code: true, name: true } },
          supply: { select: { id: true, code: true, name: true, category: true, unit: true } },
          requestedBy: { select: { id: true, fullName: true, role: true } },
          reviewedBy: { select: { id: true, fullName: true, role: true } },
          deliveredBy: { select: { id: true, fullName: true, role: true } },
        },
      }),
      this.prisma.stockBalance.upsert({
        where: {
          zoneId_supplyId: {
            zoneId: request.zoneId,
            supplyId: request.supplyId,
          },
        },
        create: {
          zoneId: request.zoneId,
          supplyId: request.supplyId,
          quantity: new Prisma.Decimal(amountToAdd),
          minThreshold: new Prisma.Decimal(10),
          lastInventoryDate: now,
          lastAdjustedById: currentUser.userId,
          notes: `Nhập kho từ phiếu đề xuất ${request.requestNumber}`,
        },
        update: {
          quantity: { increment: new Prisma.Decimal(amountToAdd) },
          lastInventoryDate: now,
          lastAdjustedById: currentUser.userId,
          notes: `Nhập kho từ phiếu đề xuất ${request.requestNumber}`,
        },
      }),
    ]);

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      'STOCK_RESTOCKED',
      `Xác nhận nhập kho thành công: +${amountToAdd} ${request.supply.unit} ${request.supply.name} tại ${request.zone.name}. Phiếu ${request.requestNumber}.`,
      request.id,
      {
        entityName: 'RestockRequest',
        newValues: { status: RestockStatus.DELIVERED, addedQuantity: amountToAdd },
      },
    );

    // Bắn thông báo cho người tạo đề xuất
    await this.notificationsService.notifyUsers(
      [request.requestedById],
      {
        type: 'RESTOCK_DELIVERED',
        category: NotificationCategory.SYSTEM,
        title: 'Vật tư đã được nhập kho',
        message: `Đơn đề xuất ${request.requestNumber} đã được xác nhận nhập kho (+${amountToAdd} ${request.supply.unit} ${request.supply.name}) tại ${request.zone.name}.`,
        link: '/supplies/inventory',
        senderName: currentUser.fullName,
        params: { requestNumber: request.requestNumber || '' },
      },
      currentUser.userId,
    );

    return {
      ...updated,
      requestedQuantity: Number(updated.requestedQuantity),
      approvedQuantity: updated.approvedQuantity ? Number(updated.approvedQuantity) : null,
    };
  }
}
