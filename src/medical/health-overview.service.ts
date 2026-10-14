import { HttpStatus, Injectable } from '@nestjs/common';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Role, HorseStatus, Prisma } from '@prisma/client';
import { HealthBoardQueryDto } from './dto/health-board-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MedicalAccessService } from './medical-access.service';

/** SC-3.01, SC-3.02: sơ đồ sức khỏe đàn, hồ sơ y tế 6 tab, ghi chú quan sát (FR-3.01, FR-3.02, FR-3.17). */
@Injectable()
export class HealthOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: MedicalAccessService,
  ) {}

  async getHorseMedicalProfile(horseId: string, currentUser: CurrentUserPayload) {
    await this.access.checkHorseAccess(horseId, currentUser);

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
    await this.access.checkHorseAccess(horseId, currentUser);

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
}
