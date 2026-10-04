import { Test, TestingModule } from '@nestjs/testing';
import { MedicalService } from './medical.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Role } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('MedicalService', () => {
  let service: MedicalService;

  const mockPrismaService = {
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
      update: jest.fn(),
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

  const mockOwnerUser = {
    userId: 'owner-1',
    email: 'owner@example.com',
    fullName: 'Horse Owner',
    role: Role.HORSE_OWNER,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<MedicalService>(MedicalService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMedicalRecord', () => {
    it('should throw ForbiddenException if user is not VETERINARIAN or CLUB_MANAGER', async () => {
      await expect(
        service.createMedicalRecord(mockOwnerUser, {
          horseId: 'horse-1',
          examinationType: 'Khám bệnh',
          reason: 'Lý do khám bệnh chi tiết',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if horse does not exist', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue(null);

      await expect(
        service.createMedicalRecord(mockVetUser, {
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

      const result = await service.createMedicalRecord(mockVetUser, {
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

      await expect(service.getMedicalRecordDetail('invalid-id', mockVetUser)).rejects.toThrow(
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

      const result = await service.getMedicalRecordDetail('rec-1', mockVetUser);
      expect(result).toEqual(mockRecord);
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

      const result = await service.closeMedicalRecord('rec-1', mockVetUser, {
        conclusion: 'Đã phục hồi hoàn toàn',
      });

      expect(result.treatmentProtocol).toContain('Đã phục hồi hoàn toàn');
      expect(mockAuditService.record).toHaveBeenCalled();
    });
  });

  describe('createMedicalLock', () => {
    it('should create medical lock and update horse status', async () => {
      mockPrismaService.horse.findUnique.mockResolvedValue({ id: 'horse-1', name: 'Thunder' });
      mockPrismaService.medicalLock.findFirst.mockResolvedValue(null);
      mockPrismaService.medicalLock.create.mockResolvedValue({
        id: 'lock-1',
        horseId: 'horse-1',
        isLocked: true,
      });

      const result = await service.createMedicalLock(mockVetUser, {
        horseId: 'horse-1',
        expectedRestDays: 7,
        lockReason: 'Chấn thương cơ đùi',
        unlockConditions: 'Hết sưng và chạy bình thường',
      });

      expect(result.id).toBe('lock-1');
      expect(mockPrismaService.horse.update).toHaveBeenCalledWith({
        where: { id: 'horse-1' },
        data: expect.objectContaining({ isMedicalLocked: true }),
      });
    });
  });
});
