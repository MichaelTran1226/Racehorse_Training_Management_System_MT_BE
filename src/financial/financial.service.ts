import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { apiError } from '../common/exceptions/api-error';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { QueryInvoiceDto } from './dto/query-invoice.dto';

export interface FinancialActor {
  id: string;
  name: string;
  role: string;
}

@Injectable()
export class FinancialService {
  private readonly logger = new Logger(FinancialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Lấy danh sách hóa đơn theo phân quyền
   * Chủ ngựa chỉ được xem hóa đơn đứng tên mình.
   */
  async findAll(query: QueryInvoiceDto, user: FinancialActor) {
    const { page = 1, limit = 20, horseId, billingPeriod, status } = query;
    const skip = (page - 1) * limit;

    // Rào chắn phân quyền: HORSE_OWNER chỉ thấy hóa đơn của chính mình
    const ownerId = user.role === 'HORSE_OWNER' ? user.id : query.ownerId;

    const where: Prisma.FinancialInvoiceWhereInput = {
      ...(ownerId && { ownerId }),
      ...(horseId && { horseId }),
      ...(billingPeriod && { billingPeriod }),
      ...(status && { status }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.financialInvoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ billingPeriod: 'desc' }, { createdAt: 'desc' }],
        include: {
          horse: {
            select: {
              id: true,
              name: true,
              horseCode: true,
              breed: true,
              avatarUrl: true,
            },
          },
          owner: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phoneNumber: true,
            },
          },
        },
      }),
      this.prisma.financialInvoice.count({ where }),
    ]);

    return {
      items: items.map((inv) => ({
        ...inv,
        boardingFee: Number(inv.boardingFee),
        medicalFee: Number(inv.medicalFee),
        trainingFee: Number(inv.trainingFee),
        prizeCredit: Number(inv.prizeCredit),
        netAmount: Number(inv.netAmount),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Xem chi tiết hóa đơn
   */
  async findOne(id: string, user: FinancialActor) {
    const invoice = await this.prisma.financialInvoice.findUnique({
      where: { id },
      include: {
        horse: true,
        owner: { select: { id: true, fullName: true, email: true, phoneNumber: true } },
      },
    });

    if (!invoice) {
      throw apiError(HttpStatus.NOT_FOUND, 'INVOICE_NOT_FOUND', `Invoice ${id} not found`);
    }

    if (user.role === 'HORSE_OWNER' && invoice.ownerId !== user.id) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'You can only view financial statements for your own horses.',
      );
    }

    return {
      ...invoice,
      boardingFee: Number(invoice.boardingFee),
      medicalFee: Number(invoice.medicalFee),
      trainingFee: Number(invoice.trainingFee),
      prizeCredit: Number(invoice.prizeCredit),
      netAmount: Number(invoice.netAmount),
    };
  }

  /**
   * Tạo hóa đơn tài chính mới (Club Manager)
   */
  async create(dto: CreateInvoiceDto, user: FinancialActor) {
    const boardingFee = dto.boardingFee ?? 0;
    const medicalFee = dto.medicalFee ?? 0;
    const trainingFee = dto.trainingFee ?? 0;
    const prizeCredit = dto.prizeCredit ?? 0;
    const netAmount = boardingFee + medicalFee + trainingFee - prizeCredit;

    const invoice = await this.prisma.financialInvoice.create({
      data: {
        horseId: dto.horseId,
        ownerId: dto.ownerId,
        billingPeriod: dto.billingPeriod,
        boardingFee,
        medicalFee,
        trainingFee,
        prizeCredit,
        netAmount,
        status: dto.status ?? InvoiceStatus.DRAFT,
        invoiceUrl: dto.invoiceUrl,
      },
      include: {
        horse: { select: { name: true } },
        owner: { select: { fullName: true } },
      },
    });

    await this.audit.record(
      { id: user.id, name: user.name },
      'INVOICE_CREATED',
      `Created invoice for horse ${invoice.horse.name} (${invoice.billingPeriod}) - Net: ${netAmount.toLocaleString()} VND`,
      invoice.id,
      { entityName: 'FinancialInvoice', newValues: invoice },
    );

    return {
      ...invoice,
      boardingFee: Number(invoice.boardingFee),
      medicalFee: Number(invoice.medicalFee),
      trainingFee: Number(invoice.trainingFee),
      prizeCredit: Number(invoice.prizeCredit),
      netAmount: Number(invoice.netAmount),
    };
  }

  /**
   * Cập nhật hóa đơn
   */
  async update(id: string, dto: UpdateInvoiceDto, user: FinancialActor) {
    const existing = await this.prisma.financialInvoice.findUnique({ where: { id } });
    if (!existing) {
      throw apiError(HttpStatus.NOT_FOUND, 'INVOICE_NOT_FOUND', `Invoice ${id} not found`);
    }

    if (existing.status === InvoiceStatus.PAID) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVOICE_ALREADY_PAID',
        'Cannot modify an invoice that has already been marked as PAID.',
      );
    }

    const boardingFee =
      dto.boardingFee !== undefined ? dto.boardingFee : Number(existing.boardingFee);
    const medicalFee = dto.medicalFee !== undefined ? dto.medicalFee : Number(existing.medicalFee);
    const trainingFee =
      dto.trainingFee !== undefined ? dto.trainingFee : Number(existing.trainingFee);
    const prizeCredit =
      dto.prizeCredit !== undefined ? dto.prizeCredit : Number(existing.prizeCredit);
    const netAmount = boardingFee + medicalFee + trainingFee - prizeCredit;

    const updated = await this.prisma.financialInvoice.update({
      where: { id },
      data: {
        ...(dto.billingPeriod && { billingPeriod: dto.billingPeriod }),
        boardingFee,
        medicalFee,
        trainingFee,
        prizeCredit,
        netAmount,
        ...(dto.status && { status: dto.status }),
        ...(dto.invoiceUrl !== undefined && { invoiceUrl: dto.invoiceUrl }),
      },
    });

    await this.audit.record(
      { id: user.id, name: user.name },
      'INVOICE_UPDATED',
      `Updated invoice ${id} (${updated.billingPeriod})`,
      id,
      { entityName: 'FinancialInvoice', oldValues: existing, newValues: updated },
    );

    return {
      ...updated,
      boardingFee: Number(updated.boardingFee),
      medicalFee: Number(updated.medicalFee),
      trainingFee: Number(updated.trainingFee),
      prizeCredit: Number(updated.prizeCredit),
      netAmount: Number(updated.netAmount),
    };
  }

  /**
   * Đổi trạng thái hóa đơn (DRAFT -> SENT -> PAID | OVERDUE | CANCELLED)
   */
  async changeStatus(id: string, status: InvoiceStatus, user: FinancialActor) {
    const existing = await this.prisma.financialInvoice.findUnique({
      where: { id },
      include: { horse: true },
    });

    if (!existing) {
      throw apiError(HttpStatus.NOT_FOUND, 'INVOICE_NOT_FOUND', `Invoice ${id} not found`);
    }

    const updated = await this.prisma.financialInvoice.update({
      where: { id },
      data: { status },
    });

    await this.audit.record(
      { id: user.id, name: user.name },
      'INVOICE_STATUS_CHANGED',
      `Changed invoice ${id} status from ${existing.status} to ${status}`,
      id,
      {
        entityName: 'FinancialInvoice',
        oldValues: { status: existing.status },
        newValues: { status },
      },
    );

    // Nếu phát hành hóa đơn (SENT), gửi thông báo cho Chủ ngựa
    if (status === InvoiceStatus.SENT && existing.ownerId) {
      await this.notifications.notifyUsers(
        [existing.ownerId],
        {
          type: 'INVOICE_SENT',
          category: 'ACCOUNT',
          title: 'Sao kê chi phí & Tiền thưởng tháng mới',
          message: `Báo cáo tài chính kỳ ${existing.billingPeriod} cho ngựa ${existing.horse.name} đã được phát hành.`,
          link: `/owner/financial-reports`,
          params: { billingPeriod: existing.billingPeriod, horseName: existing.horse.name },
        },
        user.id,
      );
    }

    return {
      ...updated,
      boardingFee: Number(updated.boardingFee),
      medicalFee: Number(updated.medicalFee),
      trainingFee: Number(updated.trainingFee),
      prizeCredit: Number(updated.prizeCredit),
      netAmount: Number(updated.netAmount),
    };
  }

  /**
   * Tổng hợp báo cáo tài chính của Chủ ngựa (SC-5.06)
   */
  async getOwnerSummary(ownerId: string) {
    const invoices = await this.prisma.financialInvoice.findMany({
      where: { ownerId },
      include: {
        horse: { select: { id: true, name: true, horseCode: true } },
      },
      orderBy: { billingPeriod: 'desc' },
    });

    let totalBoarding = 0;
    let totalMedical = 0;
    let totalTraining = 0;
    let totalPrizeCredit = 0;
    let totalNet = 0;

    for (const inv of invoices) {
      totalBoarding += Number(inv.boardingFee);
      totalMedical += Number(inv.medicalFee);
      totalTraining += Number(inv.trainingFee);
      totalPrizeCredit += Number(inv.prizeCredit);
      totalNet += Number(inv.netAmount);
    }

    return {
      totalBoarding,
      totalMedical,
      totalTraining,
      totalExpense: totalBoarding + totalMedical + totalTraining,
      totalPrizeCredit,
      totalNet,
      invoiceCount: invoices.length,
      invoices: invoices.map((inv) => ({
        ...inv,
        boardingFee: Number(inv.boardingFee),
        medicalFee: Number(inv.medicalFee),
        trainingFee: Number(inv.trainingFee),
        prizeCredit: Number(inv.prizeCredit),
        netAmount: Number(inv.netAmount),
      })),
    };
  }

  /**
   * Tạo tự động hóa đơn nháp đầu tháng cho tất cả ngựa có Chủ sở hữu
   */
  async generateMonthlyDrafts(billingPeriod: string, user: FinancialActor) {
    const horses = await this.prisma.horse.findMany({
      where: {
        deletedAt: null,
        ownerId: { not: null },
      },
    });

    const created: any[] = [];

    for (const h of horses) {
      if (!h.ownerId) continue;

      const existing = await this.prisma.financialInvoice.findFirst({
        where: {
          horseId: h.id,
          ownerId: h.ownerId,
          billingPeriod,
        },
      });

      if (!existing) {
        // Phí cơ sở định kỳ: Tiền chuồng 6,000,000; Huấn luyện 4,000,000
        const boardingFee = 6000000;
        const trainingFee = 4000000;
        const netAmount = boardingFee + trainingFee;

        const inv = await this.prisma.financialInvoice.create({
          data: {
            horseId: h.id,
            ownerId: h.ownerId,
            billingPeriod,
            boardingFee,
            medicalFee: 0,
            trainingFee,
            prizeCredit: 0,
            netAmount,
            status: InvoiceStatus.DRAFT,
          },
        });
        created.push(inv);
      }
    }

    await this.audit.record(
      { id: user.id, name: user.name },
      'MONTHLY_INVOICES_GENERATED',
      `Auto-generated ${created.length} draft invoices for billing period ${billingPeriod}`,
      billingPeriod,
      { entityName: 'FinancialInvoice', newValues: { count: created.length, billingPeriod } },
    );

    return {
      success: true,
      createdCount: created.length,
      billingPeriod,
    };
  }
}
