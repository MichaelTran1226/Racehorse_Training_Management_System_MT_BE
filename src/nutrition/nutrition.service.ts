import { HttpStatus, Injectable } from '@nestjs/common';
import { NotificationCategory, NutritionPlanStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/role.enum';
import {
  CreateNutritionPlanDto,
  MealDto,
  QueryNutritionPlanDto,
  ReviewNutritionPlanDto,
  UpdateNutritionPlanDto,
} from './dto/nutrition-plan.dto';

export interface FeedCalculationResult {
  dailyFeedWeightKg: number;
  horseWeightKg: number;
  targetWeightRatioPct: number;
  isWithinSafeRange: boolean;
  evaluation: 'OPTIMAL' | 'UNDER_MINIMUM' | 'EXCEEDS_MAXIMUM';
  warningMessage?: string;
}

@Injectable()
export class NutritionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Tính toán trọng lượng thức ăn và tỷ lệ % so với khối lượng cơ thể ngựa.
   * Ngưỡng khoa học khuyến cáo: 1.5% - 3.0% khối lượng ngựa.
   */
  async calculateMetrics(horseId: string, meals: MealDto[]): Promise<FeedCalculationResult> {
    const horse = await this.prisma.horse.findUnique({
      where: { id: horseId },
      include: {
        medicalRecords: {
          where: { weightKg: { not: null } },
          orderBy: { examinationDate: 'desc' },
          take: 1,
          select: { weightKg: true },
        },
      },
    });

    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Ngựa không tồn tại.');
    }

    const horseWeightKg = horse.medicalRecords[0]?.weightKg ?? 500;

    let totalKg = 0;
    for (const meal of meals || []) {
      for (const item of meal.items || []) {
        const u = (item.unit || '').toUpperCase();
        if (u === 'KG') {
          totalKg += Number(item.amount);
        } else if (u === 'G') {
          totalKg += Number(item.amount) / 1000;
        } else if (u === 'LITER') {
          totalKg += Number(item.amount);
        } else if (u === 'ML') {
          totalKg += Number(item.amount) / 1000;
        }
      }
    }

    const dailyFeedWeightKg = Math.round(totalKg * 100) / 100;
    const targetWeightRatioPct = Math.round((dailyFeedWeightKg / horseWeightKg) * 1000) / 10;

    let evaluation: 'OPTIMAL' | 'UNDER_MINIMUM' | 'EXCEEDS_MAXIMUM' = 'OPTIMAL';
    let warningMessage: string | undefined;

    if (targetWeightRatioPct < 1.5) {
      evaluation = 'UNDER_MINIMUM';
      warningMessage = `Khẩu phần ăn (${targetWeightRatioPct}%) dưới ngưỡng khuyến nghị 1.5% khối lượng cơ thể (nguy cơ thiếu hụt dinh dưỡng).`;
    } else if (targetWeightRatioPct > 3.0) {
      evaluation = 'EXCEEDS_MAXIMUM';
      warningMessage = `Khẩu phần ăn (${targetWeightRatioPct}%) vượt quá ngưỡng tối đa 3.0% khối lượng cơ thể (nguy cơ bội thực / đau bụng colic).`;
    }

    return {
      dailyFeedWeightKg,
      horseWeightKg,
      targetWeightRatioPct,
      isWithinSafeRange: evaluation === 'OPTIMAL',
      evaluation,
      warningMessage,
    };
  }

  /**
   * Sinh mã định danh kế hoạch khẩu phần: NP-YYMM-NNN
   */
  private async generatePlanCode(): Promise<string> {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const count = await this.prisma.nutritionPlan.count();
    const seq = String(count + 1).padStart(3, '0');
    return `NP-${yy}${mm}-${seq}`;
  }

  /**
   * Lấy danh sách kế hoạch khẩu phần có phân quyền RBAC:
   * - Groom: chỉ xem bản APPROVED đang có hiệu lực.
   * - Horse Owner: chỉ xem bản APPROVED của ngựa mình sở hữu.
   * - Head Trainer, Vet, Club Manager: xem toàn bộ trạng thái.
   */
  async findAll(query: QueryNutritionPlanDto, currentUser: CurrentUserPayload) {
    const where: Prisma.NutritionPlanWhereInput = {};

    // Phân quyền theo vai trò
    if (currentUser.role === UserRole.GROOM) {
      where.status = NutritionPlanStatus.APPROVED;
    } else if (currentUser.role === UserRole.HORSE_OWNER) {
      where.status = NutritionPlanStatus.APPROVED;
      where.horse = { ownerId: currentUser.userId };
    } else if (query.status && query.status !== 'ALL') {
      where.status = query.status as NutritionPlanStatus;
    }

    if (query.horseId) {
      where.horseId = query.horseId;
    }

    if (query.zoneId && query.zoneId !== 'ALL') {
      where.horse = {
        ...(where.horse as Prisma.HorseWhereInput),
        stallAllocations: {
          some: {
            isActive: true,
            stall: { zoneId: query.zoneId },
          },
        },
      };
    }

    const term = query.search?.trim();
    if (term) {
      where.OR = [
        { planCode: { contains: term, mode: 'insensitive' } },
        { horse: { name: { contains: term, mode: 'insensitive' } } },
        { horse: { horseCode: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.nutritionPlan.count({ where }),
      this.prisma.nutritionPlan.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }],
        include: {
          horse: {
            select: {
              id: true,
              name: true,
              horseCode: true,
              microchipRfid: true,
              avatarUrl: true,
              status: true,
              isMedicalLocked: true,
              stallAllocations: {
                where: { isActive: true },
                take: 1,
                include: {
                  stall: {
                    select: {
                      id: true,
                      code: true,
                      zone: true,
                      zoneId: true,
                      zoneRef: { select: { id: true, name: true, code: true } },
                    },
                  },
                },
              },
              medicalRecords: {
                where: { weightKg: { not: null } },
                orderBy: { examinationDate: 'desc' },
                take: 1,
                select: { weightKg: true },
              },
            },
          },
          createdBy: { select: { id: true, fullName: true, role: true } },
          approvedBy: { select: { id: true, fullName: true, role: true } },
        },
      }),
    ]);

    return {
      items: items.map((item) => {
        const horseWeight =
          item.horseWeightSnapshot ?? item.horse?.medicalRecords[0]?.weightKg ?? 500;
        const currentZone = item.horse?.stallAllocations[0]?.stall?.zoneRef ?? null;
        const currentStallCode = item.horse?.stallAllocations[0]?.stall?.code ?? null;
        return {
          ...item,
          horseWeight,
          currentZone,
          currentStallCode,
          isWithinSafeRange: item.targetWeightRatioPct >= 1.5 && item.targetWeightRatioPct <= 3.0,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Lấy chi tiết 1 kế hoạch khẩu phần
   */
  async findOne(id: string, currentUser: CurrentUserPayload) {
    const item = await this.prisma.nutritionPlan.findUnique({
      where: { id },
      include: {
        horse: {
          include: {
            stallAllocations: {
              where: { isActive: true },
              include: { stall: { include: { zoneRef: true } } },
            },
            medicalRecords: {
              where: { weightKg: { not: null } },
              orderBy: { examinationDate: 'desc' },
              take: 1,
            },
          },
        },
        createdBy: { select: { id: true, fullName: true, role: true } },
        approvedBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    if (!item) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'NUTRITION_PLAN_NOT_FOUND',
        'Khẩu phần ăn không tồn tại.',
      );
    }

    if (currentUser.role === UserRole.GROOM && item.status !== NutritionPlanStatus.APPROVED) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN_GROOM',
        'Groom chỉ được xem khẩu phần đã duyệt.',
      );
    }

    if (currentUser.role === UserRole.HORSE_OWNER) {
      if (
        item.horse.ownerId !== currentUser.userId ||
        item.status !== NutritionPlanStatus.APPROVED
      ) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN_OWNER',
          'Chủ ngựa chỉ được xem khẩu phần đã duyệt của ngựa mình sở hữu.',
        );
      }
    }

    const horseWeight = item.horseWeightSnapshot ?? item.horse?.medicalRecords[0]?.weightKg ?? 500;

    return {
      ...item,
      horseWeight,
      isWithinSafeRange: item.targetWeightRatioPct >= 1.5 && item.targetWeightRatioPct <= 3.0,
    };
  }

  /**
   * Lấy khẩu phần ăn đang có hiệu lực (APPROVED) của một con ngựa cụ thể
   */
  async getActivePlanForHorse(horseId: string, _currentUser?: CurrentUserPayload) {
    const active = await this.prisma.nutritionPlan.findFirst({
      where: {
        horseId,
        status: NutritionPlanStatus.APPROVED,
      },
      orderBy: { approvedAt: 'desc' },
      include: {
        horse: true,
        createdBy: { select: { id: true, fullName: true, role: true } },
        approvedBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    if (!active) {
      return null;
    }

    return active;
  }

  /**
   * Tạo bản thảo (Draft) hoặc gửi duyệt ngay (Submit immediately).
   * Phân quyền: Head Trainer hoặc Club Manager.
   */
  async create(dto: CreateNutritionPlanDto, currentUser: CurrentUserPayload) {
    if (currentUser.role !== UserRole.HEAD_TRAINER && currentUser.role !== UserRole.CLUB_MANAGER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN_CREATE',
        'Chỉ Huấn luyện viên trưởng (Head Trainer) hoặc Quản lý mới được tạo khẩu phần ăn.',
      );
    }

    const horse = await this.prisma.horse.findUnique({
      where: { id: dto.horseId },
    });
    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Ngựa không tồn tại.');
    }

    const metrics = await this.calculateMetrics(dto.horseId, dto.meals);
    const planCode = await this.generatePlanCode();
    const initialStatus = dto.submitImmediately
      ? NutritionPlanStatus.PENDING_APPROVAL
      : NutritionPlanStatus.DRAFT;

    const created = await this.prisma.nutritionPlan.create({
      data: {
        planCode,
        horseId: dto.horseId,
        status: initialStatus,
        dailyFeedWeightKg: metrics.dailyFeedWeightKg,
        targetWeightRatioPct: metrics.targetWeightRatioPct,
        horseWeightSnapshot: metrics.horseWeightKg,
        mealsJson: dto.meals as unknown as Prisma.InputJsonValue,
        specialInstructions: dto.specialInstructions,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        createdById: currentUser.userId,
      },
      include: {
        horse: { select: { id: true, name: true, horseCode: true } },
        createdBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      dto.submitImmediately ? 'SUBMIT_NUTRITION_PLAN' : 'CREATE_NUTRITION_PLAN_DRAFT',
      `${dto.submitImmediately ? 'Gửi duyệt' : 'Tạo bản thảo'} khẩu phần #${planCode} cho ngựa ${horse.name}`,
      created.id,
      {
        entityName: 'NutritionPlan',
        newValues: {
          planCode,
          horseId: dto.horseId,
          horseName: horse.name,
          dailyFeedWeightKg: metrics.dailyFeedWeightKg,
          targetWeightRatioPct: metrics.targetWeightRatioPct,
          status: initialStatus,
        },
      },
    );

    if (dto.submitImmediately) {
      await this.notifications.notifyRoles(
        [Role.VETERINARIAN, Role.CLUB_MANAGER],
        {
          type: 'NUTRITION_PLAN_SUBMITTED',
          category: NotificationCategory.NUTRITION,
          title: `Khẩu phần ăn mới cho ngựa ${horse.name} đang chờ duyệt`,
          message: `Huấn luyện viên ${currentUser.fullName} đã gửi duyệt khẩu phần ăn #${planCode} cho ngựa ${horse.name} (${metrics.dailyFeedWeightKg}kg/ngày - ${metrics.targetWeightRatioPct}% trọng lượng).`,
          link: '/rations',
          senderName: currentUser.fullName,
          params: { horseName: horse.name, planCode },
        },
        currentUser.userId,
      );
    }

    return {
      ...created,
      metrics,
    };
  }

  /**
   * Cập nhật khẩu phần ăn. Chỉ cho phép khi trạng thái là DRAFT hoặc REJECTED.
   */
  async update(id: string, dto: UpdateNutritionPlanDto, currentUser: CurrentUserPayload) {
    const existing = await this.prisma.nutritionPlan.findUnique({
      where: { id },
      include: { horse: true },
    });

    if (!existing) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'NUTRITION_PLAN_NOT_FOUND',
        'Khẩu phần ăn không tồn tại.',
      );
    }

    if (currentUser.role !== UserRole.HEAD_TRAINER && currentUser.role !== UserRole.CLUB_MANAGER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN_UPDATE',
        'Chỉ Huấn luyện viên hoặc Quản lý được sửa khẩu phần.',
      );
    }

    if (
      existing.status !== NutritionPlanStatus.DRAFT &&
      existing.status !== NutritionPlanStatus.REJECTED
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'CANNOT_EDIT_LOCKED_PLAN',
        'Chỉ có thể chỉnh sửa khẩu phần ở trạng thái Bản nháp (DRAFT) hoặc Đã bị từ chối (REJECTED).',
      );
    }

    const meals = (dto.meals ?? existing.mealsJson) as MealDto[];
    const metrics = await this.calculateMetrics(existing.horseId, meals);

    const updated = await this.prisma.nutritionPlan.update({
      where: { id },
      data: {
        ...(dto.meals ? { mealsJson: dto.meals as unknown as Prisma.InputJsonValue } : {}),
        specialInstructions: dto.specialInstructions ?? existing.specialInstructions,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : existing.validFrom,
        validTo: dto.validTo ? new Date(dto.validTo) : existing.validTo,
        dailyFeedWeightKg: metrics.dailyFeedWeightKg,
        targetWeightRatioPct: metrics.targetWeightRatioPct,
        horseWeightSnapshot: metrics.horseWeightKg,
      },
      include: {
        horse: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      'UPDATE_NUTRITION_PLAN',
      `Cập nhật khẩu phần #${existing.planCode || id.slice(0, 8)} cho ngựa ${existing.horse.name}`,
      id,
      {
        entityName: 'NutritionPlan',
        newValues: {
          dailyFeedWeightKg: metrics.dailyFeedWeightKg,
          targetWeightRatioPct: metrics.targetWeightRatioPct,
        },
      },
    );

    return {
      ...updated,
      metrics,
    };
  }

  /**
   * Gửi duyệt khẩu phần ăn (Chuyển trạng thái từ DRAFT hoặc REJECTED sang PENDING_APPROVAL).
   */
  async submitForApproval(id: string, currentUser: CurrentUserPayload) {
    const plan = await this.prisma.nutritionPlan.findUnique({
      where: { id },
      include: { horse: true },
    });

    if (!plan) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'NUTRITION_PLAN_NOT_FOUND',
        'Khẩu phần ăn không tồn tại.',
      );
    }

    if (currentUser.role !== UserRole.HEAD_TRAINER && currentUser.role !== UserRole.CLUB_MANAGER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN_SUBMIT',
        'Chỉ Huấn luyện viên hoặc Quản lý được gửi duyệt.',
      );
    }

    if (plan.status !== NutritionPlanStatus.DRAFT && plan.status !== NutritionPlanStatus.REJECTED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_STATUS_FOR_SUBMIT',
        'Chỉ có thể gửi duyệt khẩu phần ở trạng thái Bản nháp (DRAFT) hoặc Đã bị từ chối (REJECTED).',
      );
    }

    const updated = await this.prisma.nutritionPlan.update({
      where: { id },
      data: {
        status: NutritionPlanStatus.PENDING_APPROVAL,
        rejectionReason: null, // Xóa lý do từ chối cũ nếu có
      },
      include: {
        horse: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      'SUBMIT_NUTRITION_PLAN',
      `Gửi duyệt khẩu phần #${plan.planCode || id.slice(0, 8)} cho ngựa ${plan.horse.name}`,
      id,
      {
        entityName: 'NutritionPlan',
        newValues: { status: NutritionPlanStatus.PENDING_APPROVAL },
      },
    );

    await this.notifications.notifyRoles(
      [Role.VETERINARIAN, Role.CLUB_MANAGER],
      {
        type: 'NUTRITION_PLAN_SUBMITTED',
        category: NotificationCategory.NUTRITION,
        title: `Khẩu phần ăn mới cho ngựa ${plan.horse.name} đang chờ duyệt`,
        message: `Khẩu phần #${plan.planCode || id.slice(0, 8)} cho ngựa ${plan.horse.name} đã được gửi duyệt.`,
        link: '/rations',
        senderName: currentUser.fullName,
        params: { horseName: plan.horse.name, planCode: plan.planCode || '' },
      },
      currentUser.userId,
    );

    return updated;
  }

  /**
   * Bác sĩ thú y hoặc Quản lý thẩm định & phê duyệt/từ chối khẩu phần ăn.
   */
  async review(id: string, dto: ReviewNutritionPlanDto, currentUser: CurrentUserPayload) {
    if (currentUser.role !== UserRole.VETERINARIAN && currentUser.role !== UserRole.CLUB_MANAGER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN_REVIEW',
        'Chỉ Bác sĩ thú y (Veterinarian) hoặc Quản lý mới có quyền phê duyệt hoặc từ chối khẩu phần.',
      );
    }

    const plan = await this.prisma.nutritionPlan.findUnique({
      where: { id },
      include: { horse: true, createdBy: true },
    });

    if (!plan) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'NUTRITION_PLAN_NOT_FOUND',
        'Khẩu phần ăn không tồn tại.',
      );
    }

    if (plan.status !== NutritionPlanStatus.PENDING_APPROVAL) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'PLAN_NOT_PENDING',
        'Khẩu phần ăn hiện không ở trạng thái Chờ phê duyệt (PENDING_APPROVAL).',
      );
    }

    if (dto.action === 'APPROVE') {
      // Khi duyệt: Lưu trữ (ARCHIVE) kế hoạch APPROVED cũ của ngựa này nếu có
      await this.prisma.nutritionPlan.updateMany({
        where: {
          horseId: plan.horseId,
          status: NutritionPlanStatus.APPROVED,
          id: { not: id },
        },
        data: {
          status: NutritionPlanStatus.ARCHIVED,
          validTo: new Date(),
        },
      });

      const updated = await this.prisma.nutritionPlan.update({
        where: { id },
        data: {
          status: NutritionPlanStatus.APPROVED,
          approvedById: currentUser.userId,
          approvedAt: new Date(),
          vetNotes: dto.vetNotes ?? plan.vetNotes,
          rejectionReason: null,
        },
        include: {
          horse: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, fullName: true, role: true } },
        },
      });

      await this.auditService.record(
        { id: currentUser.userId, name: currentUser.fullName },
        'APPROVE_NUTRITION_PLAN',
        `Phê duyệt khẩu phần #${plan.planCode || id.slice(0, 8)} cho ngựa ${plan.horse.name}`,
        id,
        {
          entityName: 'NutritionPlan',
          newValues: {
            status: NutritionPlanStatus.APPROVED,
            approvedBy: currentUser.fullName,
            vetNotes: dto.vetNotes,
          },
        },
      );

      // Bắn thông báo cho người lập (Head Trainer) và toàn bộ Groom chăm sóc ô chuồng
      const recipients = [plan.createdById].filter(Boolean);
      await this.notifications.notifyUsers(
        recipients,
        {
          type: 'NUTRITION_PLAN_APPROVED',
          category: NotificationCategory.NUTRITION,
          title: `Khẩu phần ăn của ngựa ${plan.horse.name} đã được phê duyệt`,
          message: `Bác sĩ thú y ${currentUser.fullName} đã phê duyệt khẩu phần ăn #${plan.planCode || ''} cho ngựa ${plan.horse.name}. Thực đơn mới đã có hiệu lực.`,
          link: '/rations',
          senderName: currentUser.fullName,
          params: { horseName: plan.horse.name, planCode: plan.planCode || '' },
        },
        currentUser.userId,
      );

      return updated;
    } else {
      // Từ chối (REJECT)
      if (!dto.rejectionReason?.trim()) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'REJECTION_REASON_REQUIRED',
          'Vui lòng nhập lý do từ chối để Huấn luyện viên chỉnh sửa lại khẩu phần.',
        );
      }

      const updated = await this.prisma.nutritionPlan.update({
        where: { id },
        data: {
          status: NutritionPlanStatus.REJECTED,
          approvedById: currentUser.userId,
          approvedAt: new Date(),
          rejectionReason: dto.rejectionReason.trim(),
          vetNotes: dto.vetNotes ?? plan.vetNotes,
        },
        include: {
          horse: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, fullName: true, role: true } },
        },
      });

      await this.auditService.record(
        { id: currentUser.userId, name: currentUser.fullName },
        'REJECT_NUTRITION_PLAN',
        `Từ chối khẩu phần #${plan.planCode || id.slice(0, 8)} cho ngựa ${plan.horse.name}. Lý do: ${dto.rejectionReason.trim()}`,
        id,
        {
          entityName: 'NutritionPlan',
          newValues: {
            status: NutritionPlanStatus.REJECTED,
            rejectionReason: dto.rejectionReason.trim(),
            vetNotes: dto.vetNotes,
          },
        },
      );

      // Bắn thông báo cho người lập (Head Trainer)
      if (plan.createdById) {
        await this.notifications.notifyUsers(
          [plan.createdById],
          {
            type: 'NUTRITION_PLAN_REJECTED',
            category: NotificationCategory.NUTRITION,
            title: `Khẩu phần ăn của ngựa ${plan.horse.name} đã bị từ chối`,
            message: `Bác sĩ thú y ${currentUser.fullName} đã từ chối khẩu phần #${plan.planCode || ''} với lý do: "${dto.rejectionReason.trim()}". Vui lòng xem và cập nhật lại.`,
            link: '/rations',
            senderName: currentUser.fullName,
            params: { horseName: plan.horse.name, reason: dto.rejectionReason.trim() },
          },
          currentUser.userId,
        );
      }

      return updated;
    }
  }

  /**
   * Xóa kế hoạch khẩu phần (Chỉ được xóa khi ở DRAFT hoặc REJECTED).
   */
  async remove(id: string, currentUser: CurrentUserPayload) {
    const plan = await this.prisma.nutritionPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'NUTRITION_PLAN_NOT_FOUND',
        'Khẩu phần ăn không tồn tại.',
      );
    }

    if (currentUser.role !== UserRole.HEAD_TRAINER && currentUser.role !== UserRole.CLUB_MANAGER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN_DELETE',
        'Chỉ Huấn luyện viên hoặc Quản lý được xóa khẩu phần.',
      );
    }

    if (plan.status !== NutritionPlanStatus.DRAFT && plan.status !== NutritionPlanStatus.REJECTED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'CANNOT_DELETE_ACTIVE_PLAN',
        'Không thể xóa khẩu phần đang chờ duyệt hoặc đã được phê duyệt.',
      );
    }

    await this.prisma.nutritionPlan.delete({ where: { id } });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName },
      'DELETE_NUTRITION_PLAN',
      `Xóa khẩu phần #${plan.planCode || id.slice(0, 8)}`,
      id,
      {
        entityName: 'NutritionPlan',
        oldValues: { planCode: plan.planCode, horseId: plan.horseId },
      },
    );

    return { success: true, message: 'Đã xóa khẩu phần ăn.' };
  }
}
