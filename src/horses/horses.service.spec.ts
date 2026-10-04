import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { HorseStatus } from '@prisma/client';
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
      horse: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
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
});
