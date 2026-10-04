import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Role, HorseStatus, BodySide, SeverityLevel, InjuryStatus } from '@prisma/client';
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
import { CreateInjuryDto } from './dto/create-injury.dto';
import { UpdateInjuryDto } from './dto/update-injury.dto';
import { UpdateRecoveryProgressDto } from './dto/update-recovery-progress.dto';
import { InjuryQueryDto } from './dto/injury-query.dto';
import {
  CreateMedicalLockDto,
  ExtendMedicalLockDto,
  ReleaseMedicalLockDto,
} from './dto/medical-lock.dto';
import { HealthBoardQueryDto } from './dto/health-board-query.dto';

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

    const phaseNote = `[PHÁC ĐỒ - ${dto.phaseName}]: Tu: ${dto.startDate} Den: ${dto.endDate} | Muc tieu: ${dto.target || 'N/A'} | Van dong: ${dto.allowedActivityLevel}`;
    const updatedProtocol = record.treatmentProtocol
      ? `${record.treatmentProtocol}\n${phaseNote}`
      : phaseNote;

    const updated = await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: { treatmentProtocol: updatedProtocol },
    });

    return { message: 'Đã thêm giai đoạn phác đồ thành công', record: updated };
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

    const newPrescription = {
      id: `rx-${Date.now()}`,
      medicationName: dto.medicationName,
      dosage: dto.dosage,
      administrationRoute: dto.administrationRoute,
      frequency: dto.frequency,
      startDate: dto.startDate,
      endDate: dto.endDate,
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

    const visitDate = dto.visitDate ? new Date(dto.visitDate) : new Date();

    const updated = await this.prisma.medicalRecord.update({
      where: { id: recordId },
      data: {
        requiresFollowUp: true,
        followUpDate: visitDate,
        treatmentProtocol: `${record.treatmentProtocol}\n[TÁI KHÁM ${visitDate.toLocaleDateString()}]: ${dto.progressNotes}`,
      },
    });

    return { message: 'Ghi nhận tái khám thành công', record: updated };
  }

  // ---------------------------------------------------------------------------
  // MEDICAL LOCKS (KHÓA HUẤN LUYỆN)
  // ---------------------------------------------------------------------------

  async createMedicalLock(actor: CurrentUserPayload, dto: CreateMedicalLockDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền đặt Khóa huấn luyện');
    }

    const horse = await this.prisma.horse.findUnique({ where: { id: dto.horseId } });
    if (!horse) throw new NotFoundException('Không tìm thấy chiến mã');

    const existingLock = await this.prisma.medicalLock.findFirst({
      where: { horseId: dto.horseId, isLocked: true },
    });
    if (existingLock) {
      throw new BadRequestException('Chiến mã này đã có Khóa huấn luyện đang hiệu lực');
    }

    const lock = await this.prisma.medicalLock.create({
      data: {
        horseId: dto.horseId,
        veterinarianUserId: actor.userId,
        expectedRestDays: dto.expectedRestDays,
        lockReason: dto.lockReason,
        unlockConditions: dto.unlockConditions,
        isLocked: true,
      },
      include: {
        horse: true,
        veterinarian: true,
      },
    });

    // Update horse medical lock status & optional health status
    await this.prisma.horse.update({
      where: { id: dto.horseId },
      data: {
        isMedicalLocked: true,
        status: dto.medicalStatus || HorseStatus.INJURED,
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'CREATE_MEDICAL_LOCK',
      `Medical lock created for horse ${dto.horseId}`,
      lock.id,
    );

    return lock;
  }

  async releaseMedicalLock(lockId: string, actor: CurrentUserPayload, dto: ReleaseMedicalLockDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền gỡ Khóa huấn luyện');
    }

    const lock = await this.prisma.medicalLock.findUnique({ where: { id: lockId } });
    if (!lock || !lock.isLocked) {
      throw new BadRequestException('Không tìm thấy Khóa huấn luyện hoặc khóa đã được gỡ');
    }

    const unlocked = await this.prisma.medicalLock.update({
      where: { id: lockId },
      data: {
        isLocked: false,
        unlockedAt: new Date(),
        unlockVetUserId: actor.userId,
        recheckNotes: dto.unlockReason,
      },
    });

    await this.prisma.horse.update({
      where: { id: lock.horseId },
      data: {
        isMedicalLocked: false,
        status: dto.newHorseStatus || HorseStatus.RESTING,
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'RELEASE_MEDICAL_LOCK',
      `Medical lock ${lockId} released`,
      lockId,
    );

    return unlocked;
  }

  async extendMedicalLock(lockId: string, actor: CurrentUserPayload, dto: ExtendMedicalLockDto) {
    if (actor.role !== Role.VETERINARIAN && actor.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException('Chỉ Bác sĩ thú y mới có quyền gia hạn Khóa huấn luyện');
    }

    const lock = await this.prisma.medicalLock.findUnique({ where: { id: lockId } });
    if (!lock || !lock.isLocked) {
      throw new BadRequestException('Không tìm thấy Khóa huấn luyện đang hiệu lực');
    }

    const extended = await this.prisma.medicalLock.update({
      where: { id: lockId },
      data: {
        expectedRestDays: lock.expectedRestDays + dto.additionalDays,
        recheckNotes: dto.recheckNotes
          ? `${lock.recheckNotes || ''}\n[Gia hạn +${dto.additionalDays} ngày]: ${dto.recheckNotes}`
          : lock.recheckNotes,
      },
    });

    return extended;
  }

  async getMedicalLocks(query: { horseId?: string; isLocked?: boolean }) {
    const where: any = {};
    if (query.horseId) where.horseId = query.horseId;
    if (query.isLocked !== undefined) where.isLocked = query.isLocked;

    return this.prisma.medicalLock.findMany({
      where,
      orderBy: { lockedAt: 'desc' },
      include: {
        horse: { select: { id: true, name: true, microchipRfid: true } },
        veterinarian: { select: { id: true, fullName: true } },
        unlockVet: { select: { id: true, fullName: true } },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // HEALTH BOARD & OVERVIEW
  // ---------------------------------------------------------------------------

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
      counts: {
        qualified: qualifiedCount,
        observation: observationCount,
        injured: injuredCount,
        isolated: isolatedCount,
        locked: lockedCount,
        total: horses.length,
      },
      horses: filtered,
    };
  }
}
