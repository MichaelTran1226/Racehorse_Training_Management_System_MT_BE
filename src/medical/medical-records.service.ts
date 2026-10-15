import { HttpStatus, Injectable } from '@nestjs/common';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Role, HorseStatus, SeverityLevel } from '@prisma/client';
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
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MedicalAccessService } from './medical-access.service';
import { MedicalLocksService } from './medical-locks.service';

/** P2-02: bệnh án, phác đồ, đơn thuốc, tái khám (FR-3.03 → FR-3.07). */
@Injectable()
export class MedicalRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: MedicalAccessService,
    private readonly locks: MedicalLocksService,
  ) {}

  async createMedicalRecord(actor: CurrentUserPayload, dto: CreateMedicalRecordDto) {
    this.access.assertVet(actor, 'create medical records');

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
      await this.access.checkHorseAccess(horseId, currentUser);
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

    await this.access.checkHorseAccess(record.horseId, currentUser);

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
    this.access.assertVet(actor, 'edit medical records');

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
    this.access.assertVet(actor, 'delete medical records');

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
    this.access.assertVet(actor, 'finalize medical records');

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
        await this.locks.createMedicalLock(actor, {
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
    this.access.assertVet(actor, 'close medical records');

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
    this.access.assertVet(actor, 'reopen medical records');

    const effectiveReason = (dto.reason || dto.reopenReason || '').trim();
    if (!effectiveReason || effectiveReason.length < 10) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION',
        'Reason for reopening must be at least 10 characters.',
      );
    }

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
        treatmentProtocol: `${record.treatmentProtocol}\n[MỞ LẠI]: ${effectiveReason}`,
        status: 'OPEN',
        reopenedAt: now,
        reopenReason: effectiveReason,
      },
    });

    await this.audit.record(
      { id: actor.userId, name: actor.fullName },
      'REOPEN_MEDICAL_RECORD',
      `Medical record ${id} reopened with reason: ${effectiveReason}`,
      id,
      { entityName: 'MedicalRecord' },
    );

    return updated;
  }

  async addTreatmentPhase(
    recordId: string,
    actor: CurrentUserPayload,
    dto: CreateTreatmentPhaseDto,
  ) {
    this.access.assertVet(actor, 'add treatment phases');

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
    this.access.assertVet(actor, 'update treatment phases');

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

  async addPrescription(recordId: string, actor: CurrentUserPayload, dto: CreatePrescriptionDto) {
    this.access.assertVet(actor, 'prescribe medication');

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

    let effectiveEndDate = dto.endDate;
    if (!effectiveEndDate) {
      const s = new Date(dto.startDate || Date.now());
      const days = Number(dto.daysCount) > 0 ? Number(dto.daysCount) : 1;
      effectiveEndDate = new Date(s.getTime() + (days - 1) * 86400000).toISOString().split('T')[0];
    }
    const dosageStr = String(dto.dosage ?? '1');

    const newPrescription = {
      id: `rx-${Date.now()}`,
      medicationName: dto.medicationName,
      dosage: dosageStr,
      unit: dto.unit || '',
      route: adminRoute,
      administrationRoute: adminRoute,
      frequencyPerDay: dto.frequencyPerDay || dto.frequency,
      frequency: freq,
      startDate: dto.startDate,
      endDate: effectiveEndDate,
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
    this.access.assertVet(actor, 'edit prescriptions');

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
    this.access.assertVet(actor, 'stop medication');

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
    rx.stoppedReason = dto.stoppedReason || dto.reason || 'Bác sĩ yêu cầu dừng thuốc';
    rx.stopNotes = dto.stopNotes || '';
    rx.stoppedDate = dto.stoppedDate || new Date().toISOString().split('T')[0];
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

  async addFollowUp(recordId: string, actor: CurrentUserPayload, dto: CreateFollowUpDto) {
    this.access.assertVet(actor, 'record follow-up visits');

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
}
