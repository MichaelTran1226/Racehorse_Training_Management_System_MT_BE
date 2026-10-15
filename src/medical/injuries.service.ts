import { HttpStatus, Injectable } from '@nestjs/common';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HorseStatus, BodySide, SeverityLevel, InjuryStatus } from '@prisma/client';
import { CreateInjuryDto } from './dto/create-injury.dto';
import { UpdateInjuryDto } from './dto/update-injury.dto';
import { UpdateRecoveryProgressDto } from './dto/update-recovery-progress.dto';
import { InjuryQueryDto } from './dto/injury-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MedicalAccessService } from './medical-access.service';

/** P2-03: điểm chấn thương trên mô hình 2D và tiến trình hồi phục (FR-3.08, FR-3.09). */
@Injectable()
export class InjuriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: MedicalAccessService,
  ) {}

  async getHorseInjuries(horseId: string, currentUser: CurrentUserPayload, query: InjuryQueryDto) {
    await this.access.checkHorseAccess(horseId, currentUser);

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
    this.access.assertVet(actor, 'log injuries');

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
        layer: dto.layer === 'SKELETON' ? 'BONE' : (dto.layer || 'MUSCLE'),
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

    await this.access.checkHorseAccess(injury.horseId, currentUser);

    return injury;
  }

  async updateInjury(id: string, actor: CurrentUserPayload, dto: UpdateInjuryDto) {
    this.access.assertVet(actor, 'edit injury points');

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
    this.access.assertVet(actor, 'delete injury points');

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
    this.access.assertVet(actor, 'update recovery progress');

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
}
