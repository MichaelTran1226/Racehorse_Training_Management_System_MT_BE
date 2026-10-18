import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DailyTaskType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryService } from '../inventory/inventory.service';
import { DailyTasksService } from './daily-tasks.service';

describe('DailyTasksService', () => {
  let service: DailyTasksService;
  let prisma: any;
  let auditService: any;
  let notifications: any;
  let inventoryService: any;

  beforeEach(async () => {
    prisma = {
      horse: { findMany: jest.fn(), findUnique: jest.fn() },
      shiftRoster: { findMany: jest.fn().mockResolvedValue([]) },
      dailyCareTask: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };

    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = {
      notifyRoles: jest.fn().mockResolvedValue(undefined),
      notifyUsers: jest.fn().mockResolvedValue(undefined),
    };
    inventoryService = {
      deductStockForFeedingTask: jest.fn().mockResolvedValue(undefined),
      restoreStockForFeeding: jest.fn().mockResolvedValue(undefined),
      restoreStockForFeedingTask: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyTasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationsService, useValue: notifications },
        { provide: InventoryService, useValue: inventoryService },
      ],
    }).compile();

    service = module.get<DailyTasksService>(DailyTasksService);
  });

  describe('generateDailyTasksForDate', () => {
    it('generates standard cleaning, feeding, grooming and walking tasks for healthy horses', async () => {
      const mockHorse = {
        id: 'horse-1',
        name: 'Flash',
        deletedAt: null,
        isMedicalLocked: false,
        stallAllocations: [
          {
            isActive: true,
            assignedGroomUserId: 'groom-1',
            stall: { id: 'stall-1', zoneId: 'zone-1' },
          },
        ],
        medicalLocks: [],
        nutritionPlans: [
          {
            id: 'plan-1',
            status: 'APPROVED',
            mealsJson: [
              {
                mealType: 'MORNING',
                time: '06:00',
                items: [{ supplyName: 'Cỏ khô', amount: 3, unit: 'KG' }],
              },
            ],
          },
        ],
      };

      prisma.horse.findMany.mockResolvedValue([mockHorse]);
      prisma.shiftRoster.findMany.mockResolvedValue([]);
      prisma.dailyCareTask.findFirst.mockResolvedValue(null);
      prisma.dailyCareTask.create.mockResolvedValue({ id: 'task-new' });

      const result = await service.generateDailyTasksForDate(new Date('2026-10-18'));
      expect(result.horsesProcessed).toBe(1);
      expect(result.totalGenerated).toBeGreaterThanOrEqual(3);
      expect(prisma.dailyCareTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            horseId: 'horse-1',
            taskType: DailyTaskType.CLEANING,
          }),
        }),
      );
    });

    it('switches heavy tasks to ICE_BOOT_REST when horse is medical locked', async () => {
      const mockLockedHorse = {
        id: 'horse-locked',
        name: 'Thunder',
        deletedAt: null,
        isMedicalLocked: true,
        stallAllocations: [],
        medicalLocks: [{ isLocked: true, lockReason: 'Vết thương cổ chân trái' }],
        nutritionPlans: [],
      };

      prisma.horse.findMany.mockResolvedValue([mockLockedHorse]);
      prisma.shiftRoster.findMany.mockResolvedValue([]);
      prisma.dailyCareTask.findFirst.mockResolvedValue(null);
      prisma.dailyCareTask.create.mockResolvedValue({ id: 'task-lock' });

      await service.generateDailyTasksForDate(new Date('2026-10-18'));

      expect(prisma.dailyCareTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            taskType: DailyTaskType.ICE_BOOT_REST,
            isMedicalLocked: true,
          }),
        }),
      );
    });

    it('guarantees idempotency by not recreating already existing tasks', async () => {
      const mockHorse = {
        id: 'horse-1',
        name: 'Flash',
        deletedAt: null,
        isMedicalLocked: false,
        stallAllocations: [],
        medicalLocks: [],
        nutritionPlans: [],
      };

      prisma.horse.findMany.mockResolvedValue([mockHorse]);
      prisma.shiftRoster.findMany.mockResolvedValue([]);
      // Giả lập tất cả task đã tồn tại
      prisma.dailyCareTask.findFirst.mockResolvedValue({ id: 'existing-task' });

      const result = await service.generateDailyTasksForDate(new Date('2026-10-18'));
      expect(result.totalGenerated).toBe(0);
      expect(prisma.dailyCareTask.create).not.toHaveBeenCalled();
    });
  });

  describe('completeTask & uncompleteTask (15-minute undo window)', () => {
    it('completes a task and sets undoUntil to 15 minutes in the future', async () => {
      const mockTask = {
        id: 'task-1',
        taskCode: 'TSK-001',
        isCompleted: false,
        horse: { name: 'Flash' },
      };

      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);
      prisma.dailyCareTask.update.mockResolvedValue({ ...mockTask, isCompleted: true });

      const user = { userId: 'groom-1', role: Role.GROOM, fullName: 'Groom Nam' } as any;
      const res = await service.completeTask('task-1', { notes: 'Đã ăn hết khẩu phần' }, user);

      expect(res.isCompleted).toBe(true);
      expect(prisma.dailyCareTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isCompleted: true,
            completedById: 'groom-1',
            undoUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('allows undo within the 15-minute window', async () => {
      const futureUndo = new Date(Date.now() + 10 * 60 * 1000); // còn 10 phút
      const mockTask = {
        id: 'task-1',
        taskCode: 'TSK-001',
        isCompleted: true,
        completedById: 'groom-1',
        completedAt: new Date(),
        undoUntil: futureUndo,
        horse: { name: 'Flash' },
      };

      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);
      prisma.dailyCareTask.update.mockResolvedValue({ ...mockTask, isCompleted: false });

      const user = { userId: 'groom-1', role: Role.GROOM, fullName: 'Groom Nam' } as any;
      const res = await service.uncompleteTask('task-1', user);

      expect(res.isCompleted).toBe(false);
      expect(prisma.dailyCareTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isCompleted: false,
            completedAt: null,
            completedById: null,
          }),
        }),
      );
    });

    it('rejects undo after the 15-minute window expires for groom', async () => {
      const pastUndo = new Date(Date.now() - 5 * 60 * 1000); // đã quá hạn 5 phút
      const mockTask = {
        id: 'task-1',
        isCompleted: true,
        completedById: 'groom-1',
        completedAt: new Date(Date.now() - 20 * 60 * 1000),
        undoUntil: pastUndo,
        horse: { name: 'Flash' },
      };

      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);

      const user = { userId: 'groom-1', role: Role.GROOM, fullName: 'Groom Nam' } as any;
      await expect(service.uncompleteTask('task-1', user)).rejects.toThrow(BadRequestException);
    });

    it('prevents another groom from undoing someone else task', async () => {
      const mockTask = {
        id: 'task-1',
        isCompleted: true,
        completedById: 'groom-original',
        undoUntil: new Date(Date.now() + 10 * 60 * 1000),
        horse: { name: 'Flash' },
      };

      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);

      const anotherGroom = {
        userId: 'groom-other',
        role: Role.GROOM,
        fullName: 'Other Groom',
      } as any;
      await expect(service.uncompleteTask('task-1', anotherGroom)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows Club Manager to uncomplete task even after 15 minutes window', async () => {
      const pastUndo = new Date(Date.now() - 30 * 60 * 1000);
      const mockTask = {
        id: 'task-feed',
        taskCode: 'TSK-002',
        isCompleted: true,
        taskType: DailyTaskType.FEEDING,
        stallZoneId: 'zone-1',
        itemsSnapshotJson: [{ supplyId: 's1', amount: 2 }],
        completedById: 'groom-1',
        undoUntil: pastUndo,
        horse: { name: 'Flash' },
      };

      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);
      prisma.dailyCareTask.update.mockResolvedValue({ ...mockTask, isCompleted: false });

      const manager = { userId: 'mgr-1', role: Role.CLUB_MANAGER, fullName: 'Manager' } as any;
      const res = await service.uncompleteTask('task-feed', manager);

      expect(res.isCompleted).toBe(false);
      expect(inventoryService.restoreStockForFeeding).toHaveBeenCalledWith(
        'zone-1',
        mockTask.itemsSnapshotJson,
      );
    });

    it('returns task directly if already not completed', async () => {
      const mockTask = { id: 'task-incomplete', isCompleted: false };
      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);

      const res = await service.uncompleteTask('task-incomplete', {
        userId: 'u1',
        role: Role.CLUB_MANAGER,
      } as any);
      expect(res).toBe(mockTask);
    });

    it('throws NotFoundException if task does not exist on uncompleteTask', async () => {
      prisma.dailyCareTask.findUnique.mockResolvedValue(null);
      await expect(
        service.uncompleteTask('not-found', { userId: 'u1', role: Role.CLUB_MANAGER } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('completeTask', () => {
    it('returns task directly if already completed', async () => {
      const mockTask = { id: 'task-completed', isCompleted: true };
      prisma.dailyCareTask.findUnique.mockResolvedValue(mockTask);

      const res = await service.completeTask('task-completed', {}, {
        userId: 'u1',
        role: Role.GROOM,
      } as any);
      expect(res).toBe(mockTask);
    });

    it('throws NotFoundException if task does not exist on completeTask', async () => {
      prisma.dailyCareTask.findUnique.mockResolvedValue(null);
      await expect(
        service.completeTask('not-found', {}, { userId: 'u1', role: Role.GROOM } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('queries tasks for a date with filtering and groom shift zones', async () => {
      prisma.dailyCareTask.count.mockResolvedValueOnce(5); // existing count > 0
      prisma.shiftRoster.findMany.mockResolvedValue([{ zoneId: 'zone-1' }]);

      const mockTasks = [
        { id: 't1', isCompleted: true, isMedicalLocked: false, scheduledTime: '07:00' },
        { id: 't2', isCompleted: false, isMedicalLocked: true, scheduledTime: '09:00' },
      ];
      prisma.dailyCareTask.findMany.mockResolvedValue(mockTasks);
      prisma.dailyCareTask.count.mockResolvedValueOnce(2);

      const user = { userId: 'groom-1', role: Role.GROOM, fullName: 'Groom 1' } as any;
      const res = await service.findAll(
        {
          date: '2026-10-18',
          zoneId: 'zone-1',
          horseId: 'horse-1',
          taskType: DailyTaskType.CLEANING,
          isCompleted: false,
          onlyMine: true,
        },
        user,
      );

      expect(res.stats.total).toBe(2);
      expect(res.stats.completed).toBe(1);
      expect(res.stats.pending).toBe(1);
      expect(res.stats.medicalLockedCount).toBe(1);
    });
  });

  describe('generateDailyTasksForDate edge cases', () => {
    it('generates recovery ice boot tasks for medical locked horse and fallback feeding meals', async () => {
      const mockHorse = {
        id: 'horse-med',
        name: 'Injured Star',
        deletedAt: null,
        isMedicalLocked: true,
        stallAllocations: [
          {
            isActive: true,
            assignedGroomUserId: 'groom-2',
            stall: { id: 'stall-2', zoneId: 'zone-2' },
          },
        ],
        medicalLocks: [{ reason: 'Khớp gối sưng phù, cần chườm đá' }],
        nutritionPlans: [], // Không có kế hoạch dinh dưỡng chi tiết -> fallback tiêu chuẩn
      };

      prisma.horse.findMany.mockResolvedValue([mockHorse]);
      prisma.dailyCareTask.findFirst.mockResolvedValue(null);
      prisma.dailyCareTask.create.mockResolvedValue({ id: 'task-created' });

      const res = await service.generateDailyTasksForDate(
        new Date('2026-10-18T00:00:00Z'),
        'zone-2',
      );
      expect(res.horsesProcessed).toBe(1);
      expect(res.totalGenerated).toBeGreaterThanOrEqual(4);
    });
  });
});
