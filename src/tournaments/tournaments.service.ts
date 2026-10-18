import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  HorseStatus,
  Prisma,
  RegistrationStatus,
  Role,
  TournamentStatus,
  TrackSurface,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { apiError } from '../common/exceptions/api-error';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { ChangeTournamentStatusDto } from './dto/change-tournament-status.dto';
import { RegisterHorseDto } from './dto/register-horse.dto';
import { BatchRecordResultsDto } from './dto/record-result.dto';

export interface TournamentActor {
  id: string;
  name: string;
  role: string;
}

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Lấy danh sách giải đua với bộ lọc, tìm kiếm và phân trang
   */
  async findAll(query: QueryTournamentDto) {
    const { page = 1, limit = 20, status, trackType, search, from, to } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TournamentWhereInput = {
      ...(status && { status }),
      ...(trackType && { trackType }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...((from || to) && {
        raceDate: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tournament.findMany({
        where,
        skip,
        take: limit,
        orderBy: { raceDate: 'desc' },
        include: {
          _count: {
            select: { registrations: true },
          },
        },
      }),
      this.prisma.tournament.count({ where }),
    ]);

    return {
      items: items.map((t) => ({
        ...t,
        prizePool: Number(t.prizePool),
        registeredCount: t._count.registrations,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Lấy chi tiết một giải đua kèm danh sách ngựa đăng ký và kết quả
   */
  async findOne(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        registrations: {
          include: {
            horse: {
              select: {
                id: true,
                name: true,
                horseCode: true,
                breed: true,
                avatarUrl: true,
                status: true,
                isMedicalLocked: true,
                ownerId: true,
                owner: { select: { id: true, fullName: true, email: true } },
              },
            },
            registeredByTrainer: {
              select: { id: true, fullName: true, email: true },
            },
            result: true,
          },
          orderBy: [{ result: { finalRank: 'asc' } }, { registrationDate: 'asc' }],
        },
      },
    });

    if (!tournament) {
      throw apiError(HttpStatus.NOT_FOUND, 'TOURNAMENT_NOT_FOUND', `Tournament ${id} not found`);
    }

    return {
      ...tournament,
      prizePool: Number(tournament.prizePool),
      registrations: tournament.registrations.map((r) => ({
        ...r,
        result: r.result
          ? {
              ...r.result,
              prizeMoneyWon: Number(r.result.prizeMoneyWon),
            }
          : null,
      })),
    };
  }

  /**
   * Tạo mới giải đua (Club Manager only)
   */
  async create(dto: CreateTournamentDto, actor: TournamentActor) {
    const raceDate = new Date(dto.raceDate);
    const deadline = new Date(dto.registrationDeadline);

    if (deadline > raceDate) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_DEADLINE',
        'Registration deadline must be on or before the race date',
      );
    }

    const tournament = await this.prisma.tournament.create({
      data: {
        name: dto.name,
        raceDate,
        location: dto.location,
        distanceMeters: dto.distanceMeters,
        trackType: dto.trackType ?? TrackSurface.TURF,
        prizePool: dto.prizePool ?? 0,
        registrationDeadline: deadline,
        status: dto.status ?? TournamentStatus.UPCOMING,
      },
    });

    await this.audit.record(
      { id: actor.id, name: actor.name },
      'TOURNAMENT_CREATED',
      `Created tournament ${tournament.name} (${tournament.distanceMeters}m)`,
      tournament.id,
      { entityName: 'Tournament', newValues: tournament },
    );

    return {
      ...tournament,
      prizePool: Number(tournament.prizePool),
    };
  }

  /**
   * Cập nhật thông tin giải đua (Club Manager only)
   */
  async update(id: string, dto: UpdateTournamentDto, actor: TournamentActor) {
    const existing = await this.prisma.tournament.findUnique({ where: { id } });
    if (!existing) {
      throw apiError(HttpStatus.NOT_FOUND, 'TOURNAMENT_NOT_FOUND', `Tournament ${id} not found`);
    }

    if (
      existing.status === TournamentStatus.COMPLETED ||
      existing.status === TournamentStatus.CANCELLED
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'TOURNAMENT_LOCKED',
        `Cannot edit tournament that is already ${existing.status}`,
      );
    }

    const raceDate = dto.raceDate ? new Date(dto.raceDate) : existing.raceDate;
    const deadline = dto.registrationDeadline
      ? new Date(dto.registrationDeadline)
      : existing.registrationDeadline;

    if (deadline > raceDate) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_DEADLINE',
        'Registration deadline must be on or before the race date',
      );
    }

    const updated = await this.prisma.tournament.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.raceDate && { raceDate }),
        ...(dto.location && { location: dto.location }),
        ...(dto.distanceMeters && { distanceMeters: dto.distanceMeters }),
        ...(dto.trackType && { trackType: dto.trackType }),
        ...(dto.prizePool !== undefined && { prizePool: dto.prizePool }),
        ...(dto.registrationDeadline && { registrationDeadline: deadline }),
        ...(dto.status && { status: dto.status }),
      },
    });

    await this.audit.record(
      { id: actor.id, name: actor.name },
      'TOURNAMENT_UPDATED',
      `Updated tournament ${updated.name}`,
      updated.id,
      { entityName: 'Tournament', oldValues: existing, newValues: updated },
    );

    return {
      ...updated,
      prizePool: Number(updated.prizePool),
    };
  }

  /**
   * Thay đổi trạng thái giải đua theo vòng đời
   */
  async changeStatus(id: string, dto: ChangeTournamentStatusDto, actor: TournamentActor) {
    const existing = await this.prisma.tournament.findUnique({ where: { id } });
    if (!existing) {
      throw apiError(HttpStatus.NOT_FOUND, 'TOURNAMENT_NOT_FOUND', `Tournament ${id} not found`);
    }

    if (existing.status === dto.status) {
      return existing;
    }

    if (existing.status === TournamentStatus.COMPLETED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'CANNOT_CHANGE_COMPLETED',
        'Completed tournaments cannot have their status altered',
      );
    }

    const updated = await this.prisma.tournament.update({
      where: { id },
      data: { status: dto.status },
    });

    await this.audit.record(
      { id: actor.id, name: actor.name },
      'TOURNAMENT_STATUS_CHANGED',
      `Changed tournament ${existing.name} status from ${existing.status} to ${dto.status}${dto.reason ? ` (${dto.reason})` : ''}`,
      id,
      { entityName: 'Tournament', oldValues: { status: existing.status }, newValues: { status: dto.status } },
    );

    return {
      ...updated,
      prizePool: Number(updated.prizePool),
    };
  }

  /**
   * Xóa giải đua (chỉ khi chưa có ngựa đăng ký và chưa diễn ra)
   */
  async delete(id: string, actor: TournamentActor) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: { _count: { select: { registrations: true } } },
    });

    if (!tournament) {
      throw apiError(HttpStatus.NOT_FOUND, 'TOURNAMENT_NOT_FOUND', `Tournament ${id} not found`);
    }

    if (tournament._count.registrations > 0) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'HAS_REGISTRATIONS',
        'Cannot delete tournament with existing horse registrations. Cancel the tournament instead.',
      );
    }

    if (tournament.status === TournamentStatus.COMPLETED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'CANNOT_DELETE_COMPLETED',
        'Cannot delete a completed tournament',
      );
    }

    await this.prisma.tournament.delete({ where: { id } });

    await this.audit.record(
      { id: actor.id, name: actor.name },
      'TOURNAMENT_DELETED',
      `Deleted tournament ${tournament.name}`,
      id,
      { entityName: 'Tournament', oldValues: tournament },
    );

    return { success: true };
  }

  /**
   * Rà soát điều kiện tham gia giải của toàn bộ đàn ngựa trong CLB
   * Phục vụ SC-5.02 (Race Eligibility Check)
   */
  async getEligibility(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { registrations: { select: { horseId: true, id: true } } },
    });

    if (!tournament) {
      throw apiError(HttpStatus.NOT_FOUND, 'TOURNAMENT_NOT_FOUND', `Tournament ${tournamentId} not found`);
    }

    const registeredHorseMap = new Map(tournament.registrations.map((r) => [r.horseId, r.id]));

    // Lấy tất cả ngựa không bị xóa mềm và chưa nghỉ hưu
    const horses = await this.prisma.horse.findMany({
      where: {
        deletedAt: null,
        status: { not: HorseStatus.RETIRED },
      },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        medicalLocks: {
          where: { unlockedAt: null },
          orderBy: { lockedAt: 'desc' },
          take: 1,
        },
        workoutSessions: {
          where: {
            status: 'COMPLETED',
            scheduledDate: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 ngày qua
            },
          },
          select: { id: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const eligible: any[] = [];
    const ineligible: any[] = [];

    for (const h of horses) {
      const isRegistered = registeredHorseMap.has(h.id);
      const registrationId = registeredHorseMap.get(h.id);
      const reasons: string[] = [];

      // Điều kiện 1: Khóa y tế
      if (h.isMedicalLocked || (h.medicalLocks && h.medicalLocks.length > 0)) {
        reasons.push('Horse is currently under Veterinary Medical Lock');
      }

      // Điều kiện 2: Trạng thái ngựa
      if (
        h.status === HorseStatus.UNDER_OBSERVATION ||
        h.status === HorseStatus.INJURED ||
        h.status === HorseStatus.ISOLATED
      ) {
        reasons.push(`Horse health status is currently ${h.status}`);
      }

      // Đánh giá thể lực (số buổi tập gần đây)
      const completedWorkouts = h.workoutSessions ? h.workoutSessions.length : 0;
      if (completedWorkouts < 4) {
        reasons.push(`Insufficient recent training sessions (${completedWorkouts}/4 required in past 30 days)`);
      }

      const horseData = {
        id: h.id,
        name: h.name,
        horseCode: h.horseCode,
        breed: h.breed,
        avatarUrl: h.avatarUrl,
        status: h.status,
        isMedicalLocked: h.isMedicalLocked,
        completedWorkouts,
        owner: h.owner,
        isRegistered,
        registrationId,
      };

      if (reasons.length === 0) {
        eligible.push(horseData);
      } else {
        ineligible.push({
          ...horseData,
          ineligibleReasons: reasons,
        });
      }
    }

    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        raceDate: tournament.raceDate,
        distanceMeters: tournament.distanceMeters,
        trackType: tournament.trackType,
        status: tournament.status,
        registrationDeadline: tournament.registrationDeadline,
      },
      eligible,
      ineligible,
      totalEligible: eligible.length,
      totalIneligible: ineligible.length,
    };
  }

  /**
   * Đăng ký ngựa tham gia giải đua (Head Trainer / Club Manager)
   */
  async registerHorse(tournamentId: string, dto: RegisterHorseDto, actor: TournamentActor) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) {
      throw apiError(HttpStatus.NOT_FOUND, 'TOURNAMENT_NOT_FOUND', `Tournament ${tournamentId} not found`);
    }

    if (
      tournament.status !== TournamentStatus.UPCOMING &&
      tournament.status !== TournamentStatus.OPEN_REGISTRATION
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'REGISTRATION_NOT_OPEN',
        `Tournament is currently in ${tournament.status} state, registration is closed.`,
      );
    }

    if (new Date() > tournament.registrationDeadline) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'DEADLINE_EXPIRED',
        'Registration deadline for this tournament has passed.',
      );
    }

    const horse = await this.prisma.horse.findUnique({
      where: { id: dto.horseId },
      include: {
        owner: { select: { id: true, fullName: true } },
      },
    });

    if (!horse || horse.deletedAt) {
      throw apiError(HttpStatus.NOT_FOUND, 'HORSE_NOT_FOUND', `Horse ${dto.horseId} not found`);
    }

    // Chặn cứng: Khóa y tế
    if (horse.isMedicalLocked) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'MEDICAL_LOCK_ACTIVE',
        `Cannot register horse ${horse.name}: Medical Lock is currently in force by Veterinarian.`,
      );
    }

    if (horse.status === HorseStatus.RETIRED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'HORSE_RETIRED',
        `Cannot register retired horse ${horse.name}.`,
      );
    }

    // Kiểm tra trùng lặp
    const existing = await this.prisma.tournamentRegistration.findUnique({
      where: {
        tournamentId_horseId: {
          tournamentId,
          horseId: dto.horseId,
        },
      },
    });

    if (existing) {
      throw apiError(
        HttpStatus.CONFLICT,
        'ALREADY_REGISTERED',
        `Horse ${horse.name} is already registered for this tournament.`,
      );
    }

    const registration = await this.prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        horseId: dto.horseId,
        registeredByTrainerId: actor.id,
        status: RegistrationStatus.REGISTERED,
        notes: dto.notes,
      },
      include: {
        horse: { select: { id: true, name: true, horseCode: true } },
      },
    });

    await this.audit.record(
      { id: actor.id, name: actor.name },
      'TOURNAMENT_REGISTERED',
      `Registered horse ${horse.name} for tournament ${tournament.name}`,
      registration.id,
      { entityName: 'TournamentRegistration', newValues: registration },
    );

    // Gửi thông báo cho Chủ ngựa nếu có
    if (horse.ownerId) {
      await this.notifications.notifyUsers(
        [horse.ownerId],
        {
          type: 'RACE_REGISTRATION',
          category: 'TRAINING',
          title: 'Chiến mã đã được đăng ký thi đấu',
          message: `Ngựa ${horse.name} của bạn đã được đăng ký tham gia giải đua ${tournament.name}.`,
          link: `/races`,
          params: { horseName: horse.name, tournamentName: tournament.name },
        },
        actor.id,
      );
    }

    return registration;
  }

  /**
   * Hủy đăng ký hoặc rút ngựa khỏi giải (Scratch)
   */
  async cancelRegistration(
    tournamentId: string,
    registrationId: string,
    reason: string,
    actor: TournamentActor,
  ) {
    const registration = await this.prisma.tournamentRegistration.findUnique({
      where: { id: registrationId },
      include: {
        tournament: true,
        horse: true,
      },
    });

    if (!registration || registration.tournamentId !== tournamentId) {
      throw apiError(
        HttpStatus.NOT_FOUND,
        'REGISTRATION_NOT_FOUND',
        `Registration ${registrationId} not found in this tournament`,
      );
    }

    if (registration.tournament.status === TournamentStatus.COMPLETED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'CANNOT_SCRATCH_COMPLETED',
        'Cannot scratch a horse from a completed tournament',
      );
    }

    const updated = await this.prisma.tournamentRegistration.update({
      where: { id: registrationId },
      data: {
        status: RegistrationStatus.SCRATCHED_MEDICAL,
        notes: registration.notes ? `${registration.notes} | Scratched: ${reason}` : `Scratched: ${reason}`,
      },
    });

    await this.audit.record(
      { id: actor.id, name: actor.name },
      'TOURNAMENT_SCRATCHED',
      `Scratched horse ${registration.horse.name} from tournament ${registration.tournament.name} (${reason})`,
      registrationId,
      { entityName: 'TournamentRegistration', oldValues: registration, newValues: updated },
    );

    return updated;
  }

  /**
   * Ghi nhận kết quả thi đấu (Trainer hoặc CM)
   */
  async recordResults(tournamentId: string, dto: BatchRecordResultsDto, actor: TournamentActor) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { registrations: true },
    });

    if (!tournament) {
      throw apiError(HttpStatus.NOT_FOUND, 'TOURNAMENT_NOT_FOUND', `Tournament ${tournamentId} not found`);
    }

    if (tournament.status === TournamentStatus.COMPLETED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'ALREADY_LOCKED',
        'Results for this tournament have already been locked by the Club Manager.',
      );
    }

    const validRegIds = new Set(tournament.registrations.map((r) => r.id));

    const savedResults: any[] = [];

    for (const item of dto.results) {
      if (!validRegIds.has(item.registrationId)) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'INVALID_REGISTRATION_ID',
          `Registration ID ${item.registrationId} does not belong to this tournament`,
        );
      }

      // Tự động tính vận tốc nếu chưa có: (distanceMeters / finishTimeSeconds) * 3.6
      const calculatedSpeed =
        item.avgSpeedKmh && item.avgSpeedKmh > 0
          ? item.avgSpeedKmh
          : Math.round(((tournament.distanceMeters / item.finishTimeSeconds) * 3.6) * 100) / 100;

      const res = await this.prisma.tournamentResult.upsert({
        where: { registrationId: item.registrationId },
        create: {
          registrationId: item.registrationId,
          finalRank: item.finalRank,
          finishTimeSeconds: item.finishTimeSeconds,
          avgSpeedKmh: calculatedSpeed,
          prizeMoneyWon: item.prizeMoneyWon ?? 0,
          officialNotes: item.officialNotes,
        },
        update: {
          finalRank: item.finalRank,
          finishTimeSeconds: item.finishTimeSeconds,
          avgSpeedKmh: calculatedSpeed,
          prizeMoneyWon: item.prizeMoneyWon ?? 0,
          officialNotes: item.officialNotes,
        },
      });

      savedResults.push({
        ...res,
        prizeMoneyWon: Number(res.prizeMoneyWon),
      });
    }

    await this.audit.record(
      { id: actor.id, name: actor.name },
      'TOURNAMENT_RESULTS_RECORDED',
      `Recorded ${dto.results.length} results for tournament ${tournament.name}`,
      tournamentId,
      { entityName: 'TournamentResult', newValues: savedResults },
    );

    // Nếu có cờ lockResults và người dùng là Club Manager -> Chốt luôn
    if (dto.lockResults) {
      if (actor.role !== 'CLUB_MANAGER') {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'PERMISSION_DENIED',
          'Only the Club Manager has the authority to lock tournament results.',
        );
      }
      return this.lockResults(tournamentId, actor);
    }

    return {
      success: true,
      results: savedResults,
    };
  }

  /**
   * Chốt kết quả thi đấu (Club Manager only)
   * 1. Khóa trạng thái giải sang COMPLETED.
   * 2. Tự động chuyển ngựa về trạng thái RESTING (nghỉ ngơi hồi phục).
   * 3. Tự động phân bổ tiền thưởng: Owner 70%, CLB 15%, Trainer 10%, Jockey 5%.
   */
  async lockResults(tournamentId: string, actor: TournamentActor) {
    if (actor.role !== 'CLUB_MANAGER') {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'PERMISSION_DENIED',
        'Only the Club Manager has the authority to lock tournament results.',
      );
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          include: {
            horse: true,
            result: true,
          },
        },
      },
    });

    if (!tournament) {
      throw apiError(HttpStatus.NOT_FOUND, 'TOURNAMENT_NOT_FOUND', `Tournament ${tournamentId} not found`);
    }

    if (tournament.status === TournamentStatus.COMPLETED) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'ALREADY_COMPLETED',
        'Tournament results have already been locked.',
      );
    }

    const activeRegs = tournament.registrations.filter(
      (r) => r.status === RegistrationStatus.REGISTERED || r.status === RegistrationStatus.CONFIRMED,
    );

    if (activeRegs.length === 0) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'NO_REGISTRATIONS',
        'Cannot lock tournament without any registered participants.',
      );
    }

    const missingResults = activeRegs.filter((r) => !r.result);
    if (missingResults.length > 0) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'RESULTS_INCOMPLETE',
        `Cannot lock results: ${missingResults.length} registered horse(s) still lack finish results.`,
      );
    }

    // Xử lý trong transaction
    const now = new Date();
    const billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    await this.prisma.$transaction(async (tx) => {
      // 1. Chốt giải đấu
      await tx.tournament.update({
        where: { id: tournamentId },
        data: { status: TournamentStatus.COMPLETED },
      });

      // 2. Cập nhật từng con ngựa & phân bổ giải thưởng
      for (const reg of activeRegs) {
        if (!reg.result) continue;

        // Chuyển ngựa về RESTING
        await tx.horse.update({
          where: { id: reg.horseId },
          data: { status: HorseStatus.RESTING },
        });

        const prizeWon = Number(reg.result.prizeMoneyWon);
        if (prizeWon > 0 && reg.horse.ownerId) {
          // Owner nhận 70% tiền thưởng
          const ownerShare = Math.round(prizeWon * 0.7);

          // Tạo hoặc cập nhật hóa đơn tài chính của Owner cho kỳ hiện tại
          const existingInvoice = await tx.financialInvoice.findFirst({
            where: {
              horseId: reg.horseId,
              ownerId: reg.horse.ownerId,
              billingPeriod,
              status: 'DRAFT',
            },
          });

          if (existingInvoice) {
            const newPrizeCredit = Number(existingInvoice.prizeCredit) + ownerShare;
            const newNetAmount =
              Number(existingInvoice.boardingFee) +
              Number(existingInvoice.medicalFee) +
              Number(existingInvoice.trainingFee) -
              newPrizeCredit;

            await tx.financialInvoice.update({
              where: { id: existingInvoice.id },
              data: {
                prizeCredit: newPrizeCredit,
                netAmount: newNetAmount,
              },
            });
          } else {
            await tx.financialInvoice.create({
              data: {
                horseId: reg.horseId,
                ownerId: reg.horse.ownerId,
                billingPeriod,
                boardingFee: 0,
                medicalFee: 0,
                trainingFee: 0,
                prizeCredit: ownerShare,
                netAmount: -ownerShare, // Âm nghĩa là CLB đang nợ tiền thưởng trả cho Owner
                status: 'DRAFT',
              },
            });
          }
        }
      }
    });

    await this.audit.record(
      { id: actor.id, name: actor.name },
      'TOURNAMENT_RESULTS_LOCKED',
      `Locked official results for tournament ${tournament.name}. Horses returned to RESTING and prize splits calculated.`,
      tournamentId,
      { entityName: 'Tournament', newValues: { status: TournamentStatus.COMPLETED } },
    );

    // Gửi thông báo kết quả cho tất cả Huấn luyện viên
    await this.notifications.notifyRoles(
      [Role.HEAD_TRAINER, Role.CLUB_MANAGER],
      {
        type: 'TOURNAMENT_COMPLETED',
        category: 'TRAINING',
        title: 'Kết quả giải đua đã được chốt chính thức',
        message: `Giải đua ${tournament.name} đã được chốt kết quả và hạch toán thành công.`,
        link: `/races`,
        params: { tournamentName: tournament.name },
      },
      actor.id,
    );

    return this.findOne(tournamentId);
  }
}
