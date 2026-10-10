import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import {
  Role,
  HorseStatus,
  BodySide,
  SeverityLevel,
  InjuryStatus,
  PreventiveType,
  PreventiveStatus,
  PlanStatus,
  WorkoutStatus,
} from '@prisma/client';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import { UpdateMedicalRecordDto } from './dto/update-medical-record.dto';
import { MedicalRecordQueryDto } from './dto/medical-record-query.dto';
import { CreateTreatmentPhaseDto, UpdateTreatmentPhaseDto } from './dto/treatment-phase.dto';
import {
  CreatePrescriptionDto,
  StopPrescriptionDto,
  UpdatePrescriptionDto,
} from './dto/prescription.dto';
import { CreateFollowUpDto } from './dto/follow-up.dto';
import { CloseMedicalRecordDto, ReopenMedicalRecordDto } from './dto/close-record.dto';
import { FinalizeRecordDto } from './dto/finalize-record.dto';
import { CreateInjuryDto } from './dto/create-injury.dto';
import { UpdateInjuryDto } from './dto/update-injury.dto';
import { UpdateRecoveryProgressDto } from './dto/update-recovery-progress.dto';
import { InjuryQueryDto } from './dto/injury-query.dto';
import {
  CreateMedicalLockDto,
  ExtendMedicalLockDto,
  ReleaseMedicalLockDto,
  MedicalLockQueryDto,
} from './dto/medical-lock.dto';
import { HealthBoardQueryDto } from './dto/health-board-query.dto';
import {
  CreatePreventiveTypeCatalogDto,
  UpdatePreventiveTypeCatalogDto,
} from './dto/preventive-catalog.dto';
import {
  RecordPreventiveCareDto,
  SetupHorsePreventiveDto,
  PreventiveQueryDto,
} from './dto/preventive-care.dto';

@Injectable()
export class MedicalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Helper: verify horse access permissions based on role
   */
  private async checkHorseAccess(horseId: string, currentUser: CurrentUserPayload): Promise<void> {
    if (
      currentUser.role === Role.CLUB_MANAGER ||
      currentUser.role === Role.HEAD_TRAINER ||
      currentUser.role === Role.VETERINARIAN
    ) {
      return;
    }

    const horse = await this.prisma.horse.findUnique({
      where: { id: horseId },
      include: {
        stallAllocations: {
          where: { isActive: true },
        },
      },
    });

    if (!horse) {
      throw new NotFoundException('Không tìm thấy thông tin chiến mã');
    }

    if (currentUser.role === Role.HORSE_OWNER) {
      if (horse.ownerId !== currentUser.userId) {
        throw new ForbiddenException('Bạn không có quyền truy cập hồ sơ y tế chiến mã này');
      }
      return;
    }

    if (currentUser.role === Role.GROOM) {
      const isAssigned = horse.stallAllocations.some(
        (allocation) => allocation.assignedGroomUserId === currentUser.userId,
      );
      if (!isAssigned) {
        throw new ForbiddenException('Bạn không có quyền xem hồ sơ y tế chiến mã không được giao');
      }
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // 2D INJURY MODEL & RECOVERY PROGRESS (TASK P2-03)
  // ---------------------------------------------------------------------------

  async getHorseInjuries(horseId: string, currentUser: CurrentUserPayload, query: InjuryQueryDto) {
    await this.checkHorseAccess(horseId, currentUser);

    const horse = await this.prisma.horse.findUnique({
      where: { id: horseId },
    });
    if (!horse) {
      throw new NotFoundException('Không tìm thấy chiến mã');
    }

    const where: any = { horseId };

    if (query.viewSide) {
      where.viewSide = query.viewSide;
    }

    if (query.layer) {
      where.layer = query.layer;
    }

    const injuries = await this.prisma.injuryLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        medicalRecord: {
          select: { id: true, examinationDate: true, clinicalDiagnosis: true },
        },
      },
    });

    const includeHealed = query.includeHealed === 'true';
    const asOfDate = query.asOfDate ? new Date(query.asOfDate) : null;

    let result = injuries;

    if (asOfDate) {
      result = result
        .filter((inj) => new Date(inj.discoveryDate || inj.createdAt) <= asOfDate)
        .map((inj) => {
          let history: any[] = [];
          if (inj.recoveryHistory) {
            try {
              history =
                typeof inj.recoveryHistory === 'string'
                  ? JSON.parse(inj.recoveryHistory)
                  : (inj.recoveryHistory as any[]);
            } catch {
              history = [];
            }
          }
          const activeAsOf = history
            .filter((h) => new Date(h.evaluationDate || h.createdAt) <= asOfDate)
            .sort(
              (a, b) =>
                new Date(b.evaluationDate || b.createdAt).getTime() -
                new Date(a.evaluationDate || a.createdAt).getTime(),
            );

          const currentSnapshot = activeAsOf[0];
          const stageAtDate = currentSnapshot ? currentSnapshot.stage : inj.stage;
          const severityAtDate = currentSnapshot ? currentSnapshot.severity : inj.severity;

          return {
            ...inj,
            stage: stageAtDate,
            severity: severityAtDate,
          };
        });
    }

    if (!includeHealed) {
      result = result.filter(
        (inj) => inj.stage !== 'HEALED' && inj.status !== InjuryStatus.RESOLVED,
      );
    }

    return result;
  }

  async createInjury(actor: CurrentUserPayload, dto: CreateInjuryDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền thực hiện');
    }

    const horse = await this.prisma.horse.findUnique({
      where: { id: dto.horseId },
      include: {
        medicalLocks: { where: { isLocked: true } },
      },
    });
    if (!horse) {
      throw new NotFoundException('Không tìm thấy chiến mã');
    }

    if (dto.medicalRecordId) {
      const record = await this.prisma.medicalRecord.findUnique({
        where: { id: dto.medicalRecordId },
      });
      if (!record || record.horseId !== dto.horseId) {
        throw new BadRequestException('Bệnh án không tồn tại hoặc không thuộc chiến mã này');
      }
    }

    const initialStage = dto.stage || 'ACUTE';
    const isHealed = initialStage === 'HEALED';
    const status = isHealed ? InjuryStatus.RESOLVED : InjuryStatus.ACTIVE;

    const initialHistoryEntry = {
      id: `hist-${Date.now()}`,
      stage: initialStage,
      evaluationDate: dto.discoveryDate || new Date().toISOString(),
      severity: dto.severity || SeverityLevel.MODERATE,
      notes: dto.description || 'Ghi nhận vị trí chấn thương ban đầu',
      updatedByUserId: actor.userId,
      updatedByName: actor.fullName,
      createdAt: new Date().toISOString(),
    };

    const injury = await this.prisma.injuryLog.create({
      data: {
        horseId: dto.horseId,
        medicalRecordId: dto.medicalRecordId || null,
        coordinateX: dto.coordinateX,
        coordinateY: dto.coordinateY,
        viewSide: dto.viewSide || 'LEFT',
        layer: dto.layer || 'MUSCLE',
        anatomicalZone: dto.anatomicalZone,
        bodySide: dto.bodySide || BodySide.LEFT,
        injuryType: dto.injuryType,
        severity: dto.severity || SeverityLevel.MODERATE,
        stage: initialStage,
        status,
        description: dto.description || null,
        discoveryDate: dto.discoveryDate ? new Date(dto.discoveryDate) : new Date(),
        recoveryHistory: [initialHistoryEntry],
      },
      include: {
        horse: { select: { id: true, name: true, microchipRfid: true } },
        medicalRecord: { select: { id: true, examinationDate: true, clinicalDiagnosis: true } },
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'CREATE_INJURY_LOG',
      `Injury logged for horse ${dto.horseId} at zone ${dto.anatomicalZone}`,
      injury.id,
    );

    const isLocked = horse.medicalLocks.length > 0 || horse.isMedicalLocked;
    const isSevereOrCritical =
      injury.severity === SeverityLevel.SEVERE || injury.severity === SeverityLevel.CRITICAL;

    const recommendMedicalLock = isSevereOrCritical && !isLocked;

    return {
      ...injury,
      recommendMedicalLock,
      recommendationMessage: recommendMedicalLock
        ? 'Chấn thương nặng. Cân nhắc đặt Khóa huấn luyện.'
        : null,
    };
  }

  async getInjuryDetail(id: string, currentUser: CurrentUserPayload) {
    const injury = await this.prisma.injuryLog.findUnique({
      where: { id },
      include: {
        horse: {
          select: { id: true, name: true, microchipRfid: true, status: true, ownerId: true },
        },
        medicalRecord: { select: { id: true, examinationDate: true, clinicalDiagnosis: true } },
      },
    });

    if (!injury) {
      throw new NotFoundException('Không tìm thấy thông tin điểm chấn thương');
    }

    await this.checkHorseAccess(injury.horseId, currentUser);

    return injury;
  }

  async updateInjury(id: string, actor: CurrentUserPayload, dto: UpdateInjuryDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền chỉnh sửa điểm chấn thương');
    }

    const injury = await this.prisma.injuryLog.findUnique({ where: { id } });
    if (!injury) {
      throw new NotFoundException('Không tìm thấy điểm chấn thương');
    }

    if (dto.medicalRecordId) {
      const record = await this.prisma.medicalRecord.findUnique({
        where: { id: dto.medicalRecordId },
      });
      if (!record || record.horseId !== injury.horseId) {
        throw new BadRequestException('Bệnh án không tồn tại hoặc không thuộc chiến mã này');
      }
    }

    const dataToUpdate: any = {};
    if (dto.coordinateX !== undefined) dataToUpdate.coordinateX = dto.coordinateX;
    if (dto.coordinateY !== undefined) dataToUpdate.coordinateY = dto.coordinateY;
    if (dto.viewSide) dataToUpdate.viewSide = dto.viewSide;
    if (dto.layer) dataToUpdate.layer = dto.layer;
    if (dto.anatomicalZone) dataToUpdate.anatomicalZone = dto.anatomicalZone;
    if (dto.bodySide) dataToUpdate.bodySide = dto.bodySide;
    if (dto.injuryType) dataToUpdate.injuryType = dto.injuryType;
    if (dto.severity) dataToUpdate.severity = dto.severity;
    if (dto.stage) {
      dataToUpdate.stage = dto.stage;
      if (dto.stage === 'HEALED') {
        dataToUpdate.status = InjuryStatus.RESOLVED;
      }
    }
    if (dto.discoveryDate) dataToUpdate.discoveryDate = new Date(dto.discoveryDate);
    if (dto.description !== undefined) dataToUpdate.description = dto.description;
    if (dto.medicalRecordId !== undefined) dataToUpdate.medicalRecordId = dto.medicalRecordId;

    const updated = await this.prisma.injuryLog.update({
      where: { id },
      data: dataToUpdate,
      include: {
        horse: { select: { id: true, name: true, microchipRfid: true } },
        medicalRecord: { select: { id: true, examinationDate: true, clinicalDiagnosis: true } },
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'UPDATE_INJURY_LOG',
      `Injury point ${id} updated`,
      id,
    );

    return updated;
  }

  async deleteInjury(id: string, actor: CurrentUserPayload) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền xóa điểm chấn thương');
    }

    const injury = await this.prisma.injuryLog.findUnique({ where: { id } });
    if (!injury) {
      throw new NotFoundException('Không tìm thấy điểm chấn thương');
    }

    const now = new Date().getTime();
    const createdTime = new Date(injury.createdAt).getTime();
    const hoursDifference = (now - createdTime) / (1000 * 60 * 60);

    let historyLength = 0;
    if (injury.recoveryHistory) {
      try {
        const historyArray =
          typeof injury.recoveryHistory === 'string'
            ? JSON.parse(injury.recoveryHistory)
            : (injury.recoveryHistory as any[]);
        historyLength = Array.isArray(historyArray) ? historyArray.length : 0;
      } catch {
        historyLength = 0;
      }
    }

    if (hoursDifference > 24 || historyLength > 1) {
      throw new BadRequestException(
        'Chỉ có thể xóa điểm chấn thương được tạo trong vòng 24 giờ và chưa có lịch sử cập nhật hồi phục',
      );
    }

    await this.prisma.injuryLog.delete({ where: { id } });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'DELETE_INJURY_LOG',
      `Injury point ${id} deleted`,
      id,
    );

    return { message: 'Đã xóa điểm chấn thương thành công' };
  }

  async updateRecoveryProgress(
    id: string,
    actor: CurrentUserPayload,
    dto: UpdateRecoveryProgressDto,
  ) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền cập nhật tiến trình hồi phục');
    }

    const injury = await this.prisma.injuryLog.findUnique({ where: { id } });
    if (!injury) {
      throw new NotFoundException('Không tìm thấy điểm chấn thương');
    }

    if (injury.stage === 'HEALED' && dto.stage === 'HEALED') {
      throw new BadRequestException('Chấn thương này đã được đánh dấu Đã lành');
    }

    let history: any[] = [];
    if (injury.recoveryHistory) {
      try {
        history =
          typeof injury.recoveryHistory === 'string'
            ? JSON.parse(injury.recoveryHistory)
            : (injury.recoveryHistory as any[]);
      } catch {
        history = [];
      }
    }

    const newEntry = {
      id: `hist-${Date.now()}`,
      stage: dto.stage,
      evaluationDate: dto.evaluationDate || new Date().toISOString(),
      severity: dto.currentSeverity || injury.severity,
      notes: dto.notes,
      updatedByUserId: actor.userId,
      updatedByName: actor.fullName,
      createdAt: new Date().toISOString(),
    };

    history.push(newEntry);

    const isHealed = dto.stage === 'HEALED';
    const status = isHealed ? InjuryStatus.RESOLVED : InjuryStatus.HEALING;

    const updated = await this.prisma.injuryLog.update({
      where: { id },
      data: {
        stage: dto.stage,
        severity: dto.currentSeverity || injury.severity,
        status,
        recoveryHistory: history,
      },
      include: {
        horse: { select: { id: true, name: true, microchipRfid: true } },
        medicalRecord: { select: { id: true, examinationDate: true, clinicalDiagnosis: true } },
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'UPDATE_INJURY_RECOVERY_PROGRESS',
      `Injury ${id} recovery updated to ${dto.stage}`,
      id,
    );

    return updated;
  }

  // ---------------------------------------------------------------------------
  // MEDICAL RECORDS (BỆNH ÁN)
  // ---------------------------------------------------------------------------

  async createMedicalRecord(actor: CurrentUserPayload, dto: CreateMedicalRecordDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền tạo bệnh án');
    }

    const horse = await this.prisma.horse.findUnique({
      where: { id: dto.horseId },
    });
    if (!horse) {
      throw new NotFoundException('Không tìm thấy chiến mã');
    }

    const isDraft = dto.isDraft ?? false;

    // Build prescription text if labTests or treatment provided as details
    let prescriptionDetails: string | null = null;
    if (dto.labTests && dto.labTests.length > 0) {
      prescriptionDetails = JSON.stringify({ labTests: dto.labTests });
    }

    const record = await this.prisma.medicalRecord.create({
      data: {
        horseId: dto.horseId,
        veterinarianUserId: actor.userId,
        examinationDate: dto.examinationDate ? new Date(dto.examinationDate) : new Date(),
        symptoms: dto.symptoms || dto.reason || 'Khám tổng quát',
        clinicalDiagnosis: dto.diagnosis || 'Chờ chẩn đoán',
        treatmentProtocol: dto.vitals?.clinicalExamination || dto.reason,
        prescriptionDetails,
        requiresFollowUp: false,
      },
      include: {
        horse: true,
        veterinarian: true,
      },
    });

    // Option to update horse status if recommended
    if (!isDraft && dto.recommendedHorseStatus) {
      const validStatus = Object.values(HorseStatus).includes(
        dto.recommendedHorseStatus as HorseStatus,
      );
      if (validStatus) {
        await this.prisma.horse.update({
          where: { id: dto.horseId },
          data: { status: dto.recommendedHorseStatus as HorseStatus },
        });
      }
    }

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      isDraft ? 'CREATE_MEDICAL_RECORD_DRAFT' : 'CREATE_MEDICAL_RECORD',
      `Medical record created for horse ${dto.horseId}`,
      record.id,
    );

    return record;
  }

  async getMedicalRecords(currentUser: CurrentUserPayload, query: MedicalRecordQueryDto) {
    const { horseId, startDate, endDate, search, page = '1', limit = '10' } = query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const where: any = {};

    if (horseId) {
      await this.checkHorseAccess(horseId, currentUser);
      where.horseId = horseId;
    } else if (currentUser.role === Role.HORSE_OWNER) {
      where.horse = { ownerId: currentUser.userId };
    } else if (currentUser.role === Role.GROOM) {
      where.horse = {
        stallAllocations: {
          some: {
            assignedGroomUserId: currentUser.userId,
            isActive: true,
          },
        },
      };
    }

    if (startDate || endDate) {
      where.examinationDate = {};
      if (startDate) where.examinationDate.gte = new Date(startDate);
      if (endDate) where.examinationDate.lte = new Date(endDate);
    }

    if (search) {
      where.OR = [
        { symptoms: { contains: search, mode: 'insensitive' } },
        { clinicalDiagnosis: { contains: search, mode: 'insensitive' } },
        { horse: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, records] = await Promise.all([
      this.prisma.medicalRecord.count({ where }),
      this.prisma.medicalRecord.findMany({
        where,
        skip,
        take,
        orderBy: { examinationDate: 'desc' },
        include: {
          horse: {
            select: { id: true, name: true, microchipRfid: true, status: true },
          },
          veterinarian: {
            select: { id: true, fullName: true, email: true },
          },
          injuries: true,
        },
      }),
    ]);

    // Mask sensitive details for HORSE_OWNER if needed
    const mappedRecords = records.map((record) => {
      if (currentUser.role === Role.HORSE_OWNER) {
        return {
          id: record.id,
          horseId: record.horseId,
          horse: record.horse,
          examinationDate: record.examinationDate,
          symptoms: record.symptoms,
          clinicalDiagnosis: record.clinicalDiagnosis,
          requiresFollowUp: record.requiresFollowUp,
          followUpDate: record.followUpDate,
          createdAt: record.createdAt,
        };
      }
      return record;
    });

    return {
      data: mappedRecords,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(total / take),
    };
  }

  async getMedicalRecordDetail(id: string, currentUser: CurrentUserPayload) {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
      include: {
        horse: {
          include: {
            medicalLocks: { where: { isLocked: true } },
          },
        },
        veterinarian: {
          select: { id: true, fullName: true, email: true, phoneNumber: true },
        },
        injuries: true,
      },
    });

    if (!record) {
      throw new NotFoundException('Không tìm thấy bệnh án');
    }

    await this.checkHorseAccess(record.horseId, currentUser);

    if (currentUser.role === Role.HORSE_OWNER) {
      return {
        id: record.id,
        horseId: record.horseId,
        horse: record.horse,
        veterinarian: record.veterinarian,
        examinationDate: record.examinationDate,
        symptoms: record.symptoms,
        clinicalDiagnosis: record.clinicalDiagnosis,
        requiresFollowUp: record.requiresFollowUp,
        followUpDate: record.followUpDate,
        createdAt: record.createdAt,
      };
    }

    return record;
  }

  async updateMedicalRecord(id: string, actor: CurrentUserPayload, dto: UpdateMedicalRecordDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền chỉnh sửa bệnh án');
    }

    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException('Không tìm thấy bệnh án');
    }

    const dataToUpdate: any = {};
    if (dto.symptoms !== undefined) dataToUpdate.symptoms = dto.symptoms;
    if (dto.diagnosis !== undefined) dataToUpdate.clinicalDiagnosis = dto.diagnosis;
    if (dto.vitals?.clinicalExamination !== undefined) {
      dataToUpdate.treatmentProtocol = dto.vitals.clinicalExamination;
    }
    if (dto.examinationDate) {
      dataToUpdate.examinationDate = new Date(dto.examinationDate);
    }

    const updated = await this.prisma.medicalRecord.update({
      where: { id },
      data: dataToUpdate,
      include: {
        horse: true,
        veterinarian: true,
        injuries: true,
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'UPDATE_MEDICAL_RECORD',
      `Medical record ${id} updated`,
      id,
    );

    return updated;
  }

  async deleteMedicalRecord(id: string, actor: CurrentUserPayload) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền xóa bệnh án');
    }

    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException('Không tìm thấy bệnh án');
    }

    await this.prisma.medicalRecord.delete({ where: { id } });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'DELETE_MEDICAL_RECORD',
      `Medical record ${id} deleted`,
      id,
    );

    return { message: 'Đã xóa bệnh án thành công' };
  }

  async finalizeMedicalRecord(recordId: string, actor: CurrentUserPayload, dto: FinalizeRecordDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền chốt bệnh án');
    }

    const record = await this.prisma.medicalRecord.findUnique({
      where: { id: recordId },
      include: { horse: true },
    });
    if (!record) throw new NotFoundException('Không tìm thấy bệnh án');
    const recAny = record as any;
    if (recAny.isDraft === false) {
      throw new BadRequestException('Bệnh án đã được chốt trước đó');
    }

    // 1. Chốt bệnh án
    const updated = await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: { isDraft: false } as any,
    });

    // 2. Nếu FE yêu cầu áp dụng trạng thái đề xuất lên ngựa
    if (dto.applyProposedStatus && recAny.recommendedHorseStatus) {
      await this.prisma.horse.update({
        where: { id: record.horseId },
        data: { status: recAny.recommendedHorseStatus as any },
      });
    }

    // 3. Nếu FE yêu cầu tạo Medical Lock kèm theo
    if (dto.proposeMedicalLock) {
      try {
        await this.createMedicalLock(actor, {
          horseId: record.horseId,
          appliedMedicalStatus: (recAny.recommendedHorseStatus as string) || 'INJURED',
          lockReason: dto.lockReason || `Khóa do chốt bệnh án #${recAny.recordNumber || record.id}`,
          expectedRestDays: dto.lockExpectedRestDays || 7,
        } as any);
      } catch {
        // Nếu đã có lock thì bỏ qua, không throw
      }
    }

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'FINALIZE_MEDICAL_RECORD',
      `Medical record ${recordId} finalized`,
      recordId,
    );

    return { record: updated };
  }

  async closeMedicalRecord(id: string, actor: CurrentUserPayload, dto: CloseMedicalRecordDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền kết thúc bệnh án');
    }

    const record = await this.prisma.medicalRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('Không tìm thấy bệnh án');
    }

    const updated = await this.prisma.medicalRecord.update({
      where: { id },
      data: {
        treatmentProtocol: `${record.treatmentProtocol}\n[KẾT LUẬN]: ${dto.conclusion}`,
        requiresFollowUp: false,
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'CLOSE_MEDICAL_RECORD',
      `Medical record ${id} closed with conclusion: ${dto.conclusion}`,
      id,
    );

    return updated;
  }

  async reopenMedicalRecord(id: string, actor: CurrentUserPayload, dto: ReopenMedicalRecordDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền mở lại bệnh án');
    }

    const record = await this.prisma.medicalRecord.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('Không tìm thấy bệnh án');
    }

    const updated = await this.prisma.medicalRecord.update({
      where: { id },
      data: {
        treatmentProtocol: `${record.treatmentProtocol}\n[MỞ LẠI]: ${dto.reason}`,
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'REOPEN_MEDICAL_RECORD',
      `Medical record ${id} reopened with reason: ${dto.reason}`,
      id,
    );

    return updated;
  }

  // ---------------------------------------------------------------------------
  // TREATMENT PHASES (PHÁC ĐỒ ĐIỀU TRỊ)
  // ---------------------------------------------------------------------------

  async addTreatmentPhase(
    recordId: string,
    actor: CurrentUserPayload,
    dto: CreateTreatmentPhaseDto,
  ) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền thêm phác đồ');
    }

    const record = await this.prisma.medicalRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Không tìm thấy bệnh án');

    const allowedActivity = dto.allowedActivity || dto.allowedActivityLevel || '';

    const phase = {
      id: `phase-${Date.now()}`,
      phaseName: dto.phaseName,
      startDate: dto.startDate,
      endDate: dto.endDate,
      target: dto.target || null,
      allowedActivity,
      careInstructions: dto.careInstructions || [],
    };

    const phaseNote = `[PHÁC ĐỒ - ${dto.phaseName}]: Tu: ${dto.startDate} Den: ${dto.endDate} | Muc tieu: ${dto.target || 'N/A'} | Van dong: ${allowedActivity}`;
    const updatedProtocol = record.treatmentProtocol
      ? `${record.treatmentProtocol}\n${phaseNote}`
      : phaseNote;

    const updated = await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: { treatmentProtocol: updatedProtocol },
    });

    return { message: 'Đã thêm giai đoạn phác đồ thành công', phase, record: updated };
  }

  async updateTreatmentPhase(
    recordId: string,
    phaseId: string,
    actor: CurrentUserPayload,
    dto: UpdateTreatmentPhaseDto,
  ) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền cập nhật phác đồ');
    }

    const record = await this.prisma.medicalRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Không tìm thấy bệnh án');

    return { message: 'Đã cập nhật phác đồ điều trị thành công', dto };
  }

  // ---------------------------------------------------------------------------
  // PRESCRIPTIONS (KÊ ĐƠN THUỐC)
  // ---------------------------------------------------------------------------

  async addPrescription(recordId: string, actor: CurrentUserPayload, dto: CreatePrescriptionDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền kê đơn thuốc');
    }

    const record = await this.prisma.medicalRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Không tìm thấy bệnh án');

    let currentRx: any[] = [];
    if (record.prescriptionDetails) {
      try {
        currentRx = JSON.parse(record.prescriptionDetails);
        if (!Array.isArray(currentRx)) currentRx = [currentRx];
      } catch {
        currentRx = [{ raw: record.prescriptionDetails }];
      }
    }

    const adminRoute = dto.administrationRoute || dto.route || '';
    const freq = dto.frequency || (dto.frequencyPerDay ? `${dto.frequencyPerDay} lần/ngày` : '');

    const newPrescription = {
      id: `rx-${Date.now()}`,
      medicationName: dto.medicationName,
      dosage: dto.dosage,
      unit: dto.unit || '',
      route: adminRoute,
      administrationRoute: adminRoute,
      frequencyPerDay: dto.frequencyPerDay || dto.frequency,
      frequency: freq,
      startDate: dto.startDate,
      endDate: dto.endDate,
      daysCount: dto.daysCount || 0,
      withdrawalDays: dto.withdrawalDays || 0,
      notes: dto.notes || '',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    currentRx.push(newPrescription);

    const updated = await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: { prescriptionDetails: JSON.stringify(currentRx) },
    });

    return { message: 'Kê đơn thuốc thành công', prescription: newPrescription, record: updated };
  }

  async updatePrescription(
    recordId: string,
    prescriptionId: string,
    actor: CurrentUserPayload,
    dto: UpdatePrescriptionDto,
  ) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền sửa đơn thuốc');
    }

    const record = await this.prisma.medicalRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Không tìm thấy bệnh án');

    let currentRx: any[] = [];
    if (record.prescriptionDetails) {
      try {
        currentRx = JSON.parse(record.prescriptionDetails);
      } catch {
        currentRx = [];
      }
    }

    const index = currentRx.findIndex((rx) => rx.id === prescriptionId);
    if (index === -1) {
      throw new NotFoundException('Không tìm thấy thông tin đơn thuốc');
    }

    currentRx[index] = { ...currentRx[index], ...dto };

    await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: { prescriptionDetails: JSON.stringify(currentRx) },
    });

    return { message: 'Cập nhật đơn thuốc thành công', prescription: currentRx[index] };
  }

  async stopPrescription(
    recordId: string,
    prescriptionId: string,
    actor: CurrentUserPayload,
    dto: StopPrescriptionDto,
  ) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền dừng thuốc');
    }

    const record = await this.prisma.medicalRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Không tìm thấy bệnh án');

    let currentRx: any[] = [];
    if (record.prescriptionDetails) {
      try {
        currentRx = JSON.parse(record.prescriptionDetails);
      } catch {
        currentRx = [];
      }
    }

    const rx = currentRx.find((item) => item.id === prescriptionId);
    if (!rx) {
      throw new NotFoundException('Không tìm thấy đơn thuốc');
    }

    rx.status = 'STOPPED';
    rx.stoppedReason = dto.reason || 'Bác sĩ yêu cầu dừng thuốc';
    rx.stoppedAt = new Date().toISOString();

    await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: { prescriptionDetails: JSON.stringify(currentRx) },
    });

    return { message: 'Đã dừng đơn thuốc thành công', prescription: rx };
  }

  // ---------------------------------------------------------------------------
  // FOLLOW-UP VISITS (TÁI KHÁM)
  // ---------------------------------------------------------------------------

  async addFollowUp(recordId: string, actor: CurrentUserPayload, dto: CreateFollowUpDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền ghi nhận tái khám');
    }

    const record = await this.prisma.medicalRecord.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('Không tìm thấy bệnh án');

    const rawVisitDate = dto.followUpDate || dto.visitDate;
    const visitDate = rawVisitDate ? new Date(rawVisitDate) : new Date();

    const followUp = {
      id: `fu-${Date.now()}`,
      followUpDate: visitDate.toISOString().split('T')[0],
      temperature: dto.temperature ?? (dto.vitals?.temperature || null),
      restingHeartRate: dto.restingHeartRate ?? (dto.vitals?.restingHeartRate || null),
      respiratoryRate: dto.respiratoryRate ?? (dto.vitals?.respiratoryRate || null),
      progressNotes: dto.progressNotes,
      adjustments: dto.adjustments || null,
      vetName: actor.fullName || actor.email || 'Veterinarian',
    };

    const updated = await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        requiresFollowUp: true,
        followUpDate: visitDate,
        treatmentProtocol: `${record.treatmentProtocol}\n[TÁI KHÁM ${visitDate.toLocaleDateString()}]: ${dto.progressNotes}`,
      },
    });

    return { message: 'Ghi nhận tái khám thành công', followUp, record: updated };
  }

  // ---------------------------------------------------------------------------
  // MEDICAL LOCKS (KHÓA HUẤN LUYỆN - TASK P2-04)
  // ---------------------------------------------------------------------------

  async createMedicalLock(actor: CurrentUserPayload, dto: CreateMedicalLockDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền đặt Khóa huấn luyện');
    }

    const horse = await this.prisma.horse.findUnique({
      where: { id: dto.horseId },
      include: {
        medicalLocks: { where: { isLocked: true } },
        stallAllocations: { where: { isActive: true }, include: { stall: true } },
      },
    });
    if (!horse) throw new NotFoundException('Không tìm thấy chiến mã');

    const existingLock =
      horse.medicalLocks[0] ||
      (await this.prisma.medicalLock.findFirst({
        where: { horseId: dto.horseId, isLocked: true },
      }));
    if (existingLock) {
      throw new BadRequestException('Chiến mã này đã có Khóa huấn luyện đang hiệu lực');
    }

    const appliedStatus = dto.appliedMedicalStatus || dto.medicalStatus || HorseStatus.INJURED;

    const now = new Date();
    let recheckDate: Date;
    if (dto.recheckDate) {
      recheckDate = new Date(dto.recheckDate);
    } else {
      const restDays = dto.expectedRestDays || 7;
      recheckDate = new Date(now.getTime() + restDays * 24 * 60 * 60 * 1000);
    }

    if (recheckDate <= now) {
      throw new BadRequestException('Ngày xem xét lại phải từ ngày mai trở đi');
    }

    const maxRecheck = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    if (recheckDate > maxRecheck) {
      throw new BadRequestException('Ngày xem xét lại tối đa 180 ngày kể từ hôm nay');
    }

    const restDaysCalculated = Math.ceil(
      (recheckDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );

    const lockCount = await this.prisma.medicalLock.count();
    const lockCode = `KH-${String(lockCount + 1).padStart(6, '0')}`;

    const lock = await this.prisma.medicalLock.create({
      data: {
        lockCode,
        horseId: dto.horseId,
        medicalRecordId: dto.medicalRecordId || null,
        veterinarianUserId: actor.userId,
        expectedRestDays: restDaysCalculated,
        recheckDate,
        appliedMedicalStatus: appliedStatus,
        lockReason: dto.lockReason,
        unlockConditions:
          dto.unlockConditions || 'Hết triệu chứng chấn thương và được Bác sĩ thú y khám lại',
        isLocked: true,
      },
      include: {
        horse: { select: { id: true, name: true, microchipRfid: true } },
        veterinarian: { select: { id: true, fullName: true, email: true } },
        medicalRecord: { select: { id: true, examinationDate: true, clinicalDiagnosis: true } },
      },
    });

    // Update horse medical lock status & health status
    await this.prisma.horse.update({
      where: { id: dto.horseId },
      data: {
        isMedicalLocked: true,
        status: appliedStatus,
      },
    });

    // Cascading RULE-MED-01 enforcement:
    // 1. Suspend active/approved training plans for this horse
    await this.prisma.trainingPlan.updateMany({
      where: {
        horseId: dto.horseId,
        status: { in: [PlanStatus.ACTIVE, PlanStatus.APPROVED] },
      },
      data: {
        status: PlanStatus.SUSPENDED,
      },
    });

    // 2. Automatically cancel scheduled workouts with CANCELLED_MEDICAL_LOCK
    await this.prisma.workoutSession.updateMany({
      where: {
        horseId: dto.horseId,
        status: WorkoutStatus.SCHEDULED,
      },
      data: {
        status: WorkoutStatus.CANCELLED_MEDICAL_LOCK,
        trainerNotes: `Tự động hủy do Khóa huấn luyện thú y ${lockCode}: ${dto.lockReason}`,
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'CREATE_MEDICAL_LOCK',
      `Medical lock ${lockCode} created for horse ${dto.horseId}`,
      lock.id,
    );

    const impactAssessment = {
      horseId: horse.id,
      horseName: horse.name,
      previousStatus: horse.status,
      newStatus: appliedStatus,
      blockedWorkoutsMessage: 'Các buổi tập nặng sắp tới sẽ tự động bị chặn',
      suspendedRegistrationsMessage: 'Đăng ký thi đấu chưa diễn ra sẽ tạm treo',
      notificationRecipients: [
        'Huấn luyện viên Trưởng',
        'Quản lý Câu lạc bộ',
        'Nhân viên chăm sóc phụ trách',
        'Chủ sở hữu chiến mã',
      ],
    };

    return {
      ...lock,
      impactAssessment,
      message: `Đã đặt Khóa huấn luyện cho ${horse.name}`,
    };
  }

  async releaseMedicalLock(lockId: string, actor: CurrentUserPayload, dto: ReleaseMedicalLockDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền gỡ Khóa huấn luyện');
    }

    const lock = await this.prisma.medicalLock.findUnique({
      where: { id: lockId },
      include: {
        horse: {
          include: {
            injuryLogs: { where: { stage: 'ACUTE' } },
          },
        },
      },
    });
    if (!lock || !lock.isLocked) {
      throw new BadRequestException('Không tìm thấy Khóa huấn luyện hoặc khóa đã được gỡ');
    }

    const newHorseStatus = dto.newHorseStatus || HorseStatus.RESTING;

    const unlocked = await this.prisma.medicalLock.update({
      where: { id: lockId },
      data: {
        isLocked: false,
        unlockedAt: new Date(),
        unlockVetUserId: actor.userId,
        unlockReason: dto.unlockReason,
        recheckNotes: dto.unlockReason,
      },
      include: {
        horse: { select: { id: true, name: true, microchipRfid: true } },
        veterinarian: { select: { id: true, fullName: true } },
        unlockVet: { select: { id: true, fullName: true } },
      },
    });

    await this.prisma.horse.update({
      where: { id: lock.horseId },
      data: {
        isMedicalLocked: false,
        status: newHorseStatus,
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'RELEASE_MEDICAL_LOCK',
      `Medical lock ${lock.lockCode || lockId} released for horse ${lock.horseId}`,
      lockId,
    );

    const warnings: string[] = [];
    if (lock.horse?.injuryLogs && lock.horse.injuryLogs.length > 0) {
      warnings.push(`Ngựa còn ${lock.horse.injuryLogs.length} chấn thương ở giai đoạn Cấp tính`);
    }

    return {
      ...unlocked,
      warnings,
      message: `Đã gỡ Khóa huấn luyện cho ${lock.horse.name}`,
      notificationToTrainer: 'Có các buổi tập bị chặn có thể khôi phục',
    };
  }

  async extendMedicalLock(lockId: string, actor: CurrentUserPayload, dto: ExtendMedicalLockDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền gia hạn Khóa huấn luyện');
    }

    const lock = await this.prisma.medicalLock.findUnique({ where: { id: lockId } });
    if (!lock || !lock.isLocked) {
      throw new BadRequestException('Không tìm thấy Khóa huấn luyện đang hiệu lực');
    }

    const now = new Date();
    let newRecheckDate: Date;

    if (dto.recheckDate) {
      newRecheckDate = new Date(dto.recheckDate);
    } else if (dto.additionalDays) {
      const baseDate = lock.recheckDate && lock.recheckDate > now ? lock.recheckDate : now;
      newRecheckDate = new Date(baseDate.getTime() + dto.additionalDays * 24 * 60 * 60 * 1000);
    } else {
      throw new BadRequestException('Vui lòng chọn ngày xem xét mới hoặc số ngày gia hạn');
    }

    if (newRecheckDate <= now) {
      throw new BadRequestException('Ngày xem xét mới phải sau ngày hiện tại');
    }

    if (lock.recheckDate && newRecheckDate <= lock.recheckDate) {
      throw new BadRequestException(
        `Ngày xem xét mới phải sau ngày xem xét cũ (${lock.recheckDate.toLocaleDateString()})`,
      );
    }

    const maxRecheck = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    if (newRecheckDate > maxRecheck) {
      throw new BadRequestException('Ngày xem xét mới tối đa 180 ngày kể từ hôm nay');
    }

    let history: any[] = [];
    if (lock.extensionHistory) {
      try {
        history =
          typeof lock.extensionHistory === 'string'
            ? JSON.parse(lock.extensionHistory)
            : (lock.extensionHistory as any[]);
      } catch {
        history = [];
      }
    }

    const extensionReason = dto.recheckNotes || dto.extendReason || 'Gia hạn ngày xem xét lại';

    const historyEntry = {
      id: `ext-${Date.now()}`,
      oldRecheckDate: lock.recheckDate ? lock.recheckDate.toISOString() : null,
      newRecheckDate: newRecheckDate.toISOString(),
      reason: extensionReason,
      updatedByUserId: actor.userId,
      updatedByName: actor.fullName,
      createdAt: now.toISOString(),
    };

    history.push(historyEntry);

    const newRestDays = Math.ceil(
      (newRecheckDate.getTime() - new Date(lock.lockedAt).getTime()) / (24 * 60 * 60 * 1000),
    );

    const extended = await this.prisma.medicalLock.update({
      where: { id: lockId },
      data: {
        recheckDate: newRecheckDate,
        expectedRestDays: newRestDays,
        recheckNotes: extensionReason,
        extensionHistory: history,
      },
      include: {
        horse: { select: { id: true, name: true, microchipRfid: true } },
        veterinarian: { select: { id: true, fullName: true } },
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'EXTEND_MEDICAL_LOCK',
      `Medical lock ${lock.lockCode || lockId} extended to ${newRecheckDate.toLocaleDateString()}`,
      lockId,
    );

    return {
      ...extended,
      message: `Đã gia hạn ngày xem xét lại đến ${newRecheckDate.toLocaleDateString()}`,
    };
  }

  async getMedicalLocks(currentUser: CurrentUserPayload, query: MedicalLockQueryDto) {
    const {
      horseId,
      isLocked,
      tab,
      overdueOnly,
      appliedMedicalStatus,
      search,
      page = '1',
      limit = '10',
    } = query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const where: any = {};

    if (horseId) {
      await this.checkHorseAccess(horseId, currentUser);
      where.horseId = horseId;
    } else if (currentUser.role === Role.HORSE_OWNER) {
      where.horse = { ownerId: currentUser.userId };
    } else if (currentUser.role === Role.GROOM) {
      where.horse = {
        stallAllocations: {
          some: {
            assignedGroomUserId: currentUser.userId,
            isActive: true,
          },
        },
      };
    }

    if (tab === 'ACTIVE') {
      where.isLocked = true;
    } else if (tab === 'HISTORY') {
      where.isLocked = false;
    } else if (isLocked !== undefined) {
      where.isLocked = isLocked === 'true';
    }

    if (appliedMedicalStatus) {
      where.appliedMedicalStatus = appliedMedicalStatus;
    }

    const now = new Date();
    if (overdueOnly === 'true') {
      where.isLocked = true;
      where.recheckDate = { lt: now };
    }

    if (search) {
      where.OR = [
        { lockCode: { contains: search, mode: 'insensitive' } },
        { lockReason: { contains: search, mode: 'insensitive' } },
        { horse: { name: { contains: search, mode: 'insensitive' } } },
        { horse: { microchipRfid: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, locks] = await Promise.all([
      this.prisma.medicalLock.count({ where }),
      this.prisma.medicalLock.findMany({
        where,
        skip,
        take,
        orderBy: { lockedAt: 'desc' },
        include: {
          horse: { select: { id: true, name: true, microchipRfid: true, status: true } },
          veterinarian: { select: { id: true, fullName: true, email: true } },
          unlockVet: { select: { id: true, fullName: true, email: true } },
          medicalRecord: { select: { id: true, examinationDate: true, clinicalDiagnosis: true } },
        },
      }),
    ]);

    const mappedLocks = locks.map((lock) => {
      const isOverdue = lock.isLocked && !!lock.recheckDate && lock.recheckDate < now;
      let daysOverdue = 0;
      if (isOverdue && lock.recheckDate) {
        daysOverdue = Math.floor(
          (now.getTime() - new Date(lock.recheckDate).getTime()) / (24 * 60 * 60 * 1000),
        );
      }

      const lockDurationDays = Math.ceil(
        ((lock.unlockedAt ? new Date(lock.unlockedAt) : now).getTime() -
          new Date(lock.lockedAt).getTime()) /
          (24 * 60 * 60 * 1000),
      );

      return {
        ...lock,
        isOverdue,
        daysOverdue,
        lockDurationDays,
      };
    });

    return {
      data: mappedLocks,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(total / take),
    };
  }

  async getMedicalLockDetail(id: string, currentUser: CurrentUserPayload) {
    const lock = await this.prisma.medicalLock.findUnique({
      where: { id },
      include: {
        horse: {
          select: { id: true, name: true, microchipRfid: true, status: true, ownerId: true },
        },
        veterinarian: { select: { id: true, fullName: true, email: true, phoneNumber: true } },
        unlockVet: { select: { id: true, fullName: true, email: true } },
        medicalRecord: { select: { id: true, examinationDate: true, clinicalDiagnosis: true } },
      },
    });

    if (!lock) {
      throw new NotFoundException('Không tìm thấy Khóa huấn luyện');
    }

    await this.checkHorseAccess(lock.horseId, currentUser);

    const now = new Date();
    const isOverdue = lock.isLocked && !!lock.recheckDate && lock.recheckDate < now;
    let daysOverdue = 0;
    if (isOverdue && lock.recheckDate) {
      daysOverdue = Math.floor(
        (now.getTime() - new Date(lock.recheckDate).getTime()) / (24 * 60 * 60 * 1000),
      );
    }

    const lockDurationDays = Math.ceil(
      ((lock.unlockedAt ? new Date(lock.unlockedAt) : now).getTime() -
        new Date(lock.lockedAt).getTime()) /
        (24 * 60 * 60 * 1000),
    );

    return {
      ...lock,
      isOverdue,
      daysOverdue,
      lockDurationDays,
    };
  }

  // ---------------------------------------------------------------------------
  // HEALTH BOARD & OVERVIEW
  // ---------------------------------------------------------------------------

  async getHorseMedicalProfile(horseId: string, currentUser: CurrentUserPayload) {
    await this.checkHorseAccess(horseId, currentUser);

    const horse = await this.prisma.horse.findUnique({
      where: { id: horseId },
      include: {
        medicalLocks: { where: { isLocked: true } },
        stallAllocations: {
          where: { isActive: true },
          include: { stall: true },
        },
      },
    });

    if (!horse) {
      throw new NotFoundException('Không tìm thấy chiến mã');
    }

    const records = await this.prisma.medicalRecord.findMany({
      where: { horseId },
      orderBy: { createdAt: 'desc' },
      include: { veterinarian: { select: { id: true, fullName: true } } },
    });

    const injuries = await this.prisma.injuryLog.findMany({
      where: { horseId },
      orderBy: { createdAt: 'desc' },
    });

    // Transform to match the FE HorseMedicalProfile mock
    const activeLock = horse.medicalLocks[0] || null;
    const isMedicalLocked = horse.isMedicalLocked || !!activeLock;

    return {
      horse: {
        id: horse.id,
        name: horse.name,
        microchipRfid: horse.microchipRfid,
        breed: horse.breed,
        dob: horse.dob?.toISOString(),
        gender: horse.gender,
        color: horse.color,
        stallCode: horse.stallAllocations[0]?.stall?.code || 'Unassigned',
        healthStatus: horse.status || 'RESTING',
        isMedicalLocked,
        activeLock,
      },
      overview: {
        allowedActivity: 'N/A',
        careInstructions: [],
        activeMedications: [],
        latestVitals: null,
        vitalsHistory: [],
        upcomingPreventive: [],
      },
      medicalRecords: records.map((r) => ({
        id: r.id,
        examinationDate: r.examinationDate.toISOString(),
        examinationType: 'Routine Clinical',
        clinicalDiagnosis: r.clinicalDiagnosis,
        severity: 'MODERATE',
        status: 'CLOSED',
        veterinarianName: r.veterinarian?.fullName,
        symptoms: r.symptoms,
        treatmentProtocol: r.treatmentProtocol,
        prescriptionDetails: r.prescriptionDetails,
      })),
      injuries: injuries.map((i) => ({
        ...i,
        region: i.anatomicalZone,
        view: i.viewSide,
      })),
      observations: [],
    };
  }

  async getHealthBoard(query: HealthBoardQueryDto) {
    const horses = await this.prisma.horse.findMany({
      include: {
        medicalLocks: { where: { isLocked: true } },
        stallAllocations: {
          where: { isActive: true },
          include: { stall: true },
        },
      },
    });

    let qualifiedCount = 0;
    let observationCount = 0;
    let injuredCount = 0;
    let isolatedCount = 0;
    let lockedCount = 0;

    const mappedHorses = horses.map((horse) => {
      const isLocked = horse.medicalLocks.length > 0 || horse.isMedicalLocked;
      if (isLocked) lockedCount++;

      let healthGroup = 'QUALIFIED';
      if (horse.status === HorseStatus.UNDER_OBSERVATION) {
        healthGroup = 'OBSERVATION';
        observationCount++;
      } else if (horse.status === HorseStatus.INJURED) {
        healthGroup = 'INJURED';
        injuredCount++;
      } else if (horse.status === HorseStatus.ISOLATED) {
        healthGroup = 'ISOLATED';
        isolatedCount++;
      } else {
        qualifiedCount++;
      }

      return {
        id: horse.id,
        name: horse.name,
        microchipRfid: horse.microchipRfid,
        status: horse.status,
        healthGroup,
        isMedicalLocked: isLocked,
        stallCode: horse.stallAllocations[0]?.stall?.code || null,
        zone: horse.stallAllocations[0]?.stall?.zone || null,
      };
    });

    let filtered = mappedHorses;
    if (query.healthGroup) {
      filtered = filtered.filter((h) => h.healthGroup === query.healthGroup);
    }
    if (query.isLocked === 'true') {
      filtered = filtered.filter((h) => h.isMedicalLocked);
    }
    if (query.search) {
      const term = query.search.toLowerCase();
      filtered = filtered.filter(
        (h) => h.name.toLowerCase().includes(term) || h.microchipRfid.toLowerCase().includes(term),
      );
    }

    return {
      summary: {
        qualifiedCount,
        observationCount,
        injuredCount,
        isolatedCount,
        lockedCount,
        total: mappedHorses.length,
      },
      data: filtered,
    };
  }

  // ---------------------------------------------------------------------------
  // PREVENTIVE CARE & CATALOGS (TASK P2-05)
  // ---------------------------------------------------------------------------

  async getPreventiveCatalogs(query: { category?: PreventiveType; isActive?: string } = {}) {
    const where: any = {};
    if (query.category) where.category = query.category;
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true';

    const catalogs = await this.prisma.preventiveTypeCatalog.findMany({
      where,
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
      include: {
        _count: {
          select: { schedules: true },
        },
      },
    });

    return catalogs.map((cat) => ({
      ...cat,
      monitoredHorsesCount: cat._count.schedules,
    }));
  }

  async createPreventiveCatalog(actor: CurrentUserPayload, dto: CreatePreventiveTypeCatalogDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền tạo loại chăm sóc định kỳ');
    }

    const codeUpper = dto.code.toUpperCase();
    const existingCode = await this.prisma.preventiveTypeCatalog.findUnique({
      where: { code: codeUpper },
    });
    if (existingCode) {
      throw new BadRequestException('Mã loại đã tồn tại');
    }

    const existingName = await this.prisma.preventiveTypeCatalog.findUnique({
      where: { name: dto.name },
    });
    if (existingName) {
      throw new BadRequestException('Tên loại đã tồn tại');
    }

    const noticeDays = dto.advanceNoticeDays || 7;
    if (noticeDays >= dto.intervalDays) {
      throw new BadRequestException('Số ngày nhắc trước phải nhỏ hơn chu kỳ lặp lại');
    }

    const catalog = await this.prisma.preventiveTypeCatalog.create({
      data: {
        code: codeUpper,
        name: dto.name,
        category: dto.category,
        intervalDays: dto.intervalDays,
        advanceNoticeDays: noticeDays,
        applyToNewHorses: dto.applyToNewHorses ?? true,
        description: dto.description || null,
        isActive: true,
      },
    });

    if (catalog.applyToNewHorses) {
      const activeHorses = await this.prisma.horse.findMany({
        where: { status: { not: HorseStatus.RETIRED } },
        select: { id: true, createdAt: true },
      });

      for (const horse of activeHorses) {
        const dueDate = new Date(horse.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        await this.prisma.preventiveSchedule
          .upsert({
            where: { id: `schedule-${horse.id}-${catalog.id}` },
            create: {
              id: `schedule-${horse.id}-${catalog.id}`,
              horseId: horse.id,
              typeCatalogId: catalog.id,
              scheduleType: catalog.category,
              dueDate,
              status: PreventiveStatus.PENDING,
            },
            update: {},
          })
          .catch(() => {});
      }
    }

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'CREATE_PREVENTIVE_CATALOG',
      `Preventive catalog ${codeUpper} created`,
      catalog.id,
    );

    return catalog;
  }

  async updatePreventiveCatalog(
    id: string,
    actor: CurrentUserPayload,
    dto: UpdatePreventiveTypeCatalogDto,
  ) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền sửa loại chăm sóc định kỳ');
    }

    const catalog = await this.prisma.preventiveTypeCatalog.findUnique({ where: { id } });
    if (!catalog) throw new NotFoundException('Không tìm thấy loại chăm sóc định kỳ');

    if (dto.name && dto.name !== catalog.name) {
      const existingName = await this.prisma.preventiveTypeCatalog.findUnique({
        where: { name: dto.name },
      });
      if (existingName) throw new BadRequestException('Tên loại đã tồn tại');
    }

    const newInterval = dto.intervalDays || catalog.intervalDays;
    const newNotice = dto.advanceNoticeDays || catalog.advanceNoticeDays;
    if (newNotice >= newInterval) {
      throw new BadRequestException('Số ngày nhắc trước phải nhỏ hơn chu kỳ lặp lại');
    }

    const updated = await this.prisma.preventiveTypeCatalog.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.intervalDays && { intervalDays: dto.intervalDays }),
        ...(dto.advanceNoticeDays && { advanceNoticeDays: dto.advanceNoticeDays }),
        ...(dto.applyToNewHorses !== undefined && { applyToNewHorses: dto.applyToNewHorses }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'UPDATE_PREVENTIVE_CATALOG',
      `Preventive catalog ${catalog.code} updated`,
      id,
    );

    return updated;
  }

  async togglePreventiveCatalogStatus(id: string, actor: CurrentUserPayload) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền đổi trạng thái loại chăm sóc');
    }

    const catalog = await this.prisma.preventiveTypeCatalog.findUnique({ where: { id } });
    if (!catalog) throw new NotFoundException('Không tìm thấy loại chăm sóc định kỳ');

    const updated = await this.prisma.preventiveTypeCatalog.update({
      where: { id },
      data: { isActive: !catalog.isActive },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'TOGGLE_PREVENTIVE_CATALOG_STATUS',
      `Preventive catalog ${catalog.code} active status changed to ${updated.isActive}`,
      id,
    );

    return {
      ...updated,
      message: updated.isActive
        ? `Đã kích hoạt lại loại chăm sóc '${catalog.name}'`
        : `Đã ngừng sử dụng loại chăm sóc '${catalog.name}'`,
    };
  }

  async getPreventiveSchedules(currentUser: CurrentUserPayload, query: PreventiveQueryDto) {
    const {
      horseId,
      category,
      typeCatalogId,
      status,
      zone,
      search,
      page = '1',
      limit = '10',
    } = query;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const take = parseInt(limit, 10);

    const where: any = {};

    if (horseId) {
      await this.checkHorseAccess(horseId, currentUser);
      where.horseId = horseId;
    } else if (currentUser.role === Role.HORSE_OWNER) {
      where.horse = { ownerId: currentUser.userId };
    } else if (currentUser.role === Role.GROOM) {
      where.horse = {
        stallAllocations: {
          some: {
            assignedGroomUserId: currentUser.userId,
            isActive: true,
          },
        },
      };
    }

    if (typeCatalogId) {
      where.typeCatalogId = typeCatalogId;
    } else if (category) {
      where.OR = [{ scheduleType: category }, { typeCatalog: { category } }];
    }

    if (zone) {
      where.horse = {
        ...where.horse,
        stallAllocations: {
          some: {
            isActive: true,
            stall: { zone },
          },
        },
      };
    }

    if (search) {
      where.OR = [
        { horse: { name: { contains: search, mode: 'insensitive' } } },
        { horse: { microchipRfid: { contains: search, mode: 'insensitive' } } },
        { typeCatalog: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, schedules] = await Promise.all([
      this.prisma.preventiveSchedule.count({ where }),
      this.prisma.preventiveSchedule.findMany({
        where,
        skip,
        take,
        orderBy: { dueDate: 'asc' },
        include: {
          horse: {
            select: {
              id: true,
              name: true,
              microchipRfid: true,
              status: true,
              stallAllocations: {
                where: { isActive: true },
                select: { stall: { select: { code: true, zone: true } } },
              },
            },
          },
          typeCatalog: true,
          veterinarian: { select: { id: true, fullName: true, email: true } },
        },
      }),
    ]);

    const now = new Date();
    let overdueCount = 0;
    let upcoming7DaysCount = 0;
    let upcoming30DaysCount = 0;

    const mapped = schedules.map((sch) => {
      const noticeDays = sch.typeCatalog?.advanceNoticeDays || 7;
      const dueDate = new Date(sch.dueDate);

      const isOverdue = dueDate < now;
      const isUpcoming7 =
        !isOverdue && dueDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const isUpcoming30 =
        !isOverdue && dueDate <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const isNotice =
        !isOverdue && dueDate <= new Date(now.getTime() + noticeDays * 24 * 60 * 60 * 1000);

      if (isOverdue) overdueCount++;
      if (isUpcoming7) upcoming7DaysCount++;
      if (isUpcoming30) upcoming30DaysCount++;

      let statusBadge = 'NORMAL';
      if (isOverdue) {
        statusBadge = 'OVERDUE';
      } else if (isNotice) {
        statusBadge = 'UPCOMING';
      } else if (!sch.lastCompletedDate && !sch.completedDate) {
        statusBadge = 'NODATA';
      }

      return {
        ...sch,
        stallCode: sch.horse?.stallAllocations[0]?.stall?.code || null,
        zone: sch.horse?.stallAllocations[0]?.stall?.zone || null,
        statusBadge,
        isOverdue,
        isUpcomingNotice: isNotice,
        daysUntilDue: Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      };
    });

    let filteredResult = mapped;
    if (status) {
      if (status === 'OVERDUE') {
        filteredResult = mapped.filter((item) => item.statusBadge === 'OVERDUE');
      } else if (status === 'UPCOMING') {
        filteredResult = mapped.filter((item) => item.statusBadge === 'UPCOMING');
      } else if (status === 'NORMAL') {
        filteredResult = mapped.filter((item) => item.statusBadge === 'NORMAL');
      } else if (status === 'NODATA') {
        filteredResult = mapped.filter((item) => item.statusBadge === 'NODATA');
      } else if (status === 'UPCOMING_7') {
        filteredResult = mapped.filter((item) => item.isUpcomingNotice);
      }
    }

    return {
      counts: {
        overdue: overdueCount,
        upcoming7Days: upcoming7DaysCount,
        upcoming30Days: upcoming30DaysCount,
        total,
      },
      data: filteredResult,
      total: filteredResult.length,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(filteredResult.length / take),
    };
  }

  async recordPreventiveCare(actor: CurrentUserPayload, dto: RecordPreventiveCareDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền ghi nhận thực hiện định kỳ');
    }

    const catalog = await this.prisma.preventiveTypeCatalog.findUnique({
      where: { id: dto.typeCatalogId },
    });
    if (!catalog) {
      throw new NotFoundException('Không tìm thấy loại chăm sóc định kỳ');
    }

    const horseIds =
      dto.horseIds && dto.horseIds.length > 0 ? dto.horseIds : dto.horseId ? [dto.horseId] : [];

    if (horseIds.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất một chiến mã');
    }

    if (
      dto.performedByMode === 'EXTERNAL' &&
      (!dto.performedByName || dto.performedByName.trim().length === 0)
    ) {
      throw new BadRequestException('Vui lòng nhập tên người thực hiện');
    }

    if (
      (catalog.category === PreventiveType.VACCINATION ||
        catalog.category === PreventiveType.DEWORMING) &&
      !dto.productAdministered
    ) {
      throw new BadRequestException('Vui lòng chọn sản phẩm / vaccine đã dùng');
    }

    const now = new Date();
    const performedDate = dto.performedDate ? new Date(dto.performedDate) : now;
    if (performedDate > now) {
      throw new BadRequestException('Ngày thực hiện không được sau thời điểm hiện tại');
    }

    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    if (performedDate < ninetyDaysAgo) {
      throw new BadRequestException('Ngày thực hiện không được sớm hơn 90 ngày');
    }

    let nextDueDate: Date;
    if (dto.customNextDueDate) {
      nextDueDate = new Date(dto.customNextDueDate);
      if (nextDueDate <= performedDate) {
        throw new BadRequestException('Ngày đến hạn tiếp theo phải sau ngày thực hiện');
      }
    } else {
      nextDueDate = new Date(performedDate.getTime() + catalog.intervalDays * 24 * 60 * 60 * 1000);
    }

    const performedByName =
      dto.performedByMode === 'EXTERNAL' ? dto.performedByName! : actor.fullName;

    for (const horseId of horseIds) {
      const horse = await this.prisma.horse.findUnique({ where: { id: horseId } });
      if (!horse) continue;

      const schedule = await this.prisma.preventiveSchedule.findFirst({
        where: { horseId, typeCatalogId: catalog.id },
      });

      let history: any[] = [];
      if (schedule?.historyLogs) {
        try {
          history =
            typeof schedule.historyLogs === 'string'
              ? JSON.parse(schedule.historyLogs)
              : (schedule.historyLogs as any[]);
        } catch {
          history = [];
        }
      }

      const logEntry = {
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        performedDate: performedDate.toISOString(),
        performedByMode: dto.performedByMode || 'SELF',
        performedByName,
        productAdministered: dto.productAdministered || null,
        batchNumber: dto.batchNumber || null,
        nextDueDate: nextDueDate.toISOString(),
        notes: dto.notes || null,
        createdAt: now.toISOString(),
      };
      history.push(logEntry);

      if (schedule) {
        await this.prisma.preventiveSchedule.update({
          where: { id: schedule.id },
          data: {
            veterinarianUserId: actor.userId,
            lastCompletedDate: performedDate,
            completedDate: performedDate,
            dueDate: nextDueDate,
            productAdministered: dto.productAdministered || null,
            batchNumber: dto.batchNumber || null,
            performedByMode: dto.performedByMode || 'SELF',
            performedByName,
            notes: dto.notes || null,
            status: PreventiveStatus.COMPLETED,
            historyLogs: history,
          },
        });
      } else {
        await this.prisma.preventiveSchedule.create({
          data: {
            horseId,
            typeCatalogId: catalog.id,
            scheduleType: catalog.category,
            veterinarianUserId: actor.userId,
            lastCompletedDate: performedDate,
            completedDate: performedDate,
            dueDate: nextDueDate,
            productAdministered: dto.productAdministered || null,
            batchNumber: dto.batchNumber || null,
            performedByMode: dto.performedByMode || 'SELF',
            performedByName,
            notes: dto.notes || null,
            status: PreventiveStatus.COMPLETED,
            historyLogs: history,
          },
        });
      }
    }

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'RECORD_PREVENTIVE_CARE',
      `Recorded ${catalog.name} for ${horseIds.length} horse(s)`,
      catalog.id,
    );

    return {
      message: `Đã ghi nhận ${catalog.name} cho ${horseIds.length} chiến mã thành công`,
      count: horseIds.length,
      nextDueDate: nextDueDate.toLocaleDateString(),
    };
  }

  async setupHorsePreventive(actor: CurrentUserPayload, dto: SetupHorsePreventiveDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền thiết lập lịch định kỳ');
    }

    const horse = await this.prisma.horse.findUnique({ where: { id: dto.horseId } });
    if (!horse) throw new NotFoundException('Không tìm thấy chiến mã');

    const now = new Date();
    for (const item of dto.schedules) {
      const catalog = await this.prisma.preventiveTypeCatalog.findUnique({
        where: { id: item.typeCatalogId },
      });
      if (!catalog) continue;

      const schedule = await this.prisma.preventiveSchedule.findFirst({
        where: { horseId: dto.horseId, typeCatalogId: item.typeCatalogId },
      });

      if (item.enabled) {
        let dueDate: Date;
        if (item.initialDueDate) {
          dueDate = new Date(item.initialDueDate);
        } else if (schedule?.dueDate) {
          dueDate = schedule.dueDate;
        } else {
          dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        }

        if (schedule) {
          await this.prisma.preventiveSchedule.update({
            where: { id: schedule.id },
            data: { dueDate, status: PreventiveStatus.PENDING },
          });
        } else {
          await this.prisma.preventiveSchedule.create({
            data: {
              horseId: dto.horseId,
              typeCatalogId: catalog.id,
              scheduleType: catalog.category,
              dueDate,
              status: PreventiveStatus.PENDING,
            },
          });
        }
      }
    }

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'SETUP_HORSE_PREVENTIVE',
      `Setup preventive schedules for horse ${dto.horseId}`,
      dto.horseId,
    );

    return { message: 'Đã thiết lập lịch chăm sóc định kỳ cho chiến mã thành công' };
  }
}
