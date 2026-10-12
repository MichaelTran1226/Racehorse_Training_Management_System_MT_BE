import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { HorseStatus, Role, UserStatus } from '@prisma/client';
import { HorsesService } from './horses.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

describe('HorsesService', () => {
  let service: HorsesService;
  let prisma: any;
  let audit: any;

  const mockManager: CurrentUserPayload = {
    userId: 'manager-1',
    email: 'manager@gmail.com',
    fullName: 'Manager User',
    role: UserRole.CLUB_MANAGER,
  };

  const mockOwner: CurrentUserPayload = {
    userId: 'owner-1',
    email: 'owner@gmail.com',
    fullName: 'Owner User',
    role: UserRole.HORSE_OWNER,
  };

  const mockGroom: CurrentUserPayload = {
    userId: 'groom-1',
    email: 'groom@gmail.com',
    fullName: 'Groom User',
    role: UserRole.GROOM,
  };

  beforeEach(async () => {
    prisma = {
      // $transaction chạy callback với chính đối tượng giả; $queryRaw (FOR UPDATE) trả rỗng
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([]),
      horse: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      stallAllocation: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      stall: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      medicalLock: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      trainingPlan: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      workoutSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HorsesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<HorsesService>(HorsesService);
  });

  describe('generateHorseCode', () => {
    it('should generate HR-000001 when count is 0', async () => {
      prisma.horse.count.mockResolvedValue(0);
      prisma.horse.findUnique.mockResolvedValue(null);

      const code = await service.generateHorseCode();
      expect(code).toBe('HR-000001');
    });

    it('should increment when collision occurs', async () => {
      prisma.horse.count.mockResolvedValue(0);
      prisma.horse.findUnique.mockResolvedValueOnce({ id: 'exists' }).mockResolvedValueOnce(null);

      const code = await service.generateHorseCode();
      expect(code).toBe('HR-000002');
    });
  });

  describe('create', () => {
    it('should create horse with default status RESTING and auto code', async () => {
      prisma.horse.findFirst.mockResolvedValue(null);
      prisma.horse.findUnique.mockResolvedValue(null);
      prisma.horse.count.mockResolvedValue(0);

      const createdMock = {
        id: 'h-1',
        horseCode: 'HR-000001',
        name: 'Thunderbolt',
        breed: 'Thoroughbred',
        dob: new Date('2021-01-01'),
        gender: 'Colt',
        color: 'Bay',
        microchip: '123456789012345',
        rfid: 'RFID-12345',
        microchipRfid: '123456789012345',
        status: HorseStatus.RESTING,
        isMedicalLocked: false,
        stallAllocations: [],
      };
      prisma.horse.create.mockResolvedValue(createdMock);

      const res = await service.create(
        {
          name: 'Thunderbolt',
          breed: 'Thoroughbred',
          dob: '2021-01-01',
          gender: 'Colt',
          color: 'Bay',
          microchip: '123456789012345',
          rfid: 'RFID-12345',
        },
        mockManager,
      );

      expect(res.horseCode).toBe('HR-000001');
      expect(res.status).toBe(HorseStatus.RESTING);
      expect(audit.record).toHaveBeenCalled();
    });

    it('should occupy the chosen stall inside the same transaction', async () => {
      prisma.horse.findFirst.mockResolvedValue(null);
      prisma.horse.findUnique.mockResolvedValue(null);
      prisma.stall.findUnique.mockResolvedValue({
        id: 'st-1',
        status: 'AVAILABLE',
        allocations: [],
      });
      prisma.horse.create.mockResolvedValue({ id: 'h-2', name: 'Gió Bấc', stallAllocations: [] });

      await service.create(
        {
          name: 'Gió Bấc',
          breed: 'Thoroughbred',
          dob: '2021-01-01',
          gender: 'Colt',
          color: 'Bay',
          microchip: '123456789012346',
          stallId: 'st-1',
        },
        mockManager,
      );

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.horse.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'RESTING' }) }),
      );
      expect(prisma.stall.update).toHaveBeenCalledWith({
        where: { id: 'st-1' },
        data: { status: 'OCCUPIED' },
      });
    });

    it('should throw 409 STALL_OCCUPIED when the chosen stall already has a horse', async () => {
      prisma.horse.findFirst.mockResolvedValue(null);
      prisma.horse.findUnique.mockResolvedValue(null);
      prisma.stall.findUnique.mockResolvedValue({
        id: 'st-1',
        status: 'OCCUPIED',
        allocations: [{ id: 'a-1' }],
      });

      await expect(
        service.create(
          {
            name: 'Gió Bấc',
            breed: 'Thoroughbred',
            dob: '2021-01-01',
            gender: 'Colt',
            color: 'Bay',
            microchip: '123456789012346',
            stallId: 'st-1',
          },
          mockManager,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: expect.objectContaining({ code: 'STALL_OCCUPIED' }),
      });
      expect(prisma.horse.create).not.toHaveBeenCalled();
    });

    it('should throw 409 DUPLICATE_NAME if horse name exists', async () => {
      prisma.horse.findFirst.mockResolvedValueOnce({ id: 'h-existing', name: 'Thunderbolt' });

      await expect(
        service.create(
          {
            name: 'Thunderbolt',
            breed: 'Thoroughbred',
            dob: '2021-01-01',
            gender: 'Colt',
            color: 'Bay',
            microchip: '123456789012345',
          },
          mockManager,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: expect.objectContaining({ code: 'DUPLICATE_NAME' }),
      });
    });

    it('should throw 409 DUPLICATE_MICROCHIP if microchip exists', async () => {
      prisma.horse.findFirst
        .mockResolvedValueOnce(null) // name check ok
        .mockResolvedValueOnce({ id: 'h-existing', microchip: '123456789012345' }); // microchip exists

      await expect(
        service.create(
          {
            name: 'New Horse',
            breed: 'Thoroughbred',
            dob: '2021-01-01',
            gender: 'Colt',
            color: 'Bay',
            microchip: '123456789012345',
          },
          mockManager,
        ),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: expect.objectContaining({ code: 'DUPLICATE_MICROCHIP' }),
      });
    });
  });

  describe('findOne and Role Policy', () => {
    it('should mask microchip with last 4 digits for GROOM', async () => {
      const horse = {
        id: 'h-1',
        name: 'Thunderbolt',
        microchip: '123456789012345',
        microchipRfid: '123456789012345',
        stallAllocations: [{ assignedGroomUserId: 'groom-1', isActive: true }],
      };
      prisma.horse.findUnique.mockResolvedValue(horse);

      const res = await service.findOne('h-1', mockGroom);
      expect(res.microchip).toBe('***********2345');
      expect(res.microchipRfid).toBe('***********2345');
    });

    it('should hide stall information for HORSE_OWNER', async () => {
      const horse = {
        id: 'h-1',
        name: 'Thunderbolt',
        ownerId: 'owner-1',
        microchip: '123456789012345',
        stallAllocations: [{ stall: { code: 'A-01', zone: 'Zone 1' }, isActive: true }],
      };
      prisma.horse.findUnique.mockResolvedValue(horse);

      const res = await service.findOne('h-1', mockOwner);
      expect(res.stallCode).toBeNull();
      expect(res.stallAllocations).toBeUndefined();
    });

    it('should throw 404 if Owner accesses horse they do not own', async () => {
      const horse = {
        id: 'h-2',
        name: 'Other Horse',
        ownerId: 'owner-999',
        stallAllocations: [],
      };
      prisma.horse.findUnique.mockResolvedValue(horse);

      await expect(service.findOne('h-2', mockOwner)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: expect.objectContaining({ code: 'HORSE_NOT_FOUND' }),
      });
    });
  });

  describe('transferOwner', () => {
    it('should transfer ownership to a valid new owner and record audit log', async () => {
      const existingHorse = {
        id: 'h-1',
        name: 'Thunderbolt',
        status: HorseStatus.ACTIVE,
        ownerId: 'owner-old',
        owner: { id: 'owner-old', fullName: 'Old Owner', email: 'old@gmail.com' },
      };
      const newOwner = {
        id: 'owner-new',
        fullName: 'New Owner',
        email: 'new@gmail.com',
        role: Role.HORSE_OWNER,
        status: UserStatus.ACTIVE,
      };
      const updatedHorse = {
        ...existingHorse,
        ownerId: 'owner-new',
        owner: newOwner,
        stallAllocations: [],
      };

      prisma.horse.findUnique.mockResolvedValue(existingHorse);
      prisma.user.findUnique.mockResolvedValue(newOwner);
      prisma.horse.update.mockResolvedValue(updatedHorse);

      const res = await service.transferOwner(
        'h-1',
        { newOwnerId: 'owner-new', reason: 'Syndicate sale agreement' },
        mockManager,
      );

      expect(res.ownerId).toBe('owner-new');
      expect(prisma.horse.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'h-1' },
          data: { ownerId: 'owner-new' },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        'HORSE_OWNERSHIP_TRANSFERRED',
        expect.stringContaining('Transferred ownership of horse'),
        'h-1',
        expect.anything(),
      );
    });

    it('should throw 400 ALREADY_OWNED if horse already belongs to newOwnerId', async () => {
      const existingHorse = {
        id: 'h-1',
        name: 'Thunderbolt',
        status: HorseStatus.ACTIVE,
        ownerId: 'owner-same',
        owner: { id: 'owner-same', fullName: 'Same Owner' },
      };

      prisma.horse.findUnique.mockResolvedValue(existingHorse);

      await expect(
        service.transferOwner('h-1', { newOwnerId: 'owner-same' }, mockManager),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: expect.objectContaining({ code: 'ALREADY_OWNED' }),
      });
    });

    it('should throw 400 HORSE_RETIRED if horse status is RETIRED', async () => {
      const retiredHorse = {
        id: 'h-1',
        name: 'Thunderbolt',
        status: HorseStatus.RETIRED,
        ownerId: 'owner-1',
      };

      prisma.horse.findUnique.mockResolvedValue(retiredHorse);

      await expect(
        service.transferOwner('h-1', { newOwnerId: 'owner-new' }, mockManager),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: expect.objectContaining({ code: 'HORSE_RETIRED' }),
      });
    });

    it('should throw 400 INVALID_NEW_OWNER if new owner does not have HORSE_OWNER role', async () => {
      const existingHorse = {
        id: 'h-1',
        name: 'Thunderbolt',
        status: HorseStatus.ACTIVE,
        ownerId: 'owner-1',
      };
      const invalidRoleUser = {
        id: 'user-trainer',
        role: Role.HEAD_TRAINER,
        status: UserStatus.ACTIVE,
      };

      prisma.horse.findUnique.mockResolvedValue(existingHorse);
      prisma.user.findUnique.mockResolvedValue(invalidRoleUser);

      await expect(
        service.transferOwner('h-1', { newOwnerId: 'user-trainer' }, mockManager),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: expect.objectContaining({ code: 'INVALID_NEW_OWNER' }),
      });
    });
  });

  describe('remove (soft delete)', () => {
    const cleanHorse = {
      id: 'h-clean',
      name: 'Clean Horse',
      horseCode: 'HR-000009',
      isMedicalLocked: false,
      workoutSessions: [],
      trainingPlans: [],
      medicalRecords: [],
      injuryLogs: [],
      medicalLocks: [],
      preventiveSchedules: [],
      nutritionPlans: [],
      dailyGroomingLogs: [],
      tournamentRegistrations: [],
      financialInvoices: [],
    };
    const dto = { reason: 'Hồ sơ tạo nhầm, trùng ngựa khác', confirmName: '  clean   HORSE ' };

    it('should mark deletedAt, free the stall and keep the row (no hard delete)', async () => {
      prisma.horse.findUnique.mockResolvedValue(cleanHorse);
      prisma.stallAllocation.findMany.mockResolvedValue([
        { stallId: 'st-1', stall: { id: 'st-1', code: 'A-01' } },
      ]);
      prisma.horse.update.mockResolvedValue({ ...cleanHorse, deletedAt: new Date() });

      const res = await service.remove('h-clean', dto, mockManager);

      expect(res.success).toBe(true);
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.horse.delete).not.toHaveBeenCalled();
      expect(prisma.horse.update).toHaveBeenCalledWith({
        where: { id: 'h-clean' },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedById: 'manager-1',
          deleteReason: 'Hồ sơ tạo nhầm, trùng ngựa khác',
        }),
      });
      expect(prisma.stall.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['st-1'] } },
        data: { status: 'AVAILABLE' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        'HORSE_DELETED',
        expect.stringContaining('Soft-deleted'),
        'h-clean',
        expect.objectContaining({ entityName: 'Horse' }),
        prisma,
      );
    });

    it('should throw 400 CONFIRM_NAME_MISMATCH when the typed name is different', async () => {
      prisma.horse.findUnique.mockResolvedValue(cleanHorse);

      await expect(
        service.remove('h-clean', { ...dto, confirmName: 'Other Horse' }, mockManager),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: expect.objectContaining({ code: 'CONFIRM_NAME_MISMATCH' }),
      });
      expect(prisma.horse.update).not.toHaveBeenCalled();
    });

    it('should throw 400 HAS_DEPENDENT_DATA if horse has grooming, medical or training data', async () => {
      prisma.horse.findUnique.mockResolvedValue({
        ...cleanHorse,
        dailyGroomingLogs: [{ id: 'g' }],
      });

      await expect(service.remove('h-clean', dto, mockManager)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: expect.objectContaining({ code: 'HAS_DEPENDENT_DATA' }),
      });
    });

    it('should throw 400 HORSE_LOCKED if horse is medical locked', async () => {
      prisma.horse.findUnique.mockResolvedValue({ ...cleanHorse, isMedicalLocked: true });

      await expect(service.remove('h-clean', dto, mockManager)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        response: expect.objectContaining({ code: 'HORSE_LOCKED' }),
      });
    });
  });

  describe('restore', () => {
    const deletedHorse = {
      id: 'h-del',
      name: 'Sao Mai',
      horseCode: 'HR-000010',
      deletedAt: new Date(),
      deletedById: 'manager-1',
      deleteReason: 'Tạo nhầm hồ sơ',
    };

    it('should undo a delete made seconds ago with the automatic reason', async () => {
      prisma.horse.findUnique.mockResolvedValue(deletedHorse);
      prisma.horse.findFirst.mockResolvedValue(null);
      prisma.horse.update.mockResolvedValue({ ...deletedHorse, deletedAt: null });

      const res = await service.restore('h-del', { undo: true }, mockManager);

      expect(res.success).toBe(true);
      expect(prisma.horse.update).toHaveBeenCalledWith({
        where: { id: 'h-del' },
        data: { deletedAt: null, deletedById: null, deleteReason: null },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        'HORSE_RESTORED',
        expect.stringContaining('Hoàn tác thao tác xóa'),
        'h-del',
        expect.objectContaining({ entityName: 'Horse' }),
        prisma,
      );
    });

    it('should refuse undo after the undo window (UNDO_EXPIRED)', async () => {
      prisma.horse.findUnique.mockResolvedValue({
        ...deletedHorse,
        deletedAt: new Date(Date.now() - 5 * 60 * 1000),
      });

      await expect(service.restore('h-del', { undo: true }, mockManager)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'UNDO_EXPIRED' }),
      });
    });

    it('should require a reason for a normal restore', async () => {
      prisma.horse.findUnique.mockResolvedValue(deletedHorse);

      await expect(service.restore('h-del', {}, mockManager)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'REASON_REQUIRED' }),
      });
    });

    it('should throw 409 RESTORE_CONFLICT when another active horse now uses the name', async () => {
      prisma.horse.findUnique.mockResolvedValue(deletedHorse);
      prisma.horse.findFirst.mockResolvedValue({ id: 'h-other', name: 'sao mai' });

      await expect(
        service.restore('h-del', { reason: 'Xóa nhầm, cần khôi phục lại' }, mockManager),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        response: expect.objectContaining({ code: 'RESTORE_CONFLICT' }),
      });
    });

    it('should throw 404 when the horse is not in the deleted list', async () => {
      prisma.horse.findUnique.mockResolvedValue({ ...deletedHorse, deletedAt: null });

      await expect(
        service.restore('h-del', { reason: 'Xóa nhầm, cần khôi phục lại' }, mockManager),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });
  });

  describe('findDeleted', () => {
    it('should list only soft-deleted horses, newest first, with an inclusive date range', async () => {
      prisma.horse.findMany.mockResolvedValue([
        {
          ...{ id: 'h-del', name: 'Sao Mai', horseCode: 'HR-000010', microchip: '1' },
          status: HorseStatus.RESTING,
          deletedAt: new Date('2026-10-01T03:00:00Z'),
          deletedBy: { id: 'manager-1', fullName: 'Manager User' },
          deleteReason: 'Tạo nhầm hồ sơ',
        },
      ]);
      prisma.horse.count.mockResolvedValue(1);

      const res = await service.findDeleted({ from: '2026-10-01', to: '2026-10-01' });

      expect(res.total).toBe(1);
      expect(res.items[0].deletedBy).toEqual({ id: 'manager-1', fullName: 'Manager User' });
      const args = prisma.horse.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ deletedAt: 'desc' });
      expect(args.where.deletedAt).toEqual({
        not: null,
        gte: new Date('2026-10-01'),
        lt: new Date('2026-10-02'),
      });
    });
  });

  describe('changeStatus', () => {
    const mockTrainer: CurrentUserPayload = {
      userId: 'ht-1',
      email: 'ht@gmail.com',
      fullName: 'Head Trainer',
      role: UserRole.HEAD_TRAINER,
    };
    const base = {
      id: 'h-1',
      name: 'Thunder',
      status: HorseStatus.IN_TRAINING,
      isMedicalLocked: false,
      ownerId: 'owner-1',
      retireReason: null,
    };

    it('HT can move IN_TRAINING -> ACTIVE without a reason', async () => {
      prisma.horse.findUnique.mockResolvedValue(base);
      prisma.horse.update.mockResolvedValue({ ...base, status: HorseStatus.ACTIVE });

      const res = await service.changeStatus('h-1', { status: HorseStatus.ACTIVE }, mockTrainer);

      expect(res.success).toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        'HORSE_STATUS_CHANGED',
        expect.any(String),
        'h-1',
        expect.objectContaining({
          entityName: 'Horse',
          newValues: expect.objectContaining({ oldStatus: 'IN_TRAINING', newStatus: 'ACTIVE' }),
        }),
        prisma,
      );
    });

    it('CM can no longer set operational statuses directly (ROLE_RESTRICTION)', async () => {
      prisma.horse.findUnique.mockResolvedValue(base);

      await expect(
        service.changeStatus(
          'h-1',
          { status: HorseStatus.RESTING, reason: 'Cho ngựa nghỉ một tuần' },
          mockManager,
        ),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ROLE_RESTRICTION' }) });
    });

    it('CM retiring as SOLD frees the stall and ends ownership', async () => {
      prisma.horse.findUnique.mockResolvedValue(base);
      prisma.stallAllocation.findMany.mockResolvedValue([
        { stallId: 'st-1', stall: { id: 'st-1', code: 'A-01' } },
      ]);
      prisma.horse.update.mockResolvedValue({ ...base, status: HorseStatus.RETIRED });

      const res = await service.changeStatus(
        'h-1',
        { status: HorseStatus.RETIRED, retireReason: 'SOLD', reason: 'Đã bán cho CLB Phú Thọ' },
        mockManager,
      );

      expect(prisma.horse.update).toHaveBeenCalledWith({
        where: { id: 'h-1' },
        data: { status: 'RETIRED', retireReason: 'SOLD', owner: { disconnect: true } },
      });
      expect(prisma.stall.updateMany).toHaveBeenCalled();
      expect(res.effects).toEqual(['Trả ô chuồng A-01', 'Kết thúc sở hữu của 1 chủ sở hữu']);
    });

    it('retiring cancels draft / active training plans and pending workouts (Flow 2)', async () => {
      prisma.horse.findUnique.mockResolvedValue(base);
      prisma.trainingPlan.updateMany.mockResolvedValue({ count: 1 });
      prisma.horse.update.mockResolvedValue({ ...base, status: HorseStatus.RETIRED });

      const res = await service.changeStatus(
        'h-1',
        { status: HorseStatus.RETIRED, retireReason: 'RETIRED', reason: 'Giải nghệ sau mùa giải' },
        mockManager,
      );

      expect(prisma.trainingPlan.updateMany).toHaveBeenCalledWith({
        where: { horseId: 'h-1', status: { in: ['DRAFT', 'ACTIVE'] } },
        data: { status: 'CANCELLED', cancelReason: 'Ngựa ngừng quản lý' },
      });
      expect(prisma.workoutSession.updateMany).toHaveBeenCalledWith({
        where: { horseId: 'h-1', status: { in: ['SCHEDULED', 'BLOCKED', 'MISSED'] } },
        data: { status: 'CANCELLED', statusReason: 'Ngựa ngừng quản lý' },
      });
      expect(res.effects).toContain('Hủy 1 giáo án và các buổi tập chưa diễn ra');
    });

    it('CM retiring a locked horse as DECEASED also ends the training lock', async () => {
      prisma.horse.findUnique.mockResolvedValue({
        ...base,
        status: HorseStatus.INJURED,
        isMedicalLocked: true,
      });
      prisma.horse.update.mockResolvedValue({ ...base, status: HorseStatus.RETIRED });

      await service.changeStatus(
        'h-1',
        {
          status: HorseStatus.RETIRED,
          retireReason: 'DECEASED',
          reason: 'Ngựa chết do biến chứng',
        },
        mockManager,
      );

      expect(prisma.medicalLock.updateMany).toHaveBeenCalledWith({
        where: { horseId: 'h-1', isLocked: true },
        data: expect.objectContaining({ isLocked: false }),
      });
      expect(prisma.horse.update).toHaveBeenCalledWith({
        where: { id: 'h-1' },
        data: expect.objectContaining({ isMedicalLocked: false, retireReason: 'DECEASED' }),
      });
    });

    it('CM reactivation clears retireReason and goes back to RESTING', async () => {
      prisma.horse.findUnique.mockResolvedValue({
        ...base,
        status: HorseStatus.RETIRED,
        retireReason: 'RETIRED',
      });
      prisma.horse.update.mockResolvedValue({ ...base, status: HorseStatus.RESTING });

      await service.changeStatus(
        'h-1',
        { status: HorseStatus.RESTING, reason: 'Ngựa quay lại thi đấu mùa sau' },
        mockManager,
      );

      expect(prisma.horse.update).toHaveBeenCalledWith({
        where: { id: 'h-1' },
        data: { status: 'RESTING', retireReason: null },
      });
    });

    it('should return 404 for a soft-deleted horse', async () => {
      prisma.horse.findUnique.mockResolvedValue(null);

      await expect(
        service.changeStatus('h-1', { status: HorseStatus.ACTIVE }, mockTrainer),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(prisma.horse.findUnique).toHaveBeenCalledWith({
        where: { id: 'h-1', deletedAt: null },
      });
    });
  });

  describe('getHistory', () => {
    it('should aggregate unified history and timeline correctly', async () => {
      const mockHistoryHorse = {
        id: 'h-1',
        horseCode: 'HR-000001',
        name: 'Thunderbolt Swift',
        breed: 'Thoroughbred',
        status: HorseStatus.ACTIVE,
        isMedicalLocked: false,
        createdAt: new Date('2026-01-01'),
        owner: { id: 'owner-1', fullName: 'Owner User' },
        stallAllocations: [
          {
            id: 'sa-1',
            stall: { code: 'STALL-A01', zone: 'Zone A' },
            assignedGroom: { fullName: 'Groom User' },
            startDate: new Date('2026-01-02'),
            endDate: null,
            isActive: true,
          },
        ],
        medicalRecords: [
          {
            id: 'mr-1',
            examinationDate: new Date('2026-02-01'),
            clinicalDiagnosis: 'Mild tendon sensitivity',
            symptoms: 'Heat in foreleg',
            treatmentProtocol: 'Cold compress',
            veterinarian: { fullName: 'Dr. Sarah Connor' },
          },
        ],
        injuryLogs: [],
        medicalLocks: [
          {
            id: 'ml-1',
            lockCode: 'KH-000001',
            lockedAt: new Date('2026-02-01'),
            lockReason: 'Rest period',
            isLocked: false,
            unlockedAt: new Date('2026-02-10'),
            unlockReason: 'Recovered',
            veterinarian: { fullName: 'Dr. Sarah Connor' },
            unlockVet: { fullName: 'Dr. Sarah Connor' },
          },
        ],
        trainingPlans: [
          {
            id: 'tp-1',
            phaseName: 'Base Conditioning',
            targetSpeed: 40,
            targetDistance: 1200,
            trackSurface: 'TURF',
            startDate: new Date('2026-03-01'),
            endDate: new Date('2026-03-30'),
            status: 'APPROVED',
            createdAt: new Date('2026-03-01'),
            trainer: { fullName: 'David Nguyen' },
            workoutSessions: [{ status: 'COMPLETED' }],
          },
        ],
        tournamentRegistrations: [],
      };

      prisma.horse.findUnique.mockResolvedValue(mockHistoryHorse);
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'aud-1',
          action: 'HORSE_STATUS_CHANGED',
          timestamp: new Date('2026-02-01'),
          user: { fullName: 'Dr. Sarah Connor' },
          newValuesJson: JSON.stringify({ oldStatus: 'ACTIVE', newStatus: 'UNDER_OBSERVATION' }),
        },
      ]);

      const result = await service.getHistory('h-1', mockManager);
      expect(result).toBeDefined();
      expect(result.horse.name).toBe('Thunderbolt Swift');
      expect(result.statusHistory).toHaveLength(1);
      expect(result.stallHistory).toHaveLength(1);
      expect(result.medicalHistory.records).toHaveLength(1);
      expect(result.trainingHistory).toHaveLength(1);
      expect(result.timeline.length).toBeGreaterThanOrEqual(4);
    });

    it('should throw 404 HORSE_NOT_FOUND if horse does not exist', async () => {
      prisma.horse.findUnique.mockResolvedValue(null);
      await expect(service.getHistory('non-existent', mockManager)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });
});
