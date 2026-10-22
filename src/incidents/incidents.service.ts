import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IncidentStatus, Role, SeverityLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateIncidentDto, QueryIncidentsDto, ReviewIncidentDto } from './dto/incident.dto';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * TASK F4-05-BE: Báo cáo sự cố đột xuất hoặc quan sát sức khỏe tại chuồng
   */
  async create(dto: CreateIncidentDto, reporter: CurrentUserPayload) {
    const horse = await this.prisma.horse.findUnique({
      where: { id: dto.horseId },
      include: {
        stallAllocations: {
          where: { isActive: true },
          include: { stall: true },
          take: 1,
        },
      },
    });

    if (!horse || horse.deletedAt) {
      throw new NotFoundException('Không tìm thấy thông tin con ngựa.');
    }

    const allocation = horse.stallAllocations[0];
    const stallZoneId = dto.stallZoneId || allocation?.stall?.zoneId || undefined;

    const symptomsList =
      dto.symptoms && dto.symptoms.length > 0
        ? dto.symptoms
        : dto.symptomsJson && dto.symptomsJson.length > 0
          ? dto.symptomsJson
          : ['OTHER'];

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countToday = await this.prisma.incidentReport.count();
    const incidentNumber = `INC-${dateStr}-${String(countToday + 1).padStart(4, '0')}`;

    const incident = await this.prisma.incidentReport.create({
      data: {
        incidentNumber,
        horseId: horse.id,
        stallZoneId,
        reportedById: reporter.userId,
        severity: dto.severity,
        symptomsJson: symptomsList,
        description: dto.description.trim(),
        status: IncidentStatus.REPORTED,
      },
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
        stallZone: { select: { id: true, code: true, name: true } },
        reportedBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    // Bắn thông báo khẩn cấp tới Bác sĩ thú y và Huấn luyện viên
    const isCritical = dto.severity === SeverityLevel.CRITICAL;
    const isModerate = dto.severity === SeverityLevel.MODERATE;

    const titlePrefix = isCritical
      ? '🚨 [KHẨN CẤP] Sự cố nghiêm trọng:'
      : isModerate
        ? '⚠️ [Cảnh báo] Bất thường sức khỏe:'
        : '📝 Ghi nhận quan sát sức khỏe:';

    const symptomsText = symptomsList.join(', ');

    await this.notifications.notifyRoles(
      [Role.VETERINARIAN, Role.HEAD_TRAINER, Role.CLUB_MANAGER],
      {
        type: isCritical ? 'CRITICAL_INCIDENT_REPORTED' : 'HEALTH_ANOMALY_LOGGED',
        category: 'MEDICAL',
        title: `${titlePrefix} ${horse.name} (${horse.horseCode || ''})`,
        message: `Groom ${reporter.fullName} báo cáo: ${symptomsText}. Nội dung: "${dto.description}"`,
        params: {
          incidentNumber,
          horseId: horse.id,
          horseName: horse.name,
          severity: dto.severity,
        },
        link: '/incidents',
        senderName: reporter.fullName,
      },
    );

    await this.auditService.record(
      { id: reporter.userId, name: reporter.fullName } as any,
      'REPORT_INCIDENT',
      `Báo cáo sự cố ${incidentNumber} (${dto.severity}) cho ngựa ${horse.name}`,
      incident.id,
      {
        entityName: 'IncidentReport',
        newValues: {
          incidentNumber,
          horseId: horse.id,
          horseName: horse.name,
          severity: dto.severity,
          symptoms: dto.symptoms,
        },
      },
    );

    return incident;
  }

  /**
   * Tạo báo cáo sự cố từ gói tin mô phỏng (Simulator).
   * Idempotent dựa trên sourceEventId để tránh trùng lặp bản ghi và thông báo khi retry.
   */
  async createFromSimulator(
    sourceEventId: string | undefined,
    packet: any,
    reporter: CurrentUserPayload,
  ) {
    if (sourceEventId) {
      const existing = await this.prisma.incidentReport.findUnique({
        where: { sourceEventId },
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
          stallZone: { select: { id: true, code: true, name: true } },
          reportedBy: { select: { id: true, fullName: true, role: true } },
        },
      });

      if (existing) {
        return existing;
      }
    }

    const horseId = packet.horse?.horse_id;
    const horse = await this.prisma.horse.findUnique({
      where: { id: horseId },
      include: {
        stallAllocations: {
          where: { isActive: true },
          include: { stall: true },
          take: 1,
        },
      },
    });

    if (!horse || horse.deletedAt) {
      throw new NotFoundException('Không tìm thấy thông tin con ngựa từ gói tin mô phỏng.');
    }

    const allocation = horse.stallAllocations[0];
    const stallZoneId = allocation?.stall?.zoneId || undefined;

    const kind = packet.incident?.kind;
    const severity = kind === 'FRACTURE' ? SeverityLevel.CRITICAL : SeverityLevel.MODERATE;

    const symptomsList =
      kind === 'FRACTURE'
        ? ['FRACTURE', 'HOOF_INJURY']
        : kind === 'LAMENESS'
          ? ['LAMENESS']
          : kind === 'COLIC'
            ? ['COLIC']
            : kind === 'FEVER'
              ? ['FEVER']
              : ['OTHER'];

    const snapshot = packet.snapshot;
    const snapshotText = snapshot
      ? ` [Chỉ số: v=${snapshot.velocity_mps ?? 0}m/s, hr=${snapshot.heart_rate_bpm ?? 0}bpm, temp=${snapshot.body_temp_c ?? 0}°C]`
      : '';
    const description = `[Mô phỏng - ${packet.incident?.location || 'TRACK'}] ${packet.incident?.label || 'Sự cố sân chạy'}.${snapshotText}`;

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countToday = await this.prisma.incidentReport.count();
    const incidentNumber = `INC-${dateStr}-${String(countToday + 1).padStart(4, '0')}`;

    const incident = await this.prisma.incidentReport.create({
      data: {
        sourceEventId: sourceEventId || undefined,
        incidentNumber,
        horseId: horse.id,
        stallZoneId,
        reportedById: reporter.userId,
        severity,
        symptomsJson: symptomsList,
        description,
        status: IncidentStatus.REPORTED,
      },
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
        stallZone: { select: { id: true, code: true, name: true } },
        reportedBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    const isCritical = severity === SeverityLevel.CRITICAL;
    const titlePrefix = isCritical
      ? '🚨 [KHẨN CẤP - SIMULATOR] Sự cố nghiêm trọng:'
      : '⚠️ [Cảnh báo - SIMULATOR] Bất thường sức khỏe:';

    await this.notifications.notifyRoles(
      [Role.VETERINARIAN, Role.HEAD_TRAINER, Role.CLUB_MANAGER],
      {
        type: isCritical ? 'CRITICAL_INCIDENT_REPORTED' : 'HEALTH_ANOMALY_LOGGED',
        category: 'MEDICAL',
        title: `${titlePrefix} ${horse.name} (${horse.horseCode || ''})`,
        message: `${reporter.fullName} ghi nhận từ Simulator: ${symptomsList.join(', ')}. Mô tả: ${description}`,
        params: {
          incidentNumber,
          horseId: horse.id,
          horseName: horse.name,
          severity,
        },
        link: '/incidents',
        senderName: reporter.fullName,
      },
    );

    if (horse.ownerId) {
      await this.notifications.notifyUsers([horse.ownerId], {
        type: isCritical ? 'CRITICAL_INCIDENT_REPORTED' : 'HEALTH_ANOMALY_LOGGED',
        category: 'MEDICAL',
        title: `${titlePrefix} ${horse.name}`,
        message: `Ngựa của bạn ghi nhận sự cố trên sân mô phỏng: ${symptomsList.join(', ')}. Đang chờ bác sĩ thú y kiểm tra.`,
        params: {
          incidentNumber,
          horseId: horse.id,
          horseName: horse.name,
          severity,
        },
        link: '/incidents',
        senderName: reporter.fullName,
      });
    }

    await this.auditService.record(
      { id: reporter.userId, name: reporter.fullName } as any,
      'REPORT_INCIDENT',
      'IncidentReport',
      incident.id,
      {
        newValues: {
          action: 'CREATE_FROM_SIMULATOR',
          sourceEventId,
          incidentNumber,
          horseId: horse.id,
          severity,
        },
      },
    );

    return incident;
  }

  /**
   * Lấy danh sách sự cố theo bộ lọc
   */
  async findAll(query: QueryIncidentsDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.horseId) {
      where.horseId = query.horseId;
    }

    if (query.zoneId) {
      where.stallZoneId = query.zoneId;
    }

    if (query.severity) {
      where.severity = query.severity;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(`${query.startDate}T00:00:00.000Z`);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(`${query.endDate}T23:59:59.999Z`);
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.incidentReport.findMany({
        where,
        include: {
          horse: {
            select: {
              id: true,
              name: true,
              horseCode: true,
              avatarUrl: true,
              status: true,
              isMedicalLocked: true,
            },
          },
          stallZone: { select: { id: true, code: true, name: true } },
          reportedBy: { select: { id: true, fullName: true, role: true } },
          reviewedBy: { select: { id: true, fullName: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.incidentReport.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Lấy chi tiết một sự cố
   */
  async findOne(id: string) {
    const incident = await this.prisma.incidentReport.findUnique({
      where: { id },
      include: {
        horse: {
          select: {
            id: true,
            name: true,
            horseCode: true,
            avatarUrl: true,
            status: true,
            isMedicalLocked: true,
            stallAllocations: {
              where: { isActive: true },
              include: { stall: true },
            },
          },
        },
        stallZone: { select: { id: true, code: true, name: true } },
        reportedBy: { select: { id: true, fullName: true, role: true } },
        reviewedBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    if (!incident) {
      throw new NotFoundException('Không tìm thấy sự cố báo cáo.');
    }

    return incident;
  }

  /**
   * Bác sĩ thú y hoặc Club Manager đánh giá và cập nhật trạng thái sự cố
   */
  async review(id: string, dto: ReviewIncidentDto, reviewer: CurrentUserPayload) {
    if (reviewer.role !== Role.VETERINARIAN && reviewer.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException(
        'Chỉ Bác sĩ thú y hoặc Quản lý CLB mới có quyền đánh giá và xử lý báo cáo sự cố.',
      );
    }

    const incident = await this.prisma.incidentReport.findUnique({
      where: { id },
      include: { horse: true, reportedBy: true },
    });

    if (!incident) {
      throw new NotFoundException('Không tìm thấy sự cố.');
    }

    const updated = await this.prisma.incidentReport.update({
      where: { id },
      data: {
        status: dto.status,
        vetNotes: dto.vetNotes ? dto.vetNotes.trim() : incident.vetNotes,
        reviewedById: reviewer.userId,
        reviewedAt: new Date(),
      },
      include: {
        horse: true,
        reportedBy: { select: { id: true, fullName: true } },
        reviewedBy: { select: { id: true, fullName: true } },
      },
    });

    // Thông báo phản hồi lại cho Groom đã báo cáo
    if (incident.reportedById) {
      await this.notifications.notifyUsers([incident.reportedById], {
        type: 'INCIDENT_REVIEWED',
        category: 'MEDICAL',
        title: `Báo cáo sự cố ${incident.incidentNumber} đã được cập nhật`,
        message: `Bác sĩ ${reviewer.fullName} đã chuyển trạng thái thành "${dto.status}". Ghi chú: ${dto.vetNotes || 'Không có ghi chú thêm.'}`,
        link: '/incidents',
        senderName: reviewer.fullName,
      });
    }

    await this.auditService.record(
      { id: reviewer.userId, name: reviewer.fullName } as any,
      'REVIEW_INCIDENT',
      `Đánh giá sự cố ${incident.incidentNumber} -> ${dto.status}`,
      incident.id,
      {
        entityName: 'IncidentReport',
        newValues: {
          incidentNumber: incident.incidentNumber,
          newStatus: dto.status,
          vetNotes: dto.vetNotes,
        },
      },
    );

    return updated;
  }
}
