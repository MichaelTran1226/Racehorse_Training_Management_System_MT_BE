import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import {
  Role,
  HorseStatus,
  BodySide,
  SeverityLevel,
  InjuryStatus,
  PreventiveType,
  PreventiveStatus,
  WorkoutStatus,
  Prisma,
} from '@prisma/client';
import { HEAVY_WORKOUT_WHERE } from '../training/training-rules';
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
    private readonly notifications: NotificationsService,
  ) {}

  /** FR-011: đặt/gỡ khóa báo HT, CM, chủ ngựa và groom đang chăm. */
  private notifyLockAudience(
    horseId: string,
    input: Parameters<NotificationsService['notifyUsers']>[1],
    actorId: string,
  ) {
    return this.notifications.notifyHorse(
      horseId,
      { roles: [Role.HEAD_TRAINER, Role.CLUB_MANAGER], owner: true, groom: true },
      input,
      actorId,
    );
  }

  /** Chỉ Bác sĩ thú y được ghi dữ liệu y tế (đã chốt: Club Manager chỉ xem). */
  private assertVet(actor: CurrentUserPayload, action: string): void {
    if (actor.role !== Role.VETERINARIAN) {
      throw apiError(HttpStatus.FORBIDDEN, 'VET_ONLY', `Only a Veterinarian can ${action}.`);
    }
  }

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
      where: { id: horseId, deletedAt: null },
      include: {
        stallAllocations: {
          where: { isActive: true },
        },
      },
    });

    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse not found.');
    }

    if (currentUser.role === Role.HORSE_OWNER) {
      if (horse.ownerId !== currentUser.userId) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'HORSE_OUT_OF_SCOPE',
          'You can only view the medical file of your own horses.',
        );
      }
      return;
    }

    if (currentUser.role === Role.GROOM) {
      const isAssigned = horse.stallAllocations.some(
        (allocation) => allocation.assignedGroomUserId === currentUser.userId,
      );
      if (!isAssigned) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'HORSE_OUT_OF_SCOPE',
          'You can only view the medical file of horses in your care.',
        );
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
      where: { id: horseId, deletedAt: null },
    });
    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse not found.');
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
    this.assertVet(actor, 'log injuries');

    const horse = await this.prisma.horse.findUnique({
      where: { id: dto.horseId, deletedAt: null },
      include: {
        medicalLocks: { where: { isLocked: true } },
      },
    });
    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse not found.');
    }

    if (horse.status === HorseStatus.RETIRED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'HORSE_RETIRED',
        'The horse is no longer managed by the club; injuries cannot be recorded.',
      );
    }

    let discDate = new Date();
    if (dto.discoveryDate) {
      discDate = new Date(dto.discoveryDate);
      const now = new Date();
      if (discDate > now) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'DATE_IN_FUTURE',
          'The injury date cannot be in the future.',
        );
      }
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (discDate < thirtyDaysAgo) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'DATE_TOO_OLD',
          'The injury date cannot be more than 30 days ago.',
        );
      }
    }

    if (dto.medicalRecordId) {
      const record = await this.prisma.medicalRecord.findUnique({
        where: { id: dto.medicalRecordId },
      });
      if (!record || record.horseId !== dto.horseId) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'RECORD_NOT_FOR_HORSE',
          'The medical record does not exist or belongs to another horse.',
        );
      }
    }

    const initialStage = dto.stage || 'ACUTE';
    const isHealed = initialStage === 'HEALED';
    const status = isHealed ? InjuryStatus.RESOLVED : InjuryStatus.ACTIVE;

    const initialHistoryEntry = {
      id: `hist-${Date.now()}`,
      stage: initialStage,
      evaluationDate: discDate.toISOString().split('T')[0],
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
        discoveryDate: discDate,
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
      { entityName: 'InjuryLog' },
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
      throw apiError(HttpStatus.NOT_FOUND, 'INJURY_NOT_FOUND', 'Injury point not found.');
    }

    await this.checkHorseAccess(injury.horseId, currentUser);

    return injury;
  }

  async updateInjury(id: string, actor: CurrentUserPayload, dto: UpdateInjuryDto) {
    this.assertVet(actor, 'edit injury points');

    const injury = await this.prisma.injuryLog.findUnique({ where: { id } });
    if (!injury) {
      throw apiError(HttpStatus.NOT_FOUND, 'INJURY_NOT_FOUND', 'Injury point not found.');
    }

    if (dto.medicalRecordId) {
      const record = await this.prisma.medicalRecord.findUnique({
        where: { id: dto.medicalRecordId },
      });
      if (!record || record.horseId !== injury.horseId) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'RECORD_NOT_FOR_HORSE',
          'The medical record does not exist or belongs to another horse.',
        );
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
      if (dto.stage !== injury.stage) {
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
        history.push({
          id: `hist-${Date.now()}`,
          stage: dto.stage,
          evaluationDate: new Date().toISOString(),
          severity: dto.severity || injury.severity,
          notes: dto.description || `Cập nhật giai đoạn sang ${dto.stage}`,
          updatedByUserId: actor.userId,
          updatedByName: actor.fullName,
          createdAt: new Date().toISOString(),
        });
        dataToUpdate.recoveryHistory = history;
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
      { entityName: 'InjuryLog' },
    );

    return updated;
  }

  async deleteInjury(id: string, actor: CurrentUserPayload) {
    this.assertVet(actor, 'delete injury points');

    const injury = await this.prisma.injuryLog.findUnique({ where: { id } });
    if (!injury) {
      throw apiError(HttpStatus.NOT_FOUND, 'INJURY_NOT_FOUND', 'Injury point not found.');
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
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INJURY_NOT_DELETABLE',
        'An injury point can be deleted only within 24 hours and before any recovery update.',
      );
    }

    await this.prisma.injuryLog.delete({ where: { id } });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'DELETE_INJURY_LOG',
      `Injury point ${id} deleted`,
      id,
      { entityName: 'InjuryLog' },
    );

    return { message: 'Đã xóa điểm chấn thương thành công' };
  }

  async updateRecoveryProgress(
    id: string,
    actor: CurrentUserPayload,
    dto: UpdateRecoveryProgressDto,
  ) {
    this.assertVet(actor, 'update recovery progress');

    const runTx =
      typeof this.prisma.$transaction === 'function'
        ? (cb: any) => this.prisma.$transaction(cb)
        : (cb: any) => cb(this.prisma);

    const updated = await runTx(async (tx: any) => {
      const injury = await tx.injuryLog.findUnique({ where: { id } });
      if (!injury) {
        throw apiError(HttpStatus.NOT_FOUND, 'INJURY_NOT_FOUND', 'Injury point not found.');
      }

      if (injury.stage === 'HEALED' && dto.stage === 'HEALED') {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'INJURY_HEALED',
          'This injury is already marked as healed.',
        );
      }

      const now = new Date();
      const evalDate = dto.evaluationDate ? new Date(dto.evaluationDate) : now;
      if (evalDate > now) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'DATE_IN_FUTURE',
          'The assessment date cannot be in the future.',
        );
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

      if (history.length > 0) {
        const lastEntry = history[history.length - 1];
        if (lastEntry.evaluationDate) {
          const lastEval = new Date(lastEntry.evaluationDate);
          if (evalDate < lastEval) {
            throw apiError(
              HttpStatus.BAD_REQUEST,
              'DATE_BEFORE_PREVIOUS',
              'The assessment date cannot be earlier than the previous assessment.',
            );
          }
        }
      }

      const STAGE_ORDER: Record<string, number> = {
        ACUTE: 0,
        SUBACUTE: 1,
        RECOVERING: 2,
        HEALED: 3,
      };

      const currentStageLevel = STAGE_ORDER[injury.stage ?? 'ACUTE'] ?? 0;
      const newStageLevel = STAGE_ORDER[dto.stage];

      if (newStageLevel !== undefined) {
        if (newStageLevel > currentStageLevel + 1) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            'INVALID_STAGE_TRANSITION',
            `Recovery cannot skip stages (${injury.stage} → ${dto.stage}).`,
          );
        }
      }

      const newEntry = {
        id: `hist-${Date.now()}`,
        stage: dto.stage,
        evaluationDate: evalDate.toISOString(),
        severity: dto.currentSeverity || injury.severity,
        notes: dto.notes,
        updatedByUserId: actor.userId,
        updatedByName: actor.fullName,
        createdAt: new Date().toISOString(),
      };

      history.push(newEntry);

      const isHealed = dto.stage === 'HEALED';
      const status = isHealed ? InjuryStatus.RESOLVED : InjuryStatus.HEALING;

      return await tx.injuryLog.update({
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
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'UPDATE_INJURY_RECOVERY_PROGRESS',
      `Injury ${id} recovery updated to ${dto.stage}`,
      id,
      { entityName: 'InjuryLog' },
    );

    return updated;
  }

  // ---------------------------------------------------------------------------
  // MEDICAL RECORDS (BỆNH ÁN)
  // ---------------------------------------------------------------------------

  async createMedicalRecord(actor: CurrentUserPayload, dto: CreateMedicalRecordDto) {
    this.assertVet(actor, 'create medical records');

    const horse = await this.prisma.horse.findUnique({
      where: { id: dto.horseId, deletedAt: null },
    });
    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse not found.');
    }

    if (horse.status === HorseStatus.RETIRED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'HORSE_RETIRED',
        'The horse is no longer managed by the club; medical records cannot be created.',
      );
    }

    let examDate = new Date();
    if (dto.examinationDate) {
      examDate = new Date(dto.examinationDate);
      const now = new Date();
      if (examDate > now) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'DATE_IN_FUTURE',
          'The examination date cannot be in the future.',
        );
      }
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (examDate < thirtyDaysAgo) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'DATE_TOO_OLD',
          'The examination date cannot be more than 30 days ago.',
        );
      }
    }

    const isDraft = dto.isDraft ?? false;

    // Generate recordNumber BA-YYMM-NNN
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const count = await this.prisma.medicalRecord.count();
    const seq = String(count + 1).padStart(3, '0');
    const recordNumber = `BA-${yy}${mm}-${seq}`;

    // Build labTests JSON
    let labTestsStr: string | null = null;
    if (dto.labTests && dto.labTests.length > 0) {
      labTestsStr = JSON.stringify(dto.labTests);
    }

    const record = await this.prisma.medicalRecord.create({
      data: {
        recordNumber,
        horseId: dto.horseId,
        veterinarianUserId: actor.userId,
        examinationDate: examDate,
        examinationType: dto.examinationType || 'Routine Clinical',
        discoverySource: dto.discoverySource || null,
        severity: dto.severity || SeverityLevel.MODERATE,
        temperature: dto.vitals?.temperature ? Number(dto.vitals.temperature) : null,
        restingHeartRate: dto.vitals?.restingHeartRate ? Number(dto.vitals.restingHeartRate) : null,
        respiratoryRate: dto.vitals?.respiratoryRate ? Number(dto.vitals.respiratoryRate) : null,
        weightKg: dto.vitals?.weightKg ? Number(dto.vitals.weightKg) : null,
        clinicalExamination: dto.vitals?.clinicalExamination || null,
        symptoms: dto.symptoms || dto.reason || 'Khám tổng quát',
        clinicalDiagnosis: dto.diagnosis || 'Chờ chẩn đoán',
        treatmentProtocol: dto.reason || dto.vitals?.clinicalExamination || 'Theo dõi và điều trị',
        labTests: labTestsStr,
        requiresFollowUp: false,
        status: isDraft ? 'DRAFT' : 'OPEN',
      },
      include: {
        horse: true,
        veterinarian: true,
      },
    });

    if (!isDraft && dto.recommendedHorseStatus) {
      const validStatus = Object.values(HorseStatus).includes(
        dto.recommendedHorseStatus as HorseStatus,
      );
      if (validStatus && horse.status !== dto.recommendedHorseStatus) {
        await this.prisma.horse.update({
          where: { id: dto.horseId },
          data: { status: dto.recommendedHorseStatus as HorseStatus },
        });

        await this.audit.record(
          { id: actor.userId, name: actor.fullName },
          'HORSE_STATUS_CHANGED',
          `Changed status of horse ${horse.name} from ${horse.status} to ${dto.recommendedHorseStatus}. Reason: Đề xuất từ bệnh án #${recordNumber}`,
          horse.id,
        );
      }
    }

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      isDraft ? 'CREATE_MEDICAL_RECORD_DRAFT' : 'CREATE_MEDICAL_RECORD',
      `Medical record created for horse ${dto.horseId}`,
      record.id,
      { entityName: 'MedicalRecord' },
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
      throw apiError(HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND', 'Medical record not found.');
    }

    await this.checkHorseAccess(record.horseId, currentUser);

    // Đọc và parse danh sách giai đoạn phác đồ điều trị
    let treatmentPhases: any[] = [];
    if (record.treatmentPhases) {
      try {
        const parsed = JSON.parse(record.treatmentPhases);
        if (Array.isArray(parsed)) treatmentPhases = parsed;
      } catch {
        /* ignore invalid JSON */
      }
    }

    // Đọc và parse danh sách đơn thuốc (từ prescriptions hoặc fallback prescriptionDetails)
    let prescriptions: any[] = [];
    const rxSource = record.prescriptions || record.prescriptionDetails;
    if (rxSource) {
      try {
        const parsed = JSON.parse(rxSource);
        if (Array.isArray(parsed)) {
          prescriptions = parsed;
        } else if (parsed && typeof parsed === 'object' && !parsed.labTests) {
          prescriptions = [parsed];
        }
      } catch {
        /* ignore invalid JSON */
      }
    }

    // Đọc và parse danh sách các lần tái khám
    let followUps: any[] = [];
    if (record.followUps) {
      try {
        const parsed = JSON.parse(record.followUps);
        if (Array.isArray(parsed)) followUps = parsed;
      } catch {
        /* ignore invalid JSON */
      }
    }

    // Đọc danh sách xét nghiệm từ cột riêng labTests hoặc prescriptionDetails
    let labTests: any[] = [];
    if (record.labTests) {
      try {
        const parsed = JSON.parse(record.labTests);
        if (Array.isArray(parsed)) labTests = parsed;
      } catch {
        /* ignore invalid JSON */
      }
    } else if (record.prescriptionDetails) {
      try {
        const parsed = JSON.parse(record.prescriptionDetails);
        if (parsed?.labTests && Array.isArray(parsed.labTests)) {
          labTests = parsed.labTests;
        }
      } catch {
        /* ignore invalid JSON */
      }
    }

    const vitals = {
      temperature: record.temperature ?? undefined,
      restingHeartRate: record.restingHeartRate ?? undefined,
      respiratoryRate: record.respiratoryRate ?? undefined,
      weightKg: record.weightKg ?? undefined,
      clinicalNotes: record.clinicalExamination ?? undefined,
    };

    if (currentUser.role === Role.HORSE_OWNER) {
      return {
        id: record.id,
        recordNumber: record.recordNumber || record.id,
        horseId: record.horseId,
        horseName: record.horse?.name,
        horse: record.horse,
        status: record.status,
        veterinarian: record.veterinarian,
        vetName: record.veterinarian?.fullName,
        examinationDate: record.examinationDate.toISOString(),
        examinationType: record.examinationType || 'Routine Clinical',
        symptoms: record.symptoms,
        clinicalDiagnosis: record.clinicalDiagnosis,
        requiresFollowUp: record.requiresFollowUp,
        followUpDate: record.followUpDate,
        conclusion: record.conclusion || undefined,
        treatmentResult: record.treatmentResult || undefined,
        treatmentPhases,
        prescriptions,
        followUps,
        labTests,
        closedAt: record.closedAt ? record.closedAt.toISOString() : undefined,
        createdAt: record.createdAt.toISOString(),
      };
    }

    return {
      ...record,
      recordNumber: record.recordNumber || record.id,
      horseName: record.horse?.name,
      vetName: record.veterinarian?.fullName,
      status: record.status,
      examinationType: record.examinationType || 'Routine Clinical',
      discoverySource: record.discoverySource || 'VET Self-Discovered',
      severity: record.severity || 'MODERATE',
      conclusion: record.conclusion || undefined,
      treatmentResult: record.treatmentResult || undefined,
      vitals,
      treatmentPhases,
      prescriptions,
      followUps,
      labTests,
      examinationDate: record.examinationDate
        ? typeof record.examinationDate === 'string'
          ? record.examinationDate
          : record.examinationDate.toISOString()
        : new Date().toISOString(),
      closedAt: record.closedAt
        ? typeof record.closedAt === 'string'
          ? record.closedAt
          : record.closedAt.toISOString()
        : undefined,
      reopenedAt: record.reopenedAt
        ? typeof record.reopenedAt === 'string'
          ? record.reopenedAt
          : record.reopenedAt.toISOString()
        : undefined,
      createdAt: record.createdAt
        ? typeof record.createdAt === 'string'
          ? record.createdAt
          : record.createdAt.toISOString()
        : new Date().toISOString(),
      updatedAt: record.updatedAt
        ? typeof record.updatedAt === 'string'
          ? record.updatedAt
          : record.updatedAt.toISOString()
        : new Date().toISOString(),
    };
  }

  async updateMedicalRecord(id: string, actor: CurrentUserPayload, dto: UpdateMedicalRecordDto) {
    this.assertVet(actor, 'edit medical records');

    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
    });
    if (!record) {
      throw apiError(HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND', 'Medical record not found.');
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
      { entityName: 'MedicalRecord' },
    );

    return updated;
  }

  async deleteMedicalRecord(id: string, actor: CurrentUserPayload) {
    this.assertVet(actor, 'delete medical records');

    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
    });
    if (!record) {
      throw apiError(HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND', 'Medical record not found.');
    }

    if (record.status !== 'DRAFT') {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'RECORD_NOT_DRAFT',
        'Only a draft medical record can be deleted.',
      );
    }

    if (record.veterinarianUserId !== actor.userId && actor.role !== Role.CLUB_MANAGER) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'NOT_DRAFT_OWNER',
        'Only the veterinarian who created this draft can delete it.',
      );
    }

    await this.prisma.medicalRecord.delete({ where: { id } });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'DELETE_MEDICAL_RECORD',
      `Medical record draft ${id} deleted`,
      id,
      { entityName: 'MedicalRecord' },
    );

    return { message: 'Đã xóa bản nháp bệnh án thành công' };
  }

  async finalizeMedicalRecord(recordId: string, actor: CurrentUserPayload, dto: FinalizeRecordDto) {
    this.assertVet(actor, 'finalize medical records');

    const record = await this.prisma.medicalRecord.findUnique({
      where: { id: recordId },
      include: { horse: true },
    });
    if (!record)
      throw apiError(HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND', 'Medical record not found.');
    if (record.status !== 'DRAFT') {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'RECORD_ALREADY_FINALIZED',
        'This medical record is already official.',
      );
    }

    const recAny = record as any;

    // 1. Chốt bệnh án: chuyển sang OPEN
    const updated = await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: { status: 'OPEN' },
    });

    // 2. Nếu FE yêu cầu áp dụng trạng thái đề xuất lên ngựa
    if (dto.applyProposedStatus && recAny.recommendedHorseStatus) {
      const targetStatus = recAny.recommendedHorseStatus as any;
      if (record.horse?.status !== targetStatus) {
        if (record.horse?.status === HorseStatus.RETIRED) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            'HORSE_RETIRED',
            'The horse is no longer managed by the club; its status cannot change.',
          );
        }
        await this.prisma.horse.update({
          where: { id: record.horseId },
          data: { status: targetStatus },
        });

        await this.audit.record(
          { id: actor.userId, name: actor.fullName },
          'HORSE_STATUS_CHANGED',
          `Changed status of horse ${record.horse?.name} from ${record.horse?.status} to ${targetStatus}. Reason: Áp dụng đề xuất khi chốt bệnh án #${record.recordNumber || record.id}`,
          record.horseId,
        );
      }
    }

    // 3. Nếu FE yêu cầu tạo Medical Lock kèm theo
    if (dto.proposeMedicalLock) {
      try {
        await this.createMedicalLock(actor, {
          horseId: record.horseId,
          appliedMedicalStatus: (recAny.recommendedHorseStatus as string) || 'INJURED',
          lockReason: dto.lockReason || `Khóa do chốt bệnh án #${record.recordNumber || record.id}`,
          expectedRestDays: dto.lockExpectedRestDays || 7,
        } as any);
      } catch (err: any) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'FINALIZE_LOCK_FAILED',
          `The record was not made official: the Training Lock could not be placed (${err?.message || 'unknown error'}).`,
        );
      }
    }

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'FINALIZE_MEDICAL_RECORD',
      `Medical record ${recordId} finalized`,
      recordId,
      { entityName: 'MedicalRecord' },
    );

    return { record: updated };
  }

  async closeMedicalRecord(id: string, actor: CurrentUserPayload, dto: CloseMedicalRecordDto) {
    this.assertVet(actor, 'close medical records');

    const record = await this.prisma.medicalRecord.findUnique({ where: { id } });
    if (!record) {
      throw apiError(HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND', 'Medical record not found.');
    }

    if (record.status === 'CLOSED') {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'RECORD_ALREADY_CLOSED',
        'This medical record is already closed.',
      );
    }

    // Tự động dừng tất cả đơn thuốc đang ACTIVE của bệnh án
    let currentRx: any[] = [];
    const rxSource = record.prescriptions || record.prescriptionDetails;
    if (rxSource) {
      try {
        currentRx = JSON.parse(rxSource);
        if (!Array.isArray(currentRx)) currentRx = [];
      } catch {
        currentRx = [];
      }
    }

    const stoppedRx = currentRx.map((rx) => {
      if (rx.status === 'ACTIVE') {
        return {
          ...rx,
          status: 'STOPPED',
          stoppedReason: 'Bệnh án kết thúc điều trị',
          stoppedAt: new Date().toISOString(),
        };
      }
      return rx;
    });

    const now = new Date();
    // Cập nhật status CLOSED, closedAt, conclusion, treatmentResult và dừng đơn thuốc
    const updated = await this.prisma.medicalRecord.update({
      where: { id },
      data: {
        treatmentProtocol: `${record.treatmentProtocol}\n[KẾT LUẬN]: ${dto.conclusion}`,
        conclusion: dto.conclusion,
        treatmentResult: dto.treatmentResult || 'RECOVERED',
        closedAt: now,
        requiresFollowUp: false,
        status: 'CLOSED',
        prescriptions: JSON.stringify(stoppedRx),
        prescriptionDetails: JSON.stringify(stoppedRx),
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'CLOSE_MEDICAL_RECORD',
      `Medical record ${id} closed with conclusion: ${dto.conclusion}`,
      id,
      { entityName: 'MedicalRecord' },
    );

    return updated;
  }

  async reopenMedicalRecord(id: string, actor: CurrentUserPayload, dto: ReopenMedicalRecordDto) {
    this.assertVet(actor, 'reopen medical records');

    const record = await this.prisma.medicalRecord.findUnique({ where: { id } });
    if (!record) {
      throw apiError(HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND', 'Medical record not found.');
    }

    if (record.status !== 'CLOSED') {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'RECORD_NOT_CLOSED',
        'Only a closed medical record can be reopened.',
      );
    }

    // Kiểm tra quy tắc nghiệp vụ: Chỉ được mở lại trong vòng 7 ngày kể từ khi kết thúc
    if (record.closedAt) {
      const diffMs = Date.now() - new Date(record.closedAt).getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > 7) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'REOPEN_EXPIRED',
          'A medical record can be reopened only within 7 days after it was closed.',
        );
      }
    }

    const now = new Date();
    // Cập nhật Database: đổi trạng thái sang OPEN, ghi nhận reopenedAt và reopenReason
    const updated = await this.prisma.medicalRecord.update({
      where: { id },
      data: {
        treatmentProtocol: `${record.treatmentProtocol}\n[MỞ LẠI]: ${dto.reason}`,
        status: 'OPEN',
        reopenedAt: now,
        reopenReason: dto.reason,
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'REOPEN_MEDICAL_RECORD',
      `Medical record ${id} reopened with reason: ${dto.reason}`,
      id,
      { entityName: 'MedicalRecord' },
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
    this.assertVet(actor, 'add treatment phases');

    const record = await this.prisma.medicalRecord.findUnique({ where: { id: recordId } });
    if (!record)
      throw apiError(HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND', 'Medical record not found.');

    if (dto.startDate && dto.endDate) {
      const start = new Date(dto.startDate);
      const end = new Date(dto.endDate);
      if (end < start) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'INVALID_DATE_RANGE',
          'The phase end date must be on or after its start date.',
        );
      }
    }

    let phases: any[] = [];
    if (record.treatmentPhases) {
      try {
        phases = JSON.parse(record.treatmentPhases);
        if (!Array.isArray(phases)) phases = [];
      } catch {
        phases = [];
      }
    }

    const allowedActivity = dto.allowedActivity || dto.allowedActivityLevel || '';

    const phase = {
      id: `phase-${Date.now()}`,
      phaseName: dto.phaseName,
      startDate: dto.startDate,
      endDate: dto.endDate,
      target: dto.target || null,
      allowedActivity,
      careInstructions: dto.careInstructions || [],
      createdAt: new Date().toISOString(),
    };

    phases.push(phase);

    const phaseNote = `[PHÁC ĐỒ - ${dto.phaseName}]: Từ: ${dto.startDate} Đến: ${dto.endDate} | Mục tiêu: ${dto.target || 'N/A'} | Vận động: ${allowedActivity}`;
    const updatedProtocol = record.treatmentProtocol
      ? `${record.treatmentProtocol}\n${phaseNote}`
      : phaseNote;

    // Lưu phác đồ điều trị vào cột treatmentPhases trong Database
    const updated = await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        treatmentPhases: JSON.stringify(phases),
        treatmentProtocol: updatedProtocol,
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'ADD_TREATMENT_PHASE',
      `Added treatment phase ${dto.phaseName} to medical record ${recordId}`,
      recordId,
    );

    return { message: 'Đã thêm giai đoạn phác đồ thành công', phase, record: updated };
  }

  async updateTreatmentPhase(
    recordId: string,
    phaseId: string,
    actor: CurrentUserPayload,
    dto: UpdateTreatmentPhaseDto,
  ) {
    this.assertVet(actor, 'update treatment phases');

    const record = await this.prisma.medicalRecord.findUnique({ where: { id: recordId } });
    if (!record)
      throw apiError(HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND', 'Medical record not found.');

    let phases: any[] = [];
    if (record.treatmentPhases) {
      try {
        phases = JSON.parse(record.treatmentPhases);
        if (!Array.isArray(phases)) phases = [];
      } catch {
        phases = [];
      }
    }

    const index = phases.findIndex((p) => p.id === phaseId);
    if (index === -1) {
      throw apiError(HttpStatus.NOT_FOUND, 'PHASE_NOT_FOUND', 'Treatment phase not found.');
    }

    const updatedPhase = {
      ...phases[index],
      ...dto,
      allowedActivity:
        dto.allowedActivity || dto.allowedActivityLevel || phases[index].allowedActivity,
      updatedAt: new Date().toISOString(),
    };

    if (updatedPhase.startDate && updatedPhase.endDate) {
      const start = new Date(updatedPhase.startDate);
      const end = new Date(updatedPhase.endDate);
      if (end < start) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'INVALID_DATE_RANGE',
          'The phase end date must be on or after its start date.',
        );
      }
    }

    phases[index] = updatedPhase;

    // Lưu cập nhật vào cột treatmentPhases trong Database
    const updated = await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        treatmentPhases: JSON.stringify(phases),
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'UPDATE_TREATMENT_PHASE',
      `Updated treatment phase ${phaseId} for medical record ${recordId}`,
      recordId,
      { entityName: 'MedicalRecord' },
    );

    return {
      message: 'Đã cập nhật phác đồ điều trị thành công',
      phase: updatedPhase,
      record: updated,
    };
  }

  // ---------------------------------------------------------------------------
  // PRESCRIPTIONS (KÊ ĐƠN THUỐC)
  // ---------------------------------------------------------------------------

  async addPrescription(recordId: string, actor: CurrentUserPayload, dto: CreatePrescriptionDto) {
    this.assertVet(actor, 'prescribe medication');

    const record = await this.prisma.medicalRecord.findUnique({ where: { id: recordId } });
    if (!record)
      throw apiError(HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND', 'Medical record not found.');

    let currentRx: any[] = [];
    const rxSource = record.prescriptions || record.prescriptionDetails;
    if (rxSource) {
      try {
        currentRx = JSON.parse(rxSource);
        if (!Array.isArray(currentRx)) currentRx = [currentRx];
      } catch {
        currentRx = [];
      }
    }

    // Cảnh báo trùng thuốc đang hiệu lực: kiểm tra trong bệnh án hiện tại hoặc các bệnh án OPEN khác của ngựa
    const activeSameMedInCurrent = currentRx.find(
      (rx) =>
        rx.status === 'ACTIVE' &&
        rx.medicationName?.trim().toLowerCase() === dto.medicationName?.trim().toLowerCase(),
    );

    let conflictWarning: string | null = null;
    if (activeSameMedInCurrent) {
      conflictWarning = `Cảnh báo: Thuốc ${dto.medicationName} đang có hiệu lực trong bệnh án này!`;
    } else {
      const otherRecords = await this.prisma.medicalRecord.findMany({
        where: {
          horseId: record.horseId,
          status: 'OPEN',
          id: { not: recordId },
        },
        select: { id: true, recordNumber: true, prescriptions: true, prescriptionDetails: true },
      });

      for (const otherRec of otherRecords) {
        const otherSrc = otherRec.prescriptions || otherRec.prescriptionDetails;
        if (otherSrc) {
          try {
            const otherRxs = JSON.parse(otherSrc);
            if (Array.isArray(otherRxs)) {
              const matched = otherRxs.find(
                (rx) =>
                  rx.status === 'ACTIVE' &&
                  rx.medicationName?.trim().toLowerCase() ===
                    dto.medicationName?.trim().toLowerCase(),
              );
              if (matched) {
                conflictWarning = `Cảnh báo: Thuốc ${dto.medicationName} đang được sử dụng ở bệnh án khác (#${otherRec.recordNumber || otherRec.id})!`;
                break;
              }
            }
          } catch {
            /* ignore invalid JSON */
          }
        }
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

    // Lưu danh sách đơn thuốc vào cột prescriptions riêng biệt trong Database (đồng bộ prescriptionDetails để tương thích ngược)
    const updated = await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        prescriptions: JSON.stringify(currentRx),
        prescriptionDetails: JSON.stringify(currentRx),
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'ADD_PRESCRIPTION',
      `Prescribed ${dto.medicationName} for medical record ${recordId}`,
      recordId,
    );

    return {
      message: 'Kê đơn thuốc thành công',
      prescription: newPrescription,
      warning: conflictWarning,
      record: updated,
    };
  }

  async updatePrescription(
    recordId: string,
    prescriptionId: string,
    actor: CurrentUserPayload,
    dto: UpdatePrescriptionDto,
  ) {
    this.assertVet(actor, 'edit prescriptions');

    const record = await this.prisma.medicalRecord.findUnique({ where: { id: recordId } });
    if (!record)
      throw apiError(HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND', 'Medical record not found.');

    let currentRx: any[] = [];
    const rxSource = record.prescriptions || record.prescriptionDetails;
    if (rxSource) {
      try {
        currentRx = JSON.parse(rxSource);
      } catch {
        currentRx = [];
      }
    }

    const index = currentRx.findIndex((rx) => rx.id === prescriptionId);
    if (index === -1) {
      throw apiError(HttpStatus.NOT_FOUND, 'PRESCRIPTION_NOT_FOUND', 'Prescription not found.');
    }

    const rx = currentRx[index];

    // Quy tắc nghiệp vụ: Chỉ cho phép chỉnh sửa khi đơn thuốc chưa bắt đầu dùng (startDate > now)
    if (rx.startDate) {
      const start = new Date(rx.startDate);
      if (start.getTime() <= Date.now()) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'PRESCRIPTION_STARTED',
          'This prescription has already started and cannot be edited. Stop it and prescribe a new one.',
        );
      }
    }

    currentRx[index] = { ...rx, ...dto, updatedAt: new Date().toISOString() };

    // Cập nhật mảng đơn thuốc vào cột prescriptions trong Database
    await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        prescriptions: JSON.stringify(currentRx),
        prescriptionDetails: JSON.stringify(currentRx),
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'UPDATE_PRESCRIPTION',
      `Updated prescription ${prescriptionId} for medical record ${recordId}`,
      recordId,
    );

    return { message: 'Cập nhật đơn thuốc thành công', prescription: currentRx[index] };
  }

  async stopPrescription(
    recordId: string,
    prescriptionId: string,
    actor: CurrentUserPayload,
    dto: StopPrescriptionDto,
  ) {
    this.assertVet(actor, 'stop medication');

    const record = await this.prisma.medicalRecord.findUnique({ where: { id: recordId } });
    if (!record)
      throw apiError(HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND', 'Medical record not found.');

    let currentRx: any[] = [];
    const rxSource = record.prescriptions || record.prescriptionDetails;
    if (rxSource) {
      try {
        currentRx = JSON.parse(rxSource);
      } catch {
        currentRx = [];
      }
    }

    const rx = currentRx.find((item) => item.id === prescriptionId);
    if (!rx) {
      throw apiError(HttpStatus.NOT_FOUND, 'PRESCRIPTION_NOT_FOUND', 'Prescription not found.');
    }

    rx.status = 'STOPPED';
    rx.stoppedReason = dto.reason || 'Bác sĩ yêu cầu dừng thuốc';
    rx.stoppedAt = new Date().toISOString();

    // Cập nhật trạng thái dừng đơn thuốc vào cột prescriptions trong Database
    await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        prescriptions: JSON.stringify(currentRx),
        prescriptionDetails: JSON.stringify(currentRx),
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'STOP_PRESCRIPTION',
      `Stopped prescription ${prescriptionId} for medical record ${recordId}: ${rx.stoppedReason}`,
      recordId,
    );

    return { message: 'Đã dừng đơn thuốc thành công', prescription: rx };
  }

  // ---------------------------------------------------------------------------
  // FOLLOW-UP VISITS (TÁI KHÁM)
  // ---------------------------------------------------------------------------

  async addFollowUp(recordId: string, actor: CurrentUserPayload, dto: CreateFollowUpDto) {
    this.assertVet(actor, 'record follow-up visits');

    const record = await this.prisma.medicalRecord.findUnique({ where: { id: recordId } });
    if (!record)
      throw apiError(HttpStatus.NOT_FOUND, 'RECORD_NOT_FOUND', 'Medical record not found.');

    const rawVisitDate = dto.followUpDate || dto.visitDate;
    const visitDate = rawVisitDate ? new Date(rawVisitDate) : new Date();

    let followUps: any[] = [];
    if (record.followUps) {
      try {
        followUps = JSON.parse(record.followUps);
        if (!Array.isArray(followUps)) followUps = [];
      } catch {
        followUps = [];
      }
    }

    const followUp = {
      id: `fu-${Date.now()}`,
      followUpDate: visitDate.toISOString().split('T')[0],
      temperature: dto.temperature ?? (dto.vitals?.temperature || null),
      restingHeartRate: dto.restingHeartRate ?? (dto.vitals?.restingHeartRate || null),
      respiratoryRate: dto.respiratoryRate ?? (dto.vitals?.respiratoryRate || null),
      progressNotes: dto.progressNotes,
      adjustments: dto.adjustments || null,
      vetName: actor.fullName || actor.email || 'Veterinarian',
      createdAt: new Date().toISOString(),
    };

    followUps.push(followUp);

    // Lưu danh sách tái khám vào cột followUps trong Database
    const updated = await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        requiresFollowUp: true,
        followUpDate: visitDate,
        followUps: JSON.stringify(followUps),
        treatmentProtocol: `${record.treatmentProtocol}\n[TÁI KHÁM ${visitDate.toLocaleDateString()}]: ${dto.progressNotes}`,
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'ADD_FOLLOW_UP',
      `Recorded follow-up visit for medical record ${recordId}`,
      recordId,
    );

    return { message: 'Ghi nhận tái khám thành công', followUp, record: updated };
  }

  // ---------------------------------------------------------------------------
  // MEDICAL LOCKS (KHÓA HUẤN LUYỆN - TASK P2-04)
  // ---------------------------------------------------------------------------

  /**
   * Đặt Khóa huấn luyện. Mọi lệnh ghi (khóa, trạng thái ngựa, giáo án, buổi tập, nhật ký) nằm trong
   * MỘT transaction: lỗi giữa chừng thì không ghi gì. Dòng Horse bị khóa (FOR UPDATE) trước khi kiểm
   * "đã có khóa chưa", nên 2 bác sĩ bấm cùng lúc thì người sau phải chờ và thấy khóa của người trước.
   */
  async createMedicalLock(actor: CurrentUserPayload, dto: CreateMedicalLockDto) {
    this.assertVet(actor, 'place a training lock');

    const appliedStatus = dto.appliedMedicalStatus || dto.medicalStatus || HorseStatus.INJURED;

    const now = new Date();
    let recheckDate: Date;
    const inputDate = dto.recheckDate || dto.reviewDate;
    if (inputDate) {
      recheckDate = new Date(inputDate);
    } else {
      const restDays = dto.expectedRestDays || 7;
      recheckDate = new Date(now.getTime() + restDays * 24 * 60 * 60 * 1000);
    }

    if (recheckDate <= now) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'REVIEW_DATE_TOO_EARLY',
        'The review date must be tomorrow or later.',
      );
    }

    const maxRecheck = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
    if (recheckDate > maxRecheck) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'REVIEW_DATE_TOO_LATE',
        'The review date must be within 180 days from today.',
      );
    }

    const restDaysCalculated = Math.ceil(
      (recheckDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );

    const { lock, horse } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Horse" WHERE "id" = ${dto.horseId} FOR UPDATE`;
      const horse = await tx.horse.findUnique({ where: { id: dto.horseId, deletedAt: null } });
      if (!horse) throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse not found.');

      const existingLock = await tx.medicalLock.findFirst({
        where: { horseId: dto.horseId, isLocked: true },
      });
      if (existingLock) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'LOCK_ALREADY_ACTIVE',
          'This horse already has an active Training Lock.',
        );
      }

      const lockCount = await tx.medicalLock.count();
      let lockCode = `KH-${String(lockCount + 1).padStart(6, '0')}`;
      let attempts = 0;
      while (attempts < 5) {
        const existing = await tx.medicalLock.findUnique({ where: { lockCode } });
        if (!existing) break;
        attempts++;
        const randomPart = Math.floor(100000 + Math.random() * 900000);
        lockCode = `KH-${randomPart}`;
      }

      const lock = await tx.medicalLock.create({
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

      await tx.horse.update({
        where: { id: dto.horseId },
        data: { isMedicalLocked: true, status: appliedStatus },
      });

      // RULE-MED-01 (Flow 2 §4.2, Q-2.01, Bug #54): giáo án giữ nguyên; chỉ buổi tập NẶNG đã lên lịch
      // sau thời điểm đặt khóa chuyển sang Bị chặn. Các buổi đã tập trước đó giữ nguyên để ghi kết quả.
      await tx.workoutSession.updateMany({
        where: {
          horseId: dto.horseId,
          status: WorkoutStatus.SCHEDULED,
          scheduledDate: { gte: new Date() },
          ...HEAVY_WORKOUT_WHERE,
        },
        data: {
          status: WorkoutStatus.BLOCKED,
          statusReason: `Khóa huấn luyện thú y ${lockCode}: ${dto.lockReason}`,
        },
      });

      await this.audit.record(
        { id: actor.userId, name: actor.fullName },
        'CREATE_MEDICAL_LOCK',
        `Medical lock ${lockCode} created for horse ${dto.horseId}`,
        lock.id,
        { entityName: 'MedicalLock' },
        tx,
      );
      // Ghi thêm vào nhật ký của ngựa để Tab Lịch sử trạng thái (Flow 1) có lần đổi này (CL-1.08).
      await this.audit.record(
        { id: actor.userId, name: actor.fullName },
        'HORSE_STATUS_CHANGED',
        `Changed status of horse ${horse.name} from ${horse.status} to ${appliedStatus} (training lock ${lockCode})`,
        horse.id,
        {
          entityName: 'Horse',
          newValues: {
            oldStatus: horse.status,
            newStatus: appliedStatus,
            reason: dto.lockReason,
            source: 'MEDICAL_LOCK',
            lockCode,
          },
        },
        tx,
      );

      return { lock, horse };
    });

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

    await this.notifyLockAudience(
      horse.id,
      {
        type: 'LOCK_PLACED',
        category: 'LOCK',
        title: 'Training Lock placed',
        message: `${horse.name} is under a Training Lock. Heavy workouts are blocked. Reason: ${dto.lockReason}`,
        params: { horse: horse.name, reason: dto.lockReason },
        link: '/locks',
        senderName: actor.fullName,
      },
      actor.userId,
    );

    return {
      ...lock,
      impactAssessment,
      message: `Đã đặt Khóa huấn luyện cho ${horse.name}`,
    };
  }

  /** Gỡ khóa: cập nhật khóa + trạng thái ngựa + nhật ký trong một transaction (khóa dòng MedicalLock). */
  async releaseMedicalLock(lockId: string, actor: CurrentUserPayload, dto: ReleaseMedicalLockDto) {
    this.assertVet(actor, 'lift a training lock');

    const { lock, unlocked } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "MedicalLock" WHERE "id" = ${lockId} FOR UPDATE`;
      const lock = await tx.medicalLock.findUnique({
        where: { id: lockId },
        include: { horse: { include: { injuryLogs: { where: { stage: 'ACUTE' } } } } },
      });
      if (!lock || !lock.isLocked) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'LOCK_NOT_ACTIVE',
          'The Training Lock was not found or is already lifted.',
        );
      }

      const newHorseStatus = dto.newHorseStatus || lock.horse.status;

      const unlocked = await tx.medicalLock.update({
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

      await tx.horse.update({
        where: { id: lock.horseId },
        data: { isMedicalLocked: false, status: newHorseStatus },
      });

      await this.audit.record(
        { id: actor.userId, name: actor.fullName },
        'RELEASE_MEDICAL_LOCK',
        `Medical lock ${lock.lockCode || lockId} released for horse ${lock.horseId}`,
        lockId,
        { entityName: 'MedicalLock' },
        tx,
      );
      await this.audit.record(
        { id: actor.userId, name: actor.fullName },
        'HORSE_STATUS_CHANGED',
        `Changed status of horse ${lock.horse.name} from ${lock.horse.status} to ${newHorseStatus} (training lock lifted)`,
        lock.horseId,
        {
          entityName: 'Horse',
          newValues: {
            oldStatus: lock.horse.status,
            newStatus: newHorseStatus,
            reason: dto.unlockReason,
            source: 'MEDICAL_LOCK',
            lockCode: lock.lockCode,
          },
        },
        tx,
      );

      return { lock, unlocked };
    });

    await this.notifyLockAudience(
      lock.horseId,
      {
        type: 'LOCK_LIFTED',
        category: 'LOCK',
        title: 'Training Lock lifted',
        message: `${lock.horse.name} was released back to work. Blocked workouts can be restored.`,
        params: { horse: lock.horse.name },
        link: '/locks',
        senderName: actor.fullName,
      },
      actor.userId,
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

  /** Gia hạn: đọc - kiểm - ghi lịch sử gia hạn trong một transaction (khóa dòng MedicalLock). */
  async extendMedicalLock(lockId: string, actor: CurrentUserPayload, dto: ExtendMedicalLockDto) {
    this.assertVet(actor, 'extend a training lock');

    const extended = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "MedicalLock" WHERE "id" = ${lockId} FOR UPDATE`;
      const lock = await tx.medicalLock.findUnique({ where: { id: lockId } });
      if (!lock || !lock.isLocked) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'LOCK_NOT_ACTIVE',
          'No active Training Lock was found.',
        );
      }

      const now = new Date();
      let newRecheckDate: Date;

      const targetDate = dto.recheckDate || dto.newReviewDate;
      if (targetDate) {
        newRecheckDate = new Date(targetDate);
      } else if (dto.additionalDays) {
        const baseDate = lock.recheckDate && lock.recheckDate > now ? lock.recheckDate : now;
        newRecheckDate = new Date(baseDate.getTime() + dto.additionalDays * 24 * 60 * 60 * 1000);
      } else {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'VALIDATION',
          'Choose a new review date or the number of extra days.',
        );
      }

      if (newRecheckDate <= now) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'REVIEW_DATE_TOO_EARLY',
          'The new review date must be after today.',
        );
      }

      if (lock.recheckDate && newRecheckDate <= lock.recheckDate) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'REVIEW_DATE_NOT_LATER',
          `The new review date must be after the current one (${lock.recheckDate.toISOString().slice(0, 10)}).`,
        );
      }

      const maxRecheck = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
      if (newRecheckDate > maxRecheck) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'REVIEW_DATE_TOO_LATE',
          'The new review date must be within 180 days from today.',
        );
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

      history.push({
        id: `ext-${Date.now()}`,
        oldRecheckDate: lock.recheckDate ? lock.recheckDate.toISOString() : null,
        newRecheckDate: newRecheckDate.toISOString(),
        reason: extensionReason,
        updatedByUserId: actor.userId,
        updatedByName: actor.fullName,
        createdAt: now.toISOString(),
      });

      const newRestDays = Math.ceil(
        (newRecheckDate.getTime() - new Date(lock.lockedAt).getTime()) / (24 * 60 * 60 * 1000),
      );

      const extended = await tx.medicalLock.update({
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
        { entityName: 'MedicalLock' },
        tx,
      );

      return {
        ...extended,
        message: `Đã gia hạn ngày xem xét lại đến ${newRecheckDate.toLocaleDateString()}`,
      };
    });

    const until = extended.recheckDate ? extended.recheckDate.toISOString().slice(0, 10) : '';
    await this.notifications.notifyHorse(
      extended.horseId,
      { roles: [Role.HEAD_TRAINER], owner: true },
      {
        type: 'LOCK_EXTENDED',
        category: 'LOCK',
        title: 'Training Lock extended',
        message: `The Training Lock of ${extended.horse?.name ?? 'a horse'} now runs until ${until}.`,
        params: { horse: extended.horse?.name ?? '', date: until },
        link: '/locks',
        senderName: actor.fullName,
      },
      actor.userId,
    );
    return extended;
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
      throw apiError(HttpStatus.NOT_FOUND, 'LOCK_NOT_FOUND', 'Training Lock not found.');
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
      where: { id: horseId, deletedAt: null },
      include: {
        medicalLocks: { where: { isLocked: true } },
        stallAllocations: {
          where: { isActive: true },
          include: { stall: true },
        },
      },
    });

    if (!horse) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse not found.');
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
        status: (r as any).status || 'OPEN',
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
      observations: (
        await this.prisma.dailyGroomingLog.findMany({
          where: { horseId, healthObservations: { not: null } },
          orderBy: { shiftDate: 'desc' },
          take: 20,
          include: { groom: { select: { id: true, fullName: true } } },
        })
      ).map((g) => ({
        id: g.id,
        horseId: g.horseId,
        shift: g.shiftType,
        observedAt: g.shiftDate.toISOString(),
        groomId: g.groomUserId,
        groomName: g.groom?.fullName || 'Groom',
        urgency: 'NORMAL',
        content: g.healthObservations || '',
      })),
    };
  }

  async getHorseObservations(horseId: string, currentUser: CurrentUserPayload, _urgency?: string) {
    await this.checkHorseAccess(horseId, currentUser);

    const logs = await this.prisma.dailyGroomingLog.findMany({
      where: {
        horseId,
        healthObservations: { not: null },
      },
      orderBy: { shiftDate: 'desc' },
      include: {
        groom: { select: { id: true, fullName: true } },
      },
    });

    const mapped = logs.map((g) => ({
      id: g.id,
      horseId: g.horseId,
      shift: g.shiftType,
      observedAt: g.shiftDate.toISOString(),
      groomId: g.groomUserId,
      groomName: g.groom?.fullName || 'Groom',
      urgency: 'NORMAL',
      content: g.healthObservations || '',
    }));

    return { observations: mapped };
  }

  /**
   * SC-3.01 Sơ đồ sức khỏe đàn ngựa (P1-14): 4 nhóm màu theo trạng thái ngựa, không gồm ngựa Ngừng
   * quản lý. Mỗi ngựa kèm đủ dữ liệu cho thẻ, sơ đồ theo chuồng và panel chi tiết. Thẻ đếm tính trên
   * toàn đàn, danh sách trả về đã áp bộ lọc.
   */
  async getHealthBoard(query: HealthBoardQueryDto, currentUser: CurrentUserPayload) {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    // C-03: OWNER chỉ thấy ngựa mình sở hữu, GROOM chỉ thấy ngựa mình đang chăm (giống getMedicalRecords).
    const scope: Prisma.HorseWhereInput =
      currentUser.role === Role.HORSE_OWNER
        ? { ownerId: currentUser.userId }
        : currentUser.role === Role.GROOM
          ? {
              stallAllocations: {
                some: { isActive: true, assignedGroomUserId: currentUser.userId },
              },
            }
          : {};
    const horses = await this.prisma.horse.findMany({
      where: { deletedAt: null, status: { not: HorseStatus.RETIRED }, ...scope },
      orderBy: { name: 'asc' },
      include: {
        medicalLocks: {
          where: { isLocked: true },
          take: 1,
          include: { veterinarian: { select: { fullName: true } } },
        },
        stallAllocations: { where: { isActive: true }, include: { stall: true } },
        injuryLogs: {
          where: { stage: { not: 'HEALED' }, status: { not: 'RESOLVED' } },
          select: { id: true, anatomicalZone: true, stage: true },
        },
        medicalRecords: {
          orderBy: { examinationDate: 'desc' },
          take: 1,
          select: { id: true, examinationDate: true, clinicalDiagnosis: true },
        },
        preventiveSchedules: {
          where: { dueDate: { lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) } },
          orderBy: { dueDate: 'asc' },
          include: { typeCatalog: { select: { name: true } } },
        },
        dailyGroomingLogs: {
          where: { healthObservations: { not: null }, createdAt: { gte: dayAgo } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { groom: { select: { fullName: true } } },
        },
      },
    });

    const GROUP: Partial<Record<HorseStatus, string>> = {
      [HorseStatus.UNDER_OBSERVATION]: 'OBSERVATION',
      [HorseStatus.INJURED]: 'INJURED',
      [HorseStatus.ISOLATED]: 'ISOLATED',
    };
    const mapped = horses.map((horse) => {
      const lock = horse.medicalLocks[0];
      const alloc = horse.stallAllocations[0];
      const preventiveDue = horse.preventiveSchedules.map((p) => ({
        name: p.typeCatalog?.name || p.scheduleType,
        dueDate: p.dueDate,
        overdue: p.dueDate < now,
      }));
      const observation = horse.dailyGroomingLogs[0];
      return {
        id: horse.id,
        name: horse.name,
        horseCode: horse.horseCode,
        microchipRfid: horse.microchipRfid,
        status: horse.status,
        healthGroup: GROUP[horse.status] ?? 'QUALIFIED',
        isMedicalLocked: horse.isMedicalLocked || !!lock,
        lock: lock
          ? {
              lockCode: lock.lockCode,
              lockedAt: lock.lockedAt,
              recheckDate: lock.recheckDate,
              veterinarianName: lock.veterinarian?.fullName ?? null,
            }
          : null,
        stallId: alloc?.stall.id ?? null,
        stallCode: alloc?.stall.code ?? null,
        zone: alloc?.stall.zone ?? null,
        zoneId: alloc?.stall.zoneId ?? null,
        row: alloc?.stall.row ?? null,
        col: alloc?.stall.col ?? null,
        openInjuries: horse.injuryLogs.map((i) => ({ zone: i.anatomicalZone, stage: i.stage })),
        latestRecord: horse.medicalRecords[0]
          ? {
              id: horse.medicalRecords[0].id,
              examinationDate: horse.medicalRecords[0].examinationDate,
              diagnosis: horse.medicalRecords[0].clinicalDiagnosis,
            }
          : null,
        preventiveDue,
        hasOverduePreventive: preventiveDue.some((p) => p.overdue),
        latestObservation: observation
          ? {
              text: observation.healthObservations,
              at: observation.createdAt,
              groomName: observation.groom?.fullName ?? null,
            }
          : null,
      };
    });

    const count = (fn: (h: (typeof mapped)[number]) => boolean) => mapped.filter(fn).length;
    const groups = query.healthGroup
      ? query.healthGroup
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean)
      : [];
    const term = query.search?.trim().toLowerCase();
    const data = mapped.filter(
      (h) =>
        (groups.length === 0 || groups.includes(h.healthGroup)) &&
        (query.isLocked !== 'true' || h.isMedicalLocked) &&
        (query.isLocked !== 'false' || !h.isMedicalLocked) &&
        (!query.zone || h.zone === query.zone) &&
        (query.overdue !== 'true' || h.hasOverduePreventive) &&
        (!term ||
          h.name.toLowerCase().includes(term) ||
          (h.horseCode ?? '').toLowerCase().includes(term) ||
          h.microchipRfid.toLowerCase().includes(term)),
    );

    return {
      summary: {
        qualifiedCount: count((h) => h.healthGroup === 'QUALIFIED'),
        observationCount: count((h) => h.healthGroup === 'OBSERVATION'),
        injuredCount: count((h) => h.healthGroup === 'INJURED'),
        isolatedCount: count((h) => h.healthGroup === 'ISOLATED'),
        lockedCount: count((h) => h.isMedicalLocked),
        overdueCount: count((h) => h.hasOverduePreventive),
        total: mapped.length,
      },
      data,
      generatedAt: now,
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
    this.assertVet(actor, 'create preventive care types');

    const codeUpper = dto.code.toUpperCase();
    const existingCode = await this.prisma.preventiveTypeCatalog.findUnique({
      where: { code: codeUpper },
    });
    if (existingCode) {
      throw apiError(HttpStatus.BAD_REQUEST, 'DUPLICATE_CODE', 'This type code already exists.');
    }

    const existingName = await this.prisma.preventiveTypeCatalog.findUnique({
      where: { name: dto.name },
    });
    if (existingName) {
      throw apiError(HttpStatus.BAD_REQUEST, 'DUPLICATE_NAME', 'This type name already exists.');
    }

    const noticeDays = dto.advanceNoticeDays || 7;
    if (noticeDays >= dto.intervalDays) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_NOTICE_DAYS',
        'The reminder days must be shorter than the repeat interval.',
      );
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
        where: { status: { not: HorseStatus.RETIRED }, deletedAt: null },
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
      { entityName: 'PreventiveTypeCatalog' },
    );

    return catalog;
  }

  async updatePreventiveCatalog(
    id: string,
    actor: CurrentUserPayload,
    dto: UpdatePreventiveTypeCatalogDto,
  ) {
    this.assertVet(actor, 'edit preventive care types');

    const catalog = await this.prisma.preventiveTypeCatalog.findUnique({ where: { id } });
    if (!catalog)
      throw apiError(
        HttpStatus.NOT_FOUND,
        'PREVENTIVE_TYPE_NOT_FOUND',
        'Preventive care type not found.',
      );

    if (dto.name && dto.name !== catalog.name) {
      const existingName = await this.prisma.preventiveTypeCatalog.findUnique({
        where: { name: dto.name },
      });
      if (existingName)
        throw apiError(HttpStatus.BAD_REQUEST, 'DUPLICATE_NAME', 'This type name already exists.');
    }

    const newInterval = dto.intervalDays || catalog.intervalDays;
    const newNotice = dto.advanceNoticeDays || catalog.advanceNoticeDays;
    if (newNotice >= newInterval) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_NOTICE_DAYS',
        'The reminder days must be shorter than the repeat interval.',
      );
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
      { entityName: 'PreventiveTypeCatalog' },
    );

    return updated;
  }

  async togglePreventiveCatalogStatus(id: string, actor: CurrentUserPayload) {
    this.assertVet(actor, 'change preventive care type status');

    const catalog = await this.prisma.preventiveTypeCatalog.findUnique({ where: { id } });
    if (!catalog)
      throw apiError(
        HttpStatus.NOT_FOUND,
        'PREVENTIVE_TYPE_NOT_FOUND',
        'Preventive care type not found.',
      );

    const updated = await this.prisma.preventiveTypeCatalog.update({
      where: { id },
      data: { isActive: !catalog.isActive },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'TOGGLE_PREVENTIVE_CATALOG_STATUS',
      `Preventive catalog ${catalog.code} active status changed to ${updated.isActive}`,
      id,
      { entityName: 'PreventiveTypeCatalog' },
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

    const now = new Date();
    if (status) {
      if (status === 'OVERDUE') {
        where.dueDate = { lt: now };
        where.status = { not: PreventiveStatus.COMPLETED };
      } else if (status === 'UPCOMING' || status === 'UPCOMING_7') {
        where.dueDate = {
          gte: now,
          lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        };
        where.status = { not: PreventiveStatus.COMPLETED };
      } else if (status === 'COMPLETED') {
        where.status = PreventiveStatus.COMPLETED;
      }
    }

    const baseWhere = { ...where };
    delete baseWhere.dueDate;
    delete baseWhere.status;

    const [total, overdueCount, upcoming7DaysCount, upcoming30DaysCount, schedules] =
      await Promise.all([
        this.prisma.preventiveSchedule.count({ where }),
        this.prisma.preventiveSchedule.count({
          where: {
            ...baseWhere,
            dueDate: { lt: now },
            status: { not: PreventiveStatus.COMPLETED },
          },
        }),
        this.prisma.preventiveSchedule.count({
          where: {
            ...baseWhere,
            dueDate: {
              gte: now,
              lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            },
            status: { not: PreventiveStatus.COMPLETED },
          },
        }),
        this.prisma.preventiveSchedule.count({
          where: {
            ...baseWhere,
            dueDate: {
              gte: now,
              lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            },
            status: { not: PreventiveStatus.COMPLETED },
          },
        }),
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

    const mapped = schedules.map((sch) => {
      const noticeDays = sch.typeCatalog?.advanceNoticeDays || 7;
      const dueDate = new Date(sch.dueDate);

      const isOverdue = dueDate < now && sch.status !== PreventiveStatus.COMPLETED;
      const isNotice =
        !isOverdue &&
        dueDate <= new Date(now.getTime() + noticeDays * 24 * 60 * 60 * 1000) &&
        sch.status !== PreventiveStatus.COMPLETED;

      let statusBadge = 'NORMAL';
      if (sch.status === PreventiveStatus.COMPLETED) {
        statusBadge = 'COMPLETED';
      } else if (isOverdue) {
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

    return {
      counts: {
        overdue: overdueCount,
        upcoming7Days: upcoming7DaysCount,
        upcoming30Days: upcoming30DaysCount,
        total,
      },
      data: mapped,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(total / take),
    };
  }

  async recordPreventiveCare(actor: CurrentUserPayload, dto: RecordPreventiveCareDto) {
    this.assertVet(actor, 'record preventive care');

    const catalog = await this.prisma.preventiveTypeCatalog.findUnique({
      where: { id: dto.typeCatalogId },
    });
    if (!catalog) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'PREVENTIVE_TYPE_NOT_FOUND',
        'Preventive care type not found.',
      );
    }

    const horseIds =
      dto.horseIds && dto.horseIds.length > 0 ? dto.horseIds : dto.horseId ? [dto.horseId] : [];

    if (horseIds.length === 0) {
      throw apiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Choose at least one horse.');
    }

    if (
      dto.performedByMode === 'EXTERNAL' &&
      (!dto.performedByName || dto.performedByName.trim().length === 0)
    ) {
      throw apiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Enter who performed the care.');
    }

    if (
      (catalog.category === PreventiveType.VACCINATION ||
        catalog.category === PreventiveType.DEWORMING) &&
      !dto.productAdministered
    ) {
      throw apiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Enter the product or vaccine used.');
    }

    const now = new Date();
    const performedDate = dto.performedDate ? new Date(dto.performedDate) : now;
    if (performedDate > now) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'DATE_IN_FUTURE',
        'The date performed cannot be in the future.',
      );
    }

    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    if (performedDate < ninetyDaysAgo) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'DATE_TOO_OLD',
        'The date performed cannot be more than 90 days ago.',
      );
    }

    let nextDueDate: Date;
    if (dto.customNextDueDate) {
      nextDueDate = new Date(dto.customNextDueDate);
      if (nextDueDate <= performedDate) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'INVALID_DATE_RANGE',
          'The next due date must be after the date performed.',
        );
      }
    } else {
      nextDueDate = new Date(performedDate.getTime() + catalog.intervalDays * 24 * 60 * 60 * 1000);
    }

    const performedByName =
      dto.performedByMode === 'EXTERNAL' ? dto.performedByName! : actor.fullName;

    const runTx =
      typeof this.prisma.$transaction === 'function'
        ? (cb: any) => this.prisma.$transaction(cb)
        : (cb: any) => cb(this.prisma);

    await runTx(async (tx: any) => {
      for (const horseId of horseIds) {
        const horse = await tx.horse.findUnique({ where: { id: horseId, deletedAt: null } });
        if (!horse) continue;

        const schedule = await tx.preventiveSchedule.findFirst({
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
            /* ignore invalid JSON */
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
          await tx.preventiveSchedule.update({
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
          await tx.preventiveSchedule.create({
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
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'RECORD_PREVENTIVE_CARE',
      `Recorded ${catalog.name} for ${horseIds.length} horse(s)`,
      catalog.id,
      { entityName: 'PreventiveTypeCatalog' },
    );

    return {
      message: `Đã ghi nhận ${catalog.name} cho ${horseIds.length} chiến mã thành công`,
      count: horseIds.length,
      nextDueDate: nextDueDate.toLocaleDateString(),
    };
  }

  async setupHorsePreventive(actor: CurrentUserPayload, dto: SetupHorsePreventiveDto) {
    this.assertVet(actor, 'set up preventive schedules');

    const horse = await this.prisma.horse.findUnique({
      where: { id: dto.horseId, deletedAt: null },
    });
    if (!horse) throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', 'Horse not found.');

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
      { entityName: 'Horse' },
    );

    return { message: 'Đã thiết lập lịch chăm sóc định kỳ cho chiến mã thành công' };
  }
}
