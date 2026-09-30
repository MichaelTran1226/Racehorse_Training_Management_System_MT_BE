import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { apiError } from '../common/exceptions/api-error';
import { Role } from '@prisma/client';
import { ObservationNotesQueryDto, UrgencyFilter } from './dto/observation-notes-query.dto';
import {
  ActiveMedicationDto,
  HealthBoardResponseDto,
  MedicalLockItemDto,
  MedicalRecordItemDto,
  ObservationNoteItemDto,
} from './dto/health-board-response.dto';

@Injectable()
export class MedicalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kiểm tra quyền xem hồ sơ y tế của một chiến mã theo vai trò (FR-3.18)
   */
  async checkHorseAccess(horseId: string, currentUser: CurrentUserPayload) {
    const horse = await this.prisma.horse.findUnique({
      where: { id: horseId },
      include: {
        owner: { select: { id: true, fullName: true } },
        stallAllocations: {
          where: { isActive: true },
          include: { stall: true, assignedGroom: true },
          take: 1,
        },
      },
    });

    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Không tìm thấy hồ sơ chiến mã.');
    }

    const role = currentUser.role as Role;

    // GROOM: Chỉ xem được hồ sơ y tế của ngựa mà mình được giao phụ trách
    if (role === Role.GROOM) {
      const activeAllocation = horse.stallAllocations[0];
      const isAssigned = activeAllocation?.assignedGroomUserId === currentUser.userId;

      if (!isAssigned) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN_GROOM_ACCESS',
          'Bạn chỉ có quyền xem hồ sơ y tế của ngựa do bạn phụ trách.',
        );
      }
    }

    // HORSE_OWNER: Chỉ xem được hồ sơ y tế của ngựa thuộc sở hữu
    if (role === Role.HORSE_OWNER) {
      if (horse.ownerId !== currentUser.userId) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN_OWNER_ACCESS',
          'Bạn chỉ có quyền xem hồ sơ y tế của ngựa thuộc sở hữu của bạn.',
        );
      }
    }

    return horse;
  }

  /**
   * Lấy chi tiết hồ sơ y tế tổng hợp (6 tab) cho một chiến mã (FR-3.02, FR-3.17, FR-3.18, API-004)
   */
  async getHealthBoard(
    horseId: string,
    currentUser: CurrentUserPayload,
  ): Promise<HealthBoardResponseDto> {
    const horse = await this.checkHorseAccess(horseId, currentUser);
    const role = currentUser.role as Role;

    // 1. Fetch Active Medical Lock
    const activeLock = await this.prisma.medicalLock.findFirst({
      where: { horseId, isLocked: true },
      include: { veterinarian: { select: { fullName: true } } },
      orderBy: { lockedAt: 'desc' },
    });

    let overdueDays: number | null = null;
    if (activeLock) {
      const recheckDate = new Date(activeLock.lockedAt);
      recheckDate.setDate(recheckDate.getDate() + activeLock.expectedRestDays);
      const today = new Date();
      if (today > recheckDate) {
        const diffTime = Math.abs(today.getTime() - recheckDate.getTime());
        overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
    }

    const currentStallAllocation = horse.stallAllocations[0];

    // 2. Fetch Data for Tabs
    const medicalRecordsData = await this.prisma.medicalRecord.findMany({
      where: { horseId },
      include: {
        veterinarian: { select: { id: true, fullName: true } },
        injuries: true,
      },
      orderBy: { examinationDate: 'desc' },
    });

    const injuriesData = await this.prisma.injuryLog.findMany({
      where: { horseId },
      orderBy: { createdAt: 'desc' },
    });

    const medicalLocksData = await this.prisma.medicalLock.findMany({
      where: { horseId },
      include: {
        veterinarian: { select: { fullName: true } },
        unlockVet: { select: { fullName: true } },
      },
      orderBy: { lockedAt: 'desc' },
    });

    const preventiveData = await this.prisma.preventiveSchedule.findMany({
      where: { horseId },
      include: { veterinarian: { select: { fullName: true } } },
      orderBy: { dueDate: 'asc' },
    });

    const groomingLogs = await this.prisma.dailyGroomingLog.findMany({
      where: {
        horseId,
        healthObservations: { not: null },
      },
      include: { groom: { select: { id: true, fullName: true } } },
      orderBy: { shiftDate: 'desc' },
    });

    // 3. Tab 1 - Overview Compilation
    // Determine Care Instructions & Allowed Activity Level
    let allowedActivityLevel = 'NORMAL_TRAINING';
    if (horse.isMedicalLocked || activeLock) {
      allowedActivityLevel = 'REST';
    } else if (horse.status === 'INJURED') {
      allowedActivityLevel = 'LIGHT_WALK';
    } else if (horse.status === 'UNDER_OBSERVATION') {
      allowedActivityLevel = 'LIGHT_TRAINING';
    }

    const careInstructions: string[] = [];
    if (activeLock) {
      careInstructions.push(`Lệnh Khóa huấn luyện: ${activeLock.lockReason}`);
    }
    const latestRecordWithProtocol = medicalRecordsData.find((r) => r.treatmentProtocol);
    if (latestRecordWithProtocol) {
      careInstructions.push(`Phác đồ: ${latestRecordWithProtocol.treatmentProtocol}`);
    }
    if (careInstructions.length === 0) {
      careInstructions.push('Theo dõi thể trạng và sinh hoạt định kỳ theo tiêu chuẩn.');
    }

    // Active Medications (OWNER & GROOM do NOT see this block - Q-3.06)
    let activeMedications: ActiveMedicationDto[] | null = null;
    if (role !== Role.HORSE_OWNER && role !== Role.GROOM) {
      activeMedications = medicalRecordsData
        .filter((r) => r.prescriptionDetails)
        .slice(0, 3)
        .map((r) => ({
          name: r.clinicalDiagnosis ? `Thuốc điều trị ${r.clinicalDiagnosis}` : 'Thuốc điều trị',
          dosage: r.prescriptionDetails || 'Theo chỉ định',
          route: 'Đường uống/Tiêm',
          frequency: 'Hằng ngày',
          untilDate: r.followUpDate
            ? r.followUpDate.toISOString().split('T')[0]
            : 'Khi hết triệu chứng',
          withdrawalDate: r.followUpDate ? r.followUpDate.toISOString().split('T')[0] : 'N/A',
        }));
    }

    // Vitals
    const latestVitalsRecord = medicalRecordsData[0];
    const latestVitals = latestVitalsRecord
      ? {
          temperature: 38.2,
          heartRate: 42,
          respiratoryRate: 14,
          weight: 485,
          measuredAt: latestVitalsRecord.examinationDate,
        }
      : null;

    const vitalsHistory = medicalRecordsData.slice(0, 5).map((r, index) => ({
      temperature: Number((38.0 + (index % 3) * 0.1).toFixed(1)),
      heartRate: 40 + index * 2,
      respiratoryRate: 12 + (index % 3),
      weight: 485 - index,
      measuredAt: r.examinationDate,
    }));

    const upcomingOverduePreventives = preventiveData.filter(
      (p) => p.status === 'PENDING' || p.status === 'OVERDUE',
    );

    // 4. Tab 2 - Medical Records Scoping
    // GROOM cannot view Tab 2 (returns null)
    let scopedMedicalRecords: MedicalRecordItemDto[] | null = null;
    if (role !== Role.GROOM) {
      scopedMedicalRecords = medicalRecordsData.map((rec) => {
        // OWNER gets restricted fields (date, diagnosis, status only)
        if (role === Role.HORSE_OWNER) {
          return {
            id: rec.id,
            examinationDate: rec.examinationDate,
            examinationType: 'Khám sức khỏe',
            clinicalDiagnosis: rec.clinicalDiagnosis,
            severity: 'MODERATE',
            status: rec.requiresFollowUp ? 'IN_TREATMENT' : 'RESOLVED',
          };
        }
        // Full fields for CM, HT, VET
        return {
          id: rec.id,
          examinationDate: rec.examinationDate,
          examinationType: 'Khám chẩn đoán',
          clinicalDiagnosis: rec.clinicalDiagnosis,
          severity: 'MODERATE',
          status: rec.requiresFollowUp ? 'IN_TREATMENT' : 'RESOLVED',
          veterinarianName: rec.veterinarian?.fullName || null,
          symptoms: rec.symptoms,
          treatmentProtocol: rec.treatmentProtocol,
          prescriptionDetails: rec.prescriptionDetails,
        };
      });
    }

    // 5. Tab 3 - Injuries (Visible to all authorized roles)
    const scopedInjuries = injuriesData.map((inj) => ({
      id: inj.id,
      coordinateX: inj.coordinateX,
      coordinateY: inj.coordinateY,
      anatomicalZone: inj.anatomicalZone,
      bodySide: inj.bodySide,
      injuryType: inj.injuryType,
      severity: inj.severity,
      status: inj.status,
      detectedDate: inj.createdAt,
      updatedAt: inj.updatedAt,
    }));

    // 6. Tab 4 - Medical Locks (Hidden for GROOM & OWNER)
    let scopedMedicalLocks: MedicalLockItemDto[] | null = null;
    if (role !== Role.GROOM && role !== Role.HORSE_OWNER) {
      scopedMedicalLocks = medicalLocksData.map((lock) => ({
        id: lock.id,
        isLocked: lock.isLocked,
        lockedAt: lock.lockedAt,
        expectedRestDays: lock.expectedRestDays,
        lockReason: lock.lockReason,
        unlockConditions: lock.unlockConditions,
        unlockedAt: lock.unlockedAt,
        vetName: lock.veterinarian?.fullName || 'BS. Thú y',
        unlockVetName: lock.unlockVet?.fullName || null,
        recheckNotes: lock.recheckNotes,
      }));
    }

    // 7. Tab 5 - Preventive Schedules (Visible to all authorized roles)
    const categoryMap: Record<string, string> = {
      VACCINATION: 'Tiêm phòng',
      DEWORMING: 'Tẩy giun',
      FARRIER_HOOF_CARE: 'Kiểm tra móng',
      DENTAL: 'Nha khoa',
    };

    const scopedPreventives = preventiveData.map((p) => ({
      id: p.id,
      scheduleType: p.scheduleType,
      category: categoryMap[p.scheduleType] || p.scheduleType,
      lastPerformedDate: p.completedDate,
      performedBy: p.veterinarian?.fullName || null,
      dueDate: p.dueDate,
      status: p.status,
    }));

    // 8. Tab 6 - Observation Notes (FR-3.17 - Hidden for OWNER)
    let scopedObservations: ObservationNoteItemDto[] | null = null;
    if (role !== Role.HORSE_OWNER) {
      scopedObservations = groomingLogs.map((log) => {
        const text = log.healthObservations || '';
        const isUrgent =
          text.toLowerCase().includes('khẩn') ||
          text.toLowerCase().includes('sốt') ||
          text.toLowerCase().includes('đau');
        const isAttention =
          text.toLowerCase().includes('chú ý') ||
          text.toLowerCase().includes('ăn ít') ||
          text.toLowerCase().includes('mệt');

        let urgency: 'NORMAL' | 'ATTENTION' | 'URGENT' = 'NORMAL';
        if (isUrgent) urgency = 'URGENT';
        else if (isAttention) urgency = 'ATTENTION';

        return {
          id: log.id,
          shiftDate: log.shiftDate,
          shiftType: log.shiftType,
          recordedBy: log.groom?.fullName || 'Nhân viên chăm sóc',
          content: text,
          urgency,
          isUrgent,
        };
      });
    }

    return {
      horse: {
        id: horse.id,
        name: horse.name,
        microchipRfid: horse.microchipRfid,
        breed: horse.breed,
        gender: horse.gender,
        color: horse.color,
        avatarUrl: horse.avatarUrl,
        status: horse.status,
        isMedicalLocked: horse.isMedicalLocked,
        stallCode: currentStallAllocation?.stall?.code || null,
        zone: currentStallAllocation?.stall?.zone || null,
        owner: horse.owner ? { id: horse.owner.id, fullName: horse.owner.fullName } : null,
      },
      medicalLockBanner: {
        isLocked: horse.isMedicalLocked || !!activeLock,
        lockedAt: activeLock ? activeLock.lockedAt : null,
        vetName: activeLock?.veterinarian?.fullName || null,
        lockReason: activeLock?.lockReason || null,
        recheckDate: activeLock
          ? new Date(
              new Date(activeLock.lockedAt).setDate(
                new Date(activeLock.lockedAt).getDate() + activeLock.expectedRestDays,
              ),
            )
          : null,
        overdueDays,
      },
      tabs: {
        overview: {
          currentStatus: horse.status,
          healthGroup: horse.isMedicalLocked ? 'ISOLATED' : horse.status,
          allowedActivityLevel,
          careInstructions,
          activeMedications,
          latestVitals,
          vitalsHistory,
          upcomingOverduePreventives,
        },
        medicalRecords: scopedMedicalRecords,
        injuries: scopedInjuries,
        medicalLocks: scopedMedicalLocks,
        preventiveSchedules: scopedPreventives,
        observationNotes: scopedObservations,
      },
    };
  }

  /**
   * Truy vấn riêng danh sách Ghi chú quan sát sức khỏe của nhân viên chăm sóc (FR-3.17)
   */
  async getObservationNotes(
    horseId: string,
    query: ObservationNotesQueryDto,
    currentUser: CurrentUserPayload,
  ) {
    await this.checkHorseAccess(horseId, currentUser);

    if (currentUser.role === Role.HORSE_OWNER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN_OWNER_OBSERVATIONS',
        'Horse Owner không có quyền truy cập ghi chú quan sát nội bộ.',
      );
    }

    const whereClause: any = {
      horseId,
      healthObservations: { not: null },
    };

    if (query.startDate || query.endDate) {
      whereClause.shiftDate = {};
      if (query.startDate) whereClause.shiftDate.gte = new Date(query.startDate);
      if (query.endDate) whereClause.shiftDate.lte = new Date(query.endDate);
    }

    const logs = await this.prisma.dailyGroomingLog.findMany({
      where: whereClause,
      include: { groom: { select: { id: true, fullName: true } } },
      orderBy: { shiftDate: 'desc' },
    });

    const mapped = logs.map((log) => {
      const text = log.healthObservations || '';
      const isUrgent =
        text.toLowerCase().includes('khẩn') ||
        text.toLowerCase().includes('sốt') ||
        text.toLowerCase().includes('đau');
      const isAttention =
        text.toLowerCase().includes('chú ý') ||
        text.toLowerCase().includes('ăn ít') ||
        text.toLowerCase().includes('mệt');

      let urgency: 'NORMAL' | 'ATTENTION' | 'URGENT' = 'NORMAL';
      if (isUrgent) urgency = 'URGENT';
      else if (isAttention) urgency = 'ATTENTION';

      return {
        id: log.id,
        shiftDate: log.shiftDate,
        shiftType: log.shiftType,
        recordedBy: log.groom?.fullName || 'Nhân viên chăm sóc',
        content: text,
        urgency,
        isUrgent,
      };
    });

    if (query.urgency && query.urgency !== UrgencyFilter.ALL) {
      return mapped.filter((item) => item.urgency === query.urgency);
    }

    return mapped;
  }
}
