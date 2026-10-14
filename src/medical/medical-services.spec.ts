import { Test, TestingModule } from '@nestjs/testing';
import { MedicalAccessService } from './medical-access.service';
import { InjuriesService } from './injuries.service';
import { MedicalLocksService } from './medical-locks.service';
import { MedicalRecordsService } from './medical-records.service';
import { HealthOverviewService } from './health-overview.service';
import { PreventiveCareService } from './preventive-care.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Role } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { notificationsMock } from '../notifications/notifications.testing';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';

// Flow 3: các service y tế sau khi tách (C-10), dùng chung một bộ Prisma giả.
describe('Medical services', () => {
  let injuries: InjuriesService;
  let locks: MedicalLocksService;
  let records: MedicalRecordsService;
  let overview: HealthOverviewService;
  let preventive: PreventiveCareService;

  const mockPrismaService: any = {
    $transaction: jest.fn((fn: (tx: any) => unknown) => fn(mockPrismaService)),
    $queryRaw: jest.fn().mockResolvedValue([]),
    horse: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    medicalRecord: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    medicalLock: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    trainingPlan: {
      updateMany: jest.fn(),
    },
    workoutSession: {
      updateMany: jest.fn(),
    },
    injuryLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    preventiveTypeCatalog: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    preventiveSchedule: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const mockAuditService = {
    record: jest.fn(),
  };

  const mockVetUser = {
    userId: 'vet-1',
    email: 'vet@example.com',
    fullName: 'Dr. John Vet',
    role: Role.VETERINARIAN,
  };

  const mockManagerUser = {
    userId: 'cm-1',
    email: 'cm@example.com',
    fullName: 'Club Manager',
    role: Role.CLUB_MANAGER,
  };

  const mockOwnerUser = {
    userId: 'owner-1',
    email: 'owner@example.com',
    fullName: 'Horse Owner',
    role: Role.HORSE_OWNER,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalAccessService,
        InjuriesService,
        MedicalLocksService,
        MedicalRecordsService,
        HealthOverviewService,
        PreventiveCareService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
        notificationsMock(),
      ],
    }).compile();

    injuries = module.get(InjuriesService);
    locks = module.get(MedicalLocksService);
    records = module.get(MedicalRecordsService);
    overview = module.get(HealthOverviewService);
    preventive = module.get(PreventiveCareService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(records).toBeDefined();
  });

  describe('getHealthBoard scope (C-03)', () => {
    const user = (role: string, userId = 'u-1') => ({
      userId,
      role,
      email: 'a@gmail.com',
      fullName: 'A',
    });
    const whereOf = () => mockPrismaService.horse.findMany.mock.calls[0][0].where;

    beforeEach(() => mockPrismaService.horse.findMany.mockResolvedValue([]));

    it('should limit a Horse Owner to the horses they own', async () => {
      await overview.getHealthBoard({}, user('HORSE_OWNER', 'owner-1'));
      expect(whereOf().ownerId).toBe('owner-1');
    });

    it('should limit a Groom to the horses in their care', async () => {
      await overview.getHealthBoard({}, user('GROOM', 'groom-1'));
      expect(whereOf().stallAllocations).toEqual({
        some: { isActive: true, assignedGroomUserId: 'groom-1' },
      });
    });

    it('should show the whole herd to a Veterinarian', async () => {
      await overview.getHealthBoard({}, user('VETERINARIAN'));
      expect(whereOf().ownerId).toBeUndefined();
      expect(whereOf().stallAllocations).toBeUndefined();
    });
  });

  describe('createMedicalRecord', () => {
    it('should not let a Club Manager create a medical record (VET_ONLY)', async () => {
      const error = await records
        .createMedicalRecord(mockManagerUser, { horseId: 'horse-1' } as any)
        .catch((e) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'VET_ONLY' }));
    });

    it('should throw ForbiddenException if user is not VETERINARIAN or CLUB_MANAGER', async () => {
      await expect(
        records.createMedicalRecord(mockOwnerUser, {
          horseId: 'horse-1',
          examinationType: 'Khám bệnh',
          reason: 'Lý do khám bệnh chi tiết',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if horse does not exist', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue(null);

      await expect(
        records.createMedicalRecord(mockVetUser, {
          horseId: 'non-existent-horse',
          examinationType: 'Khám bệnh',
          reason: 'Lý do khám bệnh chi tiết',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create medical record successfully', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue({ id: 'horse-1', name: 'Thunder' });
      mockPrismaService.medicalRecord.create.mockResolvedValue({
        id: 'rec-1',
        horseId: 'horse-1',
        veterinarianUserId: mockVetUser.userId,
        symptoms: 'Triệu chứng sốt',
        clinicalDiagnosis: 'Cảm cúm',
      });

      const result = await records.createMedicalRecord(mockVetUser, {
        horseId: 'horse-1',
        examinationType: 'Khám bệnh',
        reason: 'Triệu chứng sốt',
        diagnosis: 'Cảm cúm',
      });

      expect(result.id).toBe('rec-1');
      expect(mockAuditService.record).toHaveBeenCalled();
    });
  });

  describe('getMedicalRecordDetail', () => {
    it('should throw NotFoundException if record not found', async () => {
      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(null);

      await expect(records.getMedicalRecordDetail('invalid-id', mockVetUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return record detail for veterinarian', async () => {
      const mockRecord = {
        id: 'rec-1',
        horseId: 'horse-1',
        symptoms: 'Khớp sưng nhẹ',
        clinicalDiagnosis: 'Viêm khớp nhẹ',
        treatmentProtocol: 'Nghỉ ngơi 3 ngày',
        prescriptionDetails: JSON.stringify([{ medicationName: 'Aspirin' }]),
      };
      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(mockRecord);

      const result = await records.getMedicalRecordDetail('rec-1', mockVetUser);
      expect(result.id).toBe(mockRecord.id);
      expect(result.horseId).toBe(mockRecord.horseId);
      expect(result.symptoms).toBe(mockRecord.symptoms);
    });
  });

  describe('closeMedicalRecord', () => {
    it('should close medical record with conclusion', async () => {
      const mockRecord = {
        id: 'rec-1',
        treatmentProtocol: 'Phác đồ ban đầu',
      };
      mockPrismaService.medicalRecord.findUnique.mockResolvedValue(mockRecord);
      mockPrismaService.medicalRecord.update.mockResolvedValue({
        ...mockRecord,
        treatmentProtocol: 'Phác đồ ban đầu\n[KẾT LUẬN]: Đã phục hồi hoàn toàn',
      });

      const result = await records.closeMedicalRecord('rec-1', mockVetUser, {
        conclusion: 'Đã phục hồi hoàn toàn',
      });

      expect(result.treatmentProtocol).toContain('Đã phục hồi hoàn toàn');
      expect(mockAuditService.record).toHaveBeenCalled();
    });
  });

  describe('MedicalLock (Task P2-04)', () => {
    it('should throw ForbiddenException if user is not VETERINARIAN or CLUB_MANAGER when creating lock', async () => {
      await expect(
        locks.createMedicalLock(mockOwnerUser, {
          horseId: 'horse-1',
          lockReason: 'Test',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user is not VETERINARIAN or CLUB_MANAGER when releasing lock', async () => {
      await expect(
        locks.releaseMedicalLock('lock-1', mockOwnerUser, {
          unlockReason: 'Test',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create medical lock with auto lockCode, impact assessment, and update horse status', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue({
        id: 'horse-1',
        name: 'Thunder',
        status: 'ACTIVE',
        medicalLocks: [],
        isMedicalLocked: false,
      });
      mockPrismaService.medicalLock.findFirst.mockResolvedValue(null);
      mockPrismaService.medicalLock.count.mockResolvedValue(0);
      mockPrismaService.medicalLock.create.mockResolvedValue({
        id: 'lock-1',
        lockCode: 'KH-000001',
        horseId: 'horse-1',
        isLocked: true,
        recheckDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const result = await locks.createMedicalLock(mockVetUser, {
        horseId: 'horse-1',
        expectedRestDays: 7,
        lockReason: 'Chấn thương cơ đùi nghiêm trọng',
        unlockConditions: 'Hết sưng và chạy bình thường',
      });

      expect(result.id).toBe('lock-1');
      expect(result.impactAssessment).toBeDefined();
      expect(result.impactAssessment.notificationRecipients).toHaveLength(4);
      expect(mockPrismaService.horse.update).toHaveBeenCalledWith({
        where: { id: 'horse-1' },
        data: expect.objectContaining({ isMedicalLocked: true, status: 'INJURED' }),
      });
      // Flow 2 Q-2.01: giáo án giữ nguyên, chỉ buổi tập nặng đã lên lịch bị chặn.
      expect(mockPrismaService.trainingPlan.updateMany).not.toHaveBeenCalled();
      expect(mockPrismaService.workoutSession.updateMany).toHaveBeenCalledWith({
        where: {
          horseId: 'horse-1',
          status: 'SCHEDULED',
          scheduledDate: { gte: expect.any(Date) },
          OR: [{ intensity: 'HEAVY' }, { workoutType: { in: ['BREEZE', 'TRIAL'] } }],
        },
        data: expect.objectContaining({ status: 'BLOCKED' }),
      });
      // Mọi lệnh ghi chạy trong một transaction, dòng Horse bị khóa trước khi kiểm khóa trùng.
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.anything(),
        'CREATE_MEDICAL_LOCK',
        expect.any(String),
        'lock-1',
        { entityName: 'MedicalLock' },
        mockPrismaService,
      );
    });

    it('should not let a Club Manager place a training lock (VET_ONLY)', async () => {
      const error = await locks
        .createMedicalLock(mockManagerUser, { horseId: 'horse-1', lockReason: 'Test' })
        .catch((e) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'VET_ONLY' }));
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if horse already has active lock', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue({
        id: 'horse-1',
        name: 'Thunder',
        isMedicalLocked: true,
      });
      mockPrismaService.medicalLock.findFirst.mockResolvedValue({ id: 'lock-old', isLocked: true });

      await expect(
        locks.createMedicalLock(mockVetUser, {
          horseId: 'horse-1',
          lockReason: 'Thử khóa lại con ngựa đã bị khóa',
        }),
      ).rejects.toThrow('This horse already has an active Training Lock.');
    });

    it('should release medical lock and check warning flags', async () => {
      mockPrismaService.medicalLock.findUnique.mockResolvedValue({
        id: 'lock-1',
        lockCode: 'KH-000001',
        horseId: 'horse-1',
        isLocked: true,
        horse: {
          id: 'horse-1',
          name: 'Thunder',
          injuryLogs: [{ id: 'inj-1', stage: 'ACUTE' }],
        },
      });
      mockPrismaService.medicalLock.update.mockResolvedValue({
        id: 'lock-1',
        lockCode: 'KH-000001',
        isLocked: false,
        horse: { id: 'horse-1', name: 'Thunder' },
      });

      const result = await locks.releaseMedicalLock('lock-1', mockVetUser, {
        unlockReason: 'Đã khỏi hoàn toàn và đủ điều kiện vận động',
        newHorseStatus: 'RESTING' as any,
      });

      expect(result.isLocked).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('giai đoạn Cấp tính');
      expect(mockPrismaService.horse.update).toHaveBeenCalledWith({
        where: { id: 'horse-1' },
        data: expect.objectContaining({ isMedicalLocked: false, status: 'RESTING' }),
      });
    });

    it('should extend medical lock with new recheck date and history timeline', async () => {
      const currentRecheck = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const newRecheck = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      mockPrismaService.medicalLock.findUnique.mockResolvedValue({
        id: 'lock-1',
        lockCode: 'KH-000001',
        isLocked: true,
        lockedAt: new Date(),
        recheckDate: currentRecheck,
        extensionHistory: null,
      });

      mockPrismaService.medicalLock.update.mockResolvedValue({
        id: 'lock-1',
        lockCode: 'KH-000001',
        recheckDate: newRecheck,
        isLocked: true,
      });

      const result = await locks.extendMedicalLock('lock-1', mockVetUser, {
        recheckDate: newRecheck.toISOString(),
        recheckNotes: 'Cần thêm 7 ngày điều trị dứt điểm',
      });

      expect(result.recheckDate).toEqual(newRecheck);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.anything(),
        'EXTEND_MEDICAL_LOCK',
        expect.any(String),
        'lock-1',
        { entityName: 'MedicalLock' },
        mockPrismaService,
      );
    });

    it('should query medical locks with overdue status calculation', async () => {
      const pastRecheck = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      mockPrismaService.medicalLock.count.mockResolvedValue(1);
      mockPrismaService.medicalLock.findMany.mockResolvedValue([
        {
          id: 'lock-1',
          lockCode: 'KH-000001',
          isLocked: true,
          lockedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          recheckDate: pastRecheck,
          horse: { id: 'h1', name: 'Thunder' },
        },
      ]);

      const result = await locks.getMedicalLocks(mockVetUser, { overdueOnly: 'true' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].isOverdue).toBe(true);
      expect(result.data[0].daysOverdue).toBeGreaterThanOrEqual(3);
    });
  });

  describe('2D Injury Model & Recovery Progress', () => {
    it('should create 2D injury point with initial recovery history', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue({
        id: 'horse-1',
        name: 'Thunder',
        medicalLocks: [],
        isMedicalLocked: false,
      });
      const mockCreatedInjury = {
        id: 'inj-1',
        horseId: 'horse-1',
        coordinateX: 0.45,
        coordinateY: 0.6,
        anatomicalZone: 'Chân trước trái - Gân gấp',
        injuryType: 'Viêm gân',
        severity: 'SEVERE',
        stage: 'ACUTE',
        status: 'ACTIVE',
      };
      mockPrismaService.injuryLog.create.mockResolvedValue(mockCreatedInjury);

      const result = await injuries.createInjury(mockVetUser, {
        horseId: 'horse-1',
        coordinateX: 0.45,
        coordinateY: 0.6,
        anatomicalZone: 'Chân trước trái - Gân gấp',
        injuryType: 'Viêm gân',
        severity: 'SEVERE' as any,
      });

      expect(result.id).toBe('inj-1');
      expect(result.recommendMedicalLock).toBe(true);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.anything(),
        'CREATE_INJURY_LOG',
        expect.any(String),
        'inj-1',
        { entityName: 'InjuryLog' },
      );
    });

    it('should get 2D injuries of a horse and filter healed ones by default', async () => {
      mockPrismaService.injuryLog.findMany.mockResolvedValue([
        { id: 'inj-1', horseId: 'horse-1', stage: 'ACUTE', status: 'ACTIVE' },
        { id: 'inj-2', horseId: 'horse-1', stage: 'HEALED', status: 'RESOLVED' },
      ]);

      const result = await injuries.getHorseInjuries('horse-1', mockVetUser, {});
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('inj-1');
    });

    it('should delete injury if created within 24 hours and no recovery updates', async () => {
      mockPrismaService.injuryLog.findUnique.mockResolvedValue({
        id: 'inj-1',
        createdAt: new Date(),
        recoveryHistory: [{ id: 'hist-1', stage: 'ACUTE' }],
      });
      mockPrismaService.injuryLog.delete.mockResolvedValue({ id: 'inj-1' });

      const res = await injuries.deleteInjury('inj-1', mockVetUser);
      expect(res.message).toBe('Đã xóa điểm chấn thương thành công');
      expect(mockPrismaService.injuryLog.delete).toHaveBeenCalledWith({ where: { id: 'inj-1' } });
    });

    it('should update recovery progress to HEALED and set status to RESOLVED', async () => {
      mockPrismaService.injuryLog.findUnique.mockResolvedValue({
        id: 'inj-1',
        stage: 'RECOVERING',
        severity: 'MILD',
        recoveryHistory: [{ id: 'hist-1', stage: 'RECOVERING' }],
      });
      mockPrismaService.injuryLog.update.mockResolvedValue({
        id: 'inj-1',
        stage: 'HEALED',
        status: 'RESOLVED',
      });

      const res = await injuries.updateRecoveryProgress('inj-1', mockVetUser, {
        stage: 'HEALED',
        notes: 'Chấn thương đã bình phục hoàn toàn',
      });

      expect(res.stage).toBe('HEALED');
      expect(mockPrismaService.injuryLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inj-1' },
          data: expect.objectContaining({
            stage: 'HEALED',
            status: 'RESOLVED',
          }),
        }),
      );
    });
  });

  describe('Preventive Care & Catalogs (P2-05)', () => {
    it('should create a preventive type catalog', async () => {
      mockPrismaService.preventiveTypeCatalog.findUnique.mockResolvedValue(null);
      mockPrismaService.preventiveTypeCatalog.create.mockResolvedValue({
        id: 'cat-1',
        code: 'VAC_INFLUENZA',
        name: 'Tiêm cúm ngựa',
        category: 'VACCINATION',
        intervalDays: 180,
        advanceNoticeDays: 14,
        isActive: true,
      });

      const res = await preventive.createPreventiveCatalog(mockVetUser, {
        code: 'vac_influenza',
        name: 'Tiêm cúm ngựa',
        category: 'VACCINATION' as any,
        intervalDays: 180,
        advanceNoticeDays: 14,
      });

      expect(res.code).toBe('VAC_INFLUENZA');
      expect(mockPrismaService.preventiveTypeCatalog.create).toHaveBeenCalled();
    });

    it('should record preventive care for single horse', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue({ id: 'horse-1', name: 'Thunder' });
      mockPrismaService.preventiveTypeCatalog.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Tiêm cúm',
        category: 'VACCINATION',
        intervalDays: 180,
        advanceNoticeDays: 14,
      });
      mockPrismaService.preventiveSchedule.findFirst.mockResolvedValue({
        id: 'sched-1',
        horseId: 'horse-1',
        intervalDays: 180,
        advanceNoticeDays: 14,
        historyLogs: [],
      });
      mockPrismaService.preventiveSchedule.update.mockResolvedValue({
        id: 'sched-1',
        lastCompletedDate: new Date(),
        status: 'NORMAL',
      });

      const res = await preventive.recordPreventiveCare(mockVetUser, {
        horseId: 'horse-1',
        typeCatalogId: 'cat-1',
        performedDate: new Date().toISOString(),
        productAdministered: 'Equine Influenza Vaccine',
        batchNumber: 'BATCH-001',
        performedByMode: 'INTERNAL',
      });

      expect(res.count).toBe(1);
      expect(mockPrismaService.preventiveSchedule.update).toHaveBeenCalled();
    });

    it('should setup custom preventive schedule for a horse', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue({ id: 'horse-1', name: 'Thunder' });
      mockPrismaService.preventiveTypeCatalog.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Tẩy giun',
        category: 'DEWORMING',
        intervalDays: 90,
        advanceNoticeDays: 7,
      });
      mockPrismaService.preventiveSchedule.findFirst.mockResolvedValue(null);
      mockPrismaService.preventiveSchedule.create.mockResolvedValue({
        id: 'sched-1',
        horseId: 'horse-1',
        typeCatalogId: 'cat-1',
      });

      const res = await preventive.setupHorsePreventive(mockVetUser, {
        horseId: 'horse-1',
        schedules: [
          {
            typeCatalogId: 'cat-1',
            enabled: true,
            initialDueDate: new Date().toISOString(),
          },
        ],
      });

      expect(res.message).toBe('Đã thiết lập lịch chăm sóc định kỳ cho chiến mã thành công');
      expect(mockPrismaService.preventiveSchedule.create).toHaveBeenCalled();
    });
  });

  describe('getHealthBoard (FR-3.01)', () => {
    it('should filter horses by ownerId when user is HORSE_OWNER', async () => {
      mockPrismaService.horse.findMany.mockResolvedValue([]);
      const ownerUser: CurrentUserPayload = {
        userId: 'owner-1',
        email: 'owner@example.com',
        role: Role.HORSE_OWNER,
        fullName: 'Owner User',
        permissions: { viewMedical: true },
      };

      await overview.getHealthBoard({}, ownerUser);

      expect(mockPrismaService.horse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            ownerId: 'owner-1',
          }),
        }),
      );
    });

    it('should filter horses by assigned groom when user is GROOM', async () => {
      mockPrismaService.horse.findMany.mockResolvedValue([]);
      const groomUser: CurrentUserPayload = {
        userId: 'groom-1',
        email: 'groom@example.com',
        role: Role.GROOM,
        fullName: 'Groom User',
        permissions: { viewMedical: true },
      };

      await overview.getHealthBoard({}, groomUser);

      expect(mockPrismaService.horse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            stallAllocations: {
              some: {
                assignedGroomUserId: 'groom-1',
                isActive: true,
              },
            },
          }),
        }),
      );
    });
  });
});
