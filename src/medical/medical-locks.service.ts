import { HttpStatus, Injectable } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { apiError } from '../common/exceptions/api-error';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Role, HorseStatus, WorkoutStatus } from '@prisma/client';
import { HEAVY_WORKOUT_WHERE } from '../training/training-rules';
import {
  CreateMedicalLockDto,
  ExtendMedicalLockDto,
  ReleaseMedicalLockDto,
  MedicalLockQueryDto,
} from './dto/medical-lock.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MedicalAccessService } from './medical-access.service';

/** P2-04: Khóa huấn luyện — đặt, gỡ, gia hạn, danh sách (FR-3.10 → FR-3.12). */
@Injectable()
export class MedicalLocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly access: MedicalAccessService,
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

  /**
   * Đặt Khóa huấn luyện. Mọi lệnh ghi (khóa, trạng thái ngựa, giáo án, buổi tập, nhật ký) nằm trong
   * MỘT transaction: lỗi giữa chừng thì không ghi gì. Dòng Horse bị khóa (FOR UPDATE) trước khi kiểm
   * "đã có khóa chưa", nên 2 bác sĩ bấm cùng lúc thì người sau phải chờ và thấy khóa của người trước.
   */
  async createMedicalLock(actor: CurrentUserPayload, dto: CreateMedicalLockDto) {
    this.access.assertVet(actor, 'place a training lock');

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
    this.access.assertVet(actor, 'lift a training lock');

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
    this.access.assertVet(actor, 'extend a training lock');

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

    await this.access.checkHorseAccess(lock.horseId, currentUser);

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
}
