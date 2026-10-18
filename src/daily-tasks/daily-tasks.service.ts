import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DailyTaskType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CompleteDailyTaskDto, QueryDailyTasksDto } from './dto/daily-task.dto';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { InventoryService } from '../inventory/inventory.service';

const UNDO_WINDOW_MS = 15 * 60 * 1000; // 15 phút (900.000 ms)

@Injectable()
export class DailyTasksService {
  private readonly logger = new Logger(DailyTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * TASK F4-04-BE: Sinh danh sách công việc chăm sóc hàng ngày cho từng con ngựa.
   * Đảm bảo tính Idempotent: chạy lại 10 lần trong ngày vẫn không nhân đôi công việc và
   * không làm mất trạng thái công việc đã hoàn thành trước đó.
   */
  async generateDailyTasksForDate(
    targetDate = new Date(),
    zoneIdFilter?: string,
  ): Promise<{
    date: string;
    totalGenerated: number;
    horsesProcessed: number;
  }> {
    const dateStr = targetDate.toISOString().slice(0, 10);
    const dayDate = new Date(`${dateStr}T00:00:00.000Z`);

    this.logger.log(`[DailyTasksService] Generating daily care tasks for date: ${dateStr}`);

    // Lấy danh sách ngựa đang quản lý (không bị xóa mềm)
    const horses = await this.prisma.horse.findMany({
      where: {
        deletedAt: null,
        ...(zoneIdFilter
          ? {
              stallAllocations: {
                some: {
                  isActive: true,
                  stall: { zoneId: zoneIdFilter },
                },
              },
            }
          : {}),
      },
      include: {
        stallAllocations: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          include: {
            stall: {
              include: { zoneRef: true },
            },
          },
          take: 1,
        },
        medicalLocks: {
          where: { isLocked: true },
          take: 1,
        },
        nutritionPlans: {
          where: { status: 'APPROVED' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });

    // Lấy bảng phân ca ngày hôm nay để gán Groom phụ trách theo khu
    const shiftRosters = await this.prisma.shiftRoster.findMany({
      where: { date: dayDate },
      include: { shift: true },
    });

    let totalGenerated = 0;

    for (const horse of horses) {
      const allocation = horse.stallAllocations[0];
      const stall = allocation?.stall;
      const zoneId = stall?.zoneId || undefined;
      const stallId = stall?.id || undefined;

      // Tìm Groom phụ trách khu chuồng hôm nay từ ShiftRoster hoặc phân bổ mặc định
      const matchedRoster = shiftRosters.find((r) => r.zoneId === zoneId);
      const assignedGroomUserId =
        matchedRoster?.groomUserId || allocation?.assignedGroomUserId || undefined;

      const activeLock = horse.medicalLocks[0];
      const isLocked = Boolean(horse.isMedicalLocked || activeLock?.isLocked);
      const lockNotes = activeLock
        ? `Khóa y tế: ${activeLock.lockReason}. Chú ý điều trị phục hồi.`
        : horse.isMedicalLocked
          ? 'Ngựa đang được giám sát y tế đặc biệt.'
          : undefined;

      const activePlan = horse.nutritionPlans[0];
      const mealsJson = activePlan?.mealsJson as any[] | null;

      // Danh sách task cần đảm bảo có trong ngày
      const tasksToEnsure: Array<{
        taskType: DailyTaskType;
        title: string;
        description: string;
        mealType: string | null;
        scheduledTime: string;
        itemsSnapshotJson?: any;
      }> = [];

      // 1. Task Vệ sinh chuồng trại sáng
      tasksToEnsure.push({
        taskType: DailyTaskType.CLEANING,
        title: 'Vệ sinh ô chuồng & dọn phân buổi sáng',
        description:
          'Dọn sạch phân, thay rơm lót chuồng mới, khử trùng đáy chuồng và kiểm tra máng nước tự động.',
        mealType: null,
        scheduledTime: '07:00',
      });

      // 2. Task Cho ăn (FEEDING) theo các bữa
      if (mealsJson && Array.isArray(mealsJson) && mealsJson.length > 0) {
        for (const m of mealsJson) {
          const mType = m.mealType || 'MORNING';
          const time =
            m.time || (mType === 'MORNING' ? '06:00' : mType === 'NOON' ? '11:30' : '17:00');
          const itemsDesc = (m.items || [])
            .map((it: any) => `${it.supplyName || it.supplyCode}: ${it.amount}${it.unit}`)
            .join(' + ');

          tasksToEnsure.push({
            taskType: DailyTaskType.FEEDING,
            title: `Cho ăn bữa ${mType === 'MORNING' ? 'Sáng' : mType === 'NOON' ? 'Trưa' : 'Tối'} (${m.items?.length || 0} món)`,
            description: itemsDesc
              ? `Thực đơn đã duyệt: ${itemsDesc}`
              : 'Cho ăn theo khẩu phần chuẩn.',
            mealType: mType,
            scheduledTime: time,
            itemsSnapshotJson: m.items || [],
          });
        }
      } else {
        // Fallback khẩu phần tiêu chuẩn nếu chưa lập khẩu phần chi tiết
        tasksToEnsure.push(
          {
            taskType: DailyTaskType.FEEDING,
            title: 'Cho ăn bữa Sáng: Cỏ khô Timothy + Cám yến mạch',
            description: '3.0kg cỏ khô Timothy + 1.0kg cám yến mạch + nước sạch.',
            mealType: 'MORNING',
            scheduledTime: '06:00',
          },
          {
            taskType: DailyTaskType.FEEDING,
            title: 'Cho ăn bữa Trưa: Cỏ khô & Điện giải',
            description: '2.0kg cỏ khô + bổ sung nước hòa tan chất điện giải.',
            mealType: 'NOON',
            scheduledTime: '11:30',
          },
          {
            taskType: DailyTaskType.FEEDING,
            title: 'Cho ăn bữa Tối: Cỏ khô + Thức ăn hạt bổ sung',
            description: '3.5kg cỏ khô + 1.2kg ngũ cốc hỗn hợp.',
            mealType: 'EVENING',
            scheduledTime: '17:00',
          },
        );
      }

      // 3. Quy tắc y tế khi ngựa có Medical Lock (TASK F4-04-BE)
      if (isLocked) {
        // Tự động hủy bài tập nặng / tắm mạnh, thay bằng ngâm chân nước đá phục hồi
        tasksToEnsure.push(
          {
            taskType: DailyTaskType.ICE_BOOT_REST,
            title: '🧊 Ngâm chân nước đá phục hồi buổi sáng',
            description:
              'Ngựa có Khóa Huấn Luyện Y Tế. Thực hiện ngâm chân nước đá 20 phút cho chân đau/khớp viêm, sau đó để ngựa nghỉ ngơi tại ô.',
            mealType: null,
            scheduledTime: '09:30',
          },
          {
            taskType: DailyTaskType.ICE_BOOT_REST,
            title: '🧊 Chườm lạnh & Theo dõi vết thương buổi chiều',
            description:
              'Kiểm tra lại khớp/vết thương, chườm lạnh 15 phút. Tuyệt đối không dắt chạy nhanh hay để ngựa vận động mạnh.',
            mealType: null,
            scheduledTime: '15:30',
          },
        );
      } else {
        // Ngựa khỏe mạnh bình thường: Tắm rửa và Dắt đi dạo nhẹ
        tasksToEnsure.push(
          {
            taskType: DailyTaskType.GROOMING,
            title: 'Tắm rửa, chải lông móng & kiểm tra thể trạng',
            description:
              'Tắm mát, chải mượt bờm lông, cạo sạch sỏi bùn trong lòng móng và lau khô chân ngựa.',
            mealType: null,
            scheduledTime: '14:00',
          },
          {
            taskType: DailyTaskType.WALKING,
            title: 'Dắt đi dạo nhẹ nhàng & thả lỏng cơ bắp',
            description: 'Dắt ngựa đi bộ thả lỏng 25 phút trong sân bóng mát.',
            mealType: null,
            scheduledTime: '16:30',
          },
        );
      }

      // Upsert từng task để bảo đảm Idempotent
      for (const t of tasksToEnsure) {
        const uniqueKey = {
          date: dayDate,
          horseId: horse.id,
          taskType: t.taskType,
          mealType: t.mealType,
          scheduledTime: t.scheduledTime,
        };

        const existing = await this.prisma.dailyCareTask.findFirst({
          where: uniqueKey,
        });

        if (!existing) {
          const taskCode = `TSK-${dateStr.replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

          await this.prisma.dailyCareTask.create({
            data: {
              taskCode,
              date: dayDate,
              horseId: horse.id,
              stallZoneId: zoneId,
              stallId,
              taskType: t.taskType,
              title: t.title,
              description: t.description,
              mealType: t.mealType,
              scheduledTime: t.scheduledTime,
              nutritionPlanId: activePlan?.id,
              isMedicalLocked: isLocked,
              medicalLockNotes: lockNotes,
              itemsSnapshotJson: t.itemsSnapshotJson || null,
              assignedGroomUserId,
            },
          });
          totalGenerated++;
        } else if (
          !existing.isCompleted &&
          (existing.stallZoneId !== zoneId ||
            existing.stallId !== stallId ||
            (assignedGroomUserId && existing.assignedGroomUserId !== assignedGroomUserId))
        ) {
          await this.prisma.dailyCareTask.update({
            where: { id: existing.id },
            data: {
              stallZoneId: zoneId,
              stallId,
              assignedGroomUserId: assignedGroomUserId || existing.assignedGroomUserId,
              isMedicalLocked: isLocked,
              medicalLockNotes: lockNotes,
            },
          });
        }
      }
    }

    this.logger.log(
      `[DailyTasksService] Generated ${totalGenerated} tasks for ${horses.length} horses on ${dateStr}`,
    );

    return {
      date: dateStr,
      totalGenerated,
      horsesProcessed: horses.length,
    };
  }

  /**
   * SC-4.04: Lấy danh sách checklist công việc theo ngày, khu chuồng, ca trực và quyền xem
   */
  async findAll(query: QueryDailyTasksDto, currentUser: CurrentUserPayload) {
    const dateStr = query.date || new Date().toISOString().slice(0, 10);
    const dayDate = new Date(`${dateStr}T00:00:00.000Z`);

    // Tự động sinh công việc nếu ngày đó chưa có task nào (on-demand self-healing)
    const existingCount = await this.prisma.dailyCareTask.count({
      where: { date: dayDate },
    });
    if (existingCount === 0) {
      await this.generateDailyTasksForDate(dayDate, query.zoneId);
    } else {
      // Tự động đồng bộ zone/stall của các task chưa hoàn thành theo phân bổ chuồng mới nhất của ngựa
      const horsesWithStall = await this.prisma.horse.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          stallAllocations: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              assignedGroomUserId: true,
              stall: { select: { id: true, zoneId: true } },
            },
          },
        },
      });

      for (const h of horsesWithStall || []) {
        const activeAlloc = h.stallAllocations[0];
        if (activeAlloc?.stall) {
          await this.prisma.dailyCareTask.updateMany({
            where: {
              date: dayDate,
              horseId: h.id,
              isCompleted: false,
              OR: [
                { stallZoneId: { not: activeAlloc.stall.zoneId } },
                { stallId: { not: activeAlloc.stall.id } },
              ],
            },
            data: {
              stallZoneId: activeAlloc.stall.zoneId,
              stallId: activeAlloc.stall.id,
            },
          });
        }
      }
    }

    const where: any = {
      date: dayDate,
      horse: { deletedAt: null },
    };

    if (query.horseId) {
      where.horseId = query.horseId;
    }

    if (query.taskType) {
      where.taskType = query.taskType;
    }

    if (query.isCompleted !== undefined) {
      where.isCompleted = query.isCompleted;
    }

    // Nếu người dùng bật cờ "Chỉ việc của tôi" hoặc là Groom xem mặc định (khi cả onlyMine và onlyMyTasks chưa được truyền)
    const isOnlyMine =
      query.onlyMine === true ||
      query.onlyMyTasks === true ||
      (currentUser.role === Role.GROOM &&
        query.onlyMine === undefined &&
        query.onlyMyTasks === undefined);

    if (isOnlyMine && currentUser.userId) {
      const myRosters = await this.prisma.shiftRoster.findMany({
        where: {
          date: dayDate,
          groomUserId: currentUser.userId,
        },
        select: { zoneId: true },
      });
      const myZoneIds = myRosters.map((r) => r.zoneId);

      const groomOrConditions: any[] = [
        { assignedGroomUserId: currentUser.userId },
        { completedById: currentUser.userId },
      ];
      if (myZoneIds.length > 0) {
        groomOrConditions.push({ stallZoneId: { in: myZoneIds } });
      }

      if (query.zoneId) {
        where.stallZoneId = query.zoneId;
        if (!myZoneIds.includes(query.zoneId)) {
          where.OR = [
            { assignedGroomUserId: currentUser.userId },
            { completedById: currentUser.userId },
          ];
        }
      } else {
        where.OR = groomOrConditions;
      }
    } else if (query.zoneId) {
      where.stallZoneId = query.zoneId;
    }

    const [items, total] = await Promise.all([
      this.prisma.dailyCareTask.findMany({
        where,
        include: {
          horse: {
            select: {
              id: true,
              name: true,
              horseCode: true,
              avatarUrl: true,
              status: true,
              isMedicalLocked: true,
            },
          },
          stallZone: {
            select: { id: true, code: true, name: true },
          },
          stall: {
            select: { id: true, code: true, zone: true },
          },
          completedBy: {
            select: { id: true, fullName: true, role: true },
          },
          assignedGroom: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: [{ scheduledTime: 'asc' }, { taskType: 'asc' }],
      }),
      this.prisma.dailyCareTask.count({ where }),
    ]);

    // Thống kê KPIs tiến độ ca trực
    const completedCount = items.filter((t) => t.isCompleted).length;
    const pendingCount = items.length - completedCount;
    const completionRatePct =
      items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;
    const medicalLockedCount = items.filter((t) => t.isMedicalLocked).length;

    return {
      date: dateStr,
      items,
      total,
      stats: {
        total: items.length,
        completed: completedCount,
        pending: pendingCount,
        completionRatePct,
        medicalLockedCount,
      },
    };
  }

  /**
   * TASK F4-05-BE: Xác nhận hoàn thành công việc
   * Ghi nhận timestamp, groomId và thiết lập cửa sổ hoàn tác 15 phút.
   */
  async completeTask(id: string, dto: CompleteDailyTaskDto, currentUser: CurrentUserPayload) {
    const task = await this.prisma.dailyCareTask.findUnique({
      where: { id },
      include: { horse: true },
    });

    if (!task) {
      throw new NotFoundException('Không tìm thấy công việc chăm sóc.');
    }

    if (task.isCompleted) {
      return task; // Đã xong rồi, trả về idempotent
    }

    const now = new Date();
    const undoUntil = new Date(now.getTime() + UNDO_WINDOW_MS);

    const updated = await this.prisma.dailyCareTask.update({
      where: { id },
      data: {
        isCompleted: true,
        completedAt: now,
        completedById: currentUser.userId,
        undoUntil,
        description: dto.notes
          ? `${task.description || ''}\n[Ghi chú Groom: ${dto.notes}]`
          : task.description,
      },
      include: {
        horse: true,
        completedBy: { select: { id: true, fullName: true } },
      },
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName } as any,
      'COMPLETE_DAILY_TASK',
      `Hoàn thành công việc: ${task.title} cho ngựa ${task.horse.name}`,
      task.id,
      {
        entityName: 'DailyCareTask',
        newValues: {
          taskCode: task.taskCode,
          horseName: task.horse.name,
          taskType: task.taskType,
          completedAt: now,
        },
      },
    );

    // Trừ kho tự động nếu là việc cho ăn (FEEDING)
    if (task.taskType === DailyTaskType.FEEDING && task.stallZoneId && task.itemsSnapshotJson) {
      await this.inventoryService.deductStockForFeeding(
        task.stallZoneId,
        task.itemsSnapshotJson as any,
      );
    }

    return updated;
  }

  /**
   * TASK F4-05-BE: Hoàn tác trạng thái hoàn thành trong vòng 15 phút nếu bấm nhầm.
   * Sau 15 phút, khóa không cho phép hoàn tác.
   */
  async uncompleteTask(id: string, currentUser: CurrentUserPayload) {
    const task = await this.prisma.dailyCareTask.findUnique({
      where: { id },
      include: { horse: true },
    });

    if (!task) {
      throw new NotFoundException('Không tìm thấy công việc chăm sóc.');
    }

    if (!task.isCompleted) {
      return task; // Đang chưa hoàn thành sẵn
    }

    // Kiểm tra quyền: Người bấm hoàn thành, hoặc Club Manager mới được hoàn tác
    if (task.completedById !== currentUser.userId && currentUser.role !== Role.CLUB_MANAGER) {
      throw new ForbiddenException(
        'Bạn không có quyền hoàn tác công việc do nhân viên khác thực hiện.',
      );
    }

    // Kiểm tra cửa sổ 15 phút
    const now = new Date();
    if (task.undoUntil && now > task.undoUntil && currentUser.role !== Role.CLUB_MANAGER) {
      const minutesPassed = Math.round(
        (now.getTime() - (task.completedAt?.getTime() || 0)) / 60000,
      );
      throw new BadRequestException(
        `Cửa sổ hoàn tác 15 phút đã hết hạn (đã trôi qua ${minutesPassed} phút). Vui lòng liên hệ Quản lý nếu cần điều chỉnh.`,
      );
    }

    const updated = await this.prisma.dailyCareTask.update({
      where: { id },
      data: {
        isCompleted: false,
        completedAt: null,
        completedById: null,
        undoUntil: null,
      },
      include: {
        horse: true,
      },
    });

    await this.auditService.record(
      { id: currentUser.userId, name: currentUser.fullName } as any,
      'UNCOMPLETE_DAILY_TASK',
      `Hoàn tác công việc: ${task.title} cho ngựa ${task.horse.name}`,
      task.id,
      {
        entityName: 'DailyCareTask',
        newValues: {
          taskCode: task.taskCode,
          horseName: task.horse.name,
          uncompletedAt: now,
        },
      },
    );

    // Hoàn lại kho vật tư nếu hoàn tác việc cho ăn (FEEDING)
    if (task.taskType === DailyTaskType.FEEDING && task.stallZoneId && task.itemsSnapshotJson) {
      await this.inventoryService.restoreStockForFeeding(
        task.stallZoneId,
        task.itemsSnapshotJson as any,
      );
    }

    return updated;
  }
}
