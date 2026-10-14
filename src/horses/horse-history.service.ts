import { HttpStatus, Injectable } from '@nestjs/common';
import { PlanStatus } from '@prisma/client';
import { apiError } from '../common/exceptions/api-error';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { HorsesService } from './horses.service';

/** Thời gian (ms) cho phép bấm Hoàn tác sau khi xóa. FE hiện nút 10 giây; BE nới 60 giây cho mạng chậm. */

/** P1-13: lịch sử trạng thái, lịch sử ô chuồng, chủ sở hữu và dòng thời gian của ngựa (FR-1.17 → FR-1.19). */
@Injectable()
export class HorseHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly horses: HorsesService,
  ) {}

  /**
   * Lấy lịch sử toàn diện vòng đời của ngựa (FR-1.04, Flow 1).
   */
  async getHistory(id: string, user: CurrentUserPayload) {
    const horse = await this.prisma.horse.findUnique({
      where: { id, deletedAt: null },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        stallAllocations: {
          include: {
            stall: true,
            assignedGroom: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { startDate: 'desc' },
        },
        medicalRecords: {
          include: {
            veterinarian: { select: { id: true, fullName: true } },
          },
          orderBy: { examinationDate: 'desc' },
        },
        injuryLogs: {
          orderBy: { discoveryDate: 'desc' },
        },
        medicalLocks: {
          include: {
            veterinarian: { select: { id: true, fullName: true } },
            unlockVet: { select: { id: true, fullName: true } },
          },
          orderBy: { lockedAt: 'desc' },
        },
        trainingPlans: {
          include: {
            trainer: { select: { id: true, fullName: true } },
            workoutSessions: {
              orderBy: { scheduledDate: 'desc' },
            },
          },
          orderBy: { startDate: 'desc' },
        },
        tournamentRegistrations: {
          include: {
            tournament: true,
            result: true,
          },
          orderBy: { registrationDate: 'desc' },
        },
      },
    });

    if (!horse) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'HORSE_NOT_FOUND',
        'Không tìm thấy hồ sơ ngựa hoặc bạn không có quyền xem.',
      );
    }

    if (user.role === UserRole.HORSE_OWNER && horse.ownerId !== user.userId) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'HORSE_NOT_FOUND',
        'Không tìm thấy hồ sơ ngựa hoặc bạn không có quyền xem.',
      );
    }

    if (user.role === UserRole.GROOM) {
      const allocations = horse.stallAllocations || [];
      const isAssigned = allocations.some(
        (a) => a.assignedGroomUserId === user.userId && a.isActive,
      );
      if (!isAssigned) {
        throw apiError(
          HttpStatus.NOT_FOUND,
          'HORSE_NOT_FOUND',
          'Không tìm thấy hồ sơ ngựa hoặc bạn không có quyền xem.',
        );
      }
    }

    // Nhật ký của chính con ngựa (không giới hạn số dòng: lịch sử trạng thái và chủ sở hữu dựng từ đây).
    const auditLogs = await this.prisma.auditLog.findMany({
      where: { entityId: id },
      orderBy: { timestamp: 'desc' },
      include: { user: { select: { id: true, fullName: true, role: true } } },
    });

    // 1. Lịch sử trạng thái (Tab 4). Nguồn: Thủ công / Khóa huấn luyện (Flow 3 ghi kèm source) / Hệ thống.
    const statusHistory = auditLogs
      .filter((l) => l.action === 'HORSE_STATUS_CHANGED')
      .map((l) => {
        let details: any = {};
        try {
          details = l.newValuesJson ? JSON.parse(l.newValuesJson) : {};
        } catch {
          details = {};
        }
        return {
          id: l.id,
          timestamp: l.timestamp,
          changedBy: l.user?.fullName || 'System',
          changedByRole: l.user?.role ?? null,
          action: l.action,
          source: (details.source as string) || (l.user ? 'MANUAL' : 'SYSTEM'),
          notes: details.reason || null,
          oldStatus: details.oldStatus || null,
          newStatus: details.newStatus || null,
        };
      });

    // 2. Ownership History
    const ownershipHistory = auditLogs
      .filter((l) => l.action === 'HORSE_OWNERSHIP_TRANSFERRED')
      .map((l) => {
        let oldVal: any = {};
        let newVal: any = {};
        try {
          oldVal = l.oldValuesJson ? JSON.parse(l.oldValuesJson) : {};
          newVal = l.newValuesJson ? JSON.parse(l.newValuesJson) : {};
        } catch {
          // ignore
        }
        return {
          id: l.id,
          timestamp: l.timestamp,
          previousOwner: oldVal.ownerName || 'None',
          newOwner: newVal.ownerName || 'Unknown',
          reason: newVal.reason || 'None specified',
          transferredBy: l.user?.fullName || 'Club Manager',
        };
      });

    // 3. Stall History
    const stallHistory =
      user.role === UserRole.HORSE_OWNER
        ? []
        : horse.stallAllocations.map((a) => ({
            id: a.id,
            stallCode: a.stall.code,
            zone: a.stall.zone,
            groomName: a.assignedGroom?.fullName || 'Unassigned',
            startDate: a.startDate,
            endDate: a.endDate,
            isActive: a.isActive,
          }));

    // 4. Medical History
    const medicalHistory = {
      records: horse.medicalRecords.map((r) => ({
        id: r.id,
        examinationDate: r.examinationDate,
        veterinarianName: r.veterinarian?.fullName || 'Dr. Veterinarian',
        symptoms: r.symptoms,
        clinicalDiagnosis: r.clinicalDiagnosis,
        treatmentProtocol: r.treatmentProtocol,
      })),
      injuries: horse.injuryLogs.map((inj) => ({
        id: inj.id,
        discoveryDate: inj.discoveryDate,
        anatomicalZone: inj.anatomicalZone,
        layer: inj.layer,
        viewSide: inj.viewSide,
        injuryType: inj.injuryType,
        severity: inj.severity,
        stage: inj.stage,
        status: inj.status,
      })),
      locks: horse.medicalLocks.map((l) => ({
        id: l.id,
        lockCode: l.lockCode,
        lockedAt: l.lockedAt,
        lockReason: l.lockReason,
        veterinarianName: l.veterinarian?.fullName,
        isLocked: l.isLocked,
        unlockedAt: l.unlockedAt,
        unlockReason: l.unlockReason,
        unlockVetName: l.unlockVet?.fullName,
      })),
    };

    // 5. Training History
    const trainingHistory = horse.trainingPlans.map((p) => ({
      id: p.id,
      phaseName: p.phaseName,
      targetSpeed: p.targetSpeed,
      targetDistance: p.targetDistance,
      trackSurface: p.trackSurface,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      trainerName: p.trainer?.fullName,
      totalWorkouts: p.workoutSessions.length,
      completedWorkouts: p.workoutSessions.filter((w) => w.status === 'COMPLETED').length,
    }));

    // 6. Dòng thời gian (Tab 6): mỗi mục thuộc 1 nhóm để FE lọc; mục của Flow 2/3 có link sang màn chi tiết.
    type TimelineCategory =
      | 'IDENTITY'
      | 'STATUS'
      | 'STALL'
      | 'CARE'
      | 'OWNERSHIP'
      | 'MEDICAL'
      | 'TRAINING'
      | 'TOURNAMENT';
    const timeline: Array<{
      id: string;
      category: TimelineCategory;
      title: string;
      description: string;
      timestamp: Date | string;
      actor?: string | null;
      link?: string | null;
      badgeTone?: string;
    }> = [];

    timeline.push({
      id: `created-${horse.id}`,
      category: 'IDENTITY',
      title: 'Horse profile created',
      description: `Registered as ${horse.name} (${horse.horseCode || horse.id}), breed ${horse.breed}.`,
      timestamp: horse.createdAt,
      actor: auditLogs.find((l) => l.action === 'HORSE_CREATED')?.user?.fullName ?? null,
      badgeTone: 'info',
    });

    const IDENTITY_ACTIONS: Record<string, string> = {
      HORSE_UPDATED: 'Identity details updated',
      HORSE_RESTORED: 'Profile restored from Deleted horses',
    };
    auditLogs
      .filter((l) => IDENTITY_ACTIONS[l.action])
      .forEach((l) =>
        timeline.push({
          id: `audit-${l.id}`,
          category: 'IDENTITY',
          title: IDENTITY_ACTIONS[l.action],
          description:
            l.action === 'HORSE_UPDATED'
              ? 'Identification record edited.'
              : 'Profile is active again.',
          timestamp: l.timestamp,
          actor: l.user?.fullName ?? null,
          badgeTone: 'info',
        }),
      );

    const SOURCE_LABEL: Record<string, string> = {
      MANUAL: 'Manual change',
      MEDICAL_LOCK: 'Training Lock',
      SYSTEM: 'System',
      TRAINING_PLAN: 'Training plan activation',
    };
    statusHistory.forEach((st) =>
      timeline.push({
        id: `st-${st.id}`,
        category: 'STATUS',
        title: `Status changed${st.oldStatus ? ` from ${st.oldStatus}` : ''} to ${st.newStatus || 'unknown'}`,
        description: `${SOURCE_LABEL[st.source] ?? st.source}${st.notes ? `. Reason: ${st.notes}` : ''}.`,
        timestamp: st.timestamp,
        actor: st.changedBy,
        badgeTone: 'neutral',
      }),
    );

    if (user.role !== UserRole.HORSE_OWNER) {
      horse.stallAllocations.forEach((a) => {
        timeline.push({
          id: `stall-in-${a.id}`,
          category: 'STALL',
          title: `Moved into stall ${a.stall.code}`,
          description: `Zone ${a.stall.zone}${a.assignedGroom ? `. Groom: ${a.assignedGroom.fullName}` : ''}.`,
          timestamp: a.startDate,
          badgeTone: 'info',
        });
        if (a.endDate) {
          timeline.push({
            id: `stall-out-${a.id}`,
            category: 'STALL',
            title: `Left stall ${a.stall.code}`,
            description: `Zone ${a.stall.zone}.`,
            timestamp: a.endDate,
            badgeTone: 'neutral',
          });
        }
      });
    }

    // Tab Chủ sở hữu ẩn với VET, GROOM (CL-1.07) nên dòng thời gian cũng ẩn nhóm này.
    if (user.role !== UserRole.VETERINARIAN && user.role !== UserRole.GROOM) {
      ownershipHistory.forEach((o) =>
        timeline.push({
          id: `own-${o.id}`,
          category: 'OWNERSHIP',
          title: `Ownership transferred to ${o.newOwner}`,
          description: `Previous owner: ${o.previousOwner}. Reason: ${o.reason}.`,
          timestamp: o.timestamp,
          actor: o.transferredBy,
          badgeTone: 'info',
        }),
      );
    }

    horse.medicalLocks.forEach((l) => {
      timeline.push({
        id: `lock-${l.id}`,
        category: 'MEDICAL',
        title: `Training Lock placed (${l.lockCode || 'LOCK'})`,
        description: `Reason: ${l.lockReason}.`,
        timestamp: l.lockedAt,
        actor: l.veterinarian?.fullName ?? null,
        link: '/medical/locks',
        badgeTone: 'danger',
      });
      if (!l.isLocked && l.unlockedAt) {
        timeline.push({
          id: `unlock-${l.id}`,
          category: 'MEDICAL',
          title: `Training Lock lifted (${l.lockCode || 'LOCK'})`,
          description: `Reason: ${l.unlockReason || '—'}.`,
          timestamp: l.unlockedAt,
          actor: l.unlockVet?.fullName ?? null,
          link: '/medical/locks',
          badgeTone: 'ok',
        });
      }
    });
    horse.medicalRecords.forEach((r) =>
      timeline.push({
        id: `med-${r.id}`,
        category: 'MEDICAL',
        title: `Medical examination: ${r.clinicalDiagnosis}`,
        description: `Symptoms: ${r.symptoms}.`,
        timestamp: r.examinationDate,
        actor: r.veterinarian?.fullName ?? null,
        link: `/medical/records/${r.id}`,
        badgeTone: 'warn',
      }),
    );
    horse.injuryLogs.forEach((inj) =>
      timeline.push({
        id: `inj-${inj.id}`,
        category: 'MEDICAL',
        title: `Injury recorded: ${inj.anatomicalZone}`,
        description: `${inj.injuryType}, stage ${inj.stage}.`,
        timestamp: inj.discoveryDate,
        link: `/medical/horses/${horse.id}/injuries`,
        badgeTone: 'warn',
      }),
    );

    horse.trainingPlans.forEach((p) => {
      timeline.push({
        id: `plan-${p.id}`,
        category: 'TRAINING',
        title: `Training plan created: ${p.phaseName}`,
        description: `Trainer: ${p.trainer?.fullName || '—'}.`,
        timestamp: p.createdAt,
        actor: p.trainer?.fullName ?? null,
        link: `/training/plans/${p.id}`,
        badgeTone: 'ok',
      });
      if (p.status === PlanStatus.COMPLETED || p.status === PlanStatus.CANCELLED) {
        timeline.push({
          id: `plan-end-${p.id}`,
          category: 'TRAINING',
          title: `Training plan ${p.status === PlanStatus.COMPLETED ? 'completed' : 'cancelled'}: ${p.phaseName}`,
          description:
            (p.status === PlanStatus.COMPLETED ? p.completionSummary : p.cancelReason) || '—',
          timestamp: p.updatedAt,
          link: `/training/plans/${p.id}`,
          badgeTone: 'neutral',
        });
      }
    });

    horse.tournamentRegistrations.forEach((r) =>
      timeline.push({
        id: `race-${r.id}`,
        category: 'TOURNAMENT',
        title: `Race registration: ${r.tournament?.name ?? 'Tournament'}`,
        description: `Registration status: ${r.status}.`,
        timestamp: r.registrationDate,
        badgeTone: 'info',
      }),
    );

    // Sort timeline newest first
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      horse: this.horses.applyRolePolicy(horse, user),
      statusHistory,
      ownershipHistory,
      stallHistory,
      medicalHistory,
      trainingHistory,
      timeline,
    };
  }
}
