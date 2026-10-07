import { PrismaClient, Role, UserStatus, HorseStatus, StallStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Seeding EquiFlow Database ---');

  const defaultPassword = await bcrypt.hash('EquiFlow@2026', 10);

  // 1. Create Users for all 5 roles
  const manager = await prisma.user.upsert({
    where: { email: 'manager@gmail.com' },
    update: {},
    create: {
      email: 'manager@gmail.com',
      passwordHash: defaultPassword,
      fullName: 'Michael Tran (Club Manager)',
      phoneNumber: '+84901234567',
      role: Role.CLUB_MANAGER,
      status: UserStatus.ACTIVE,
    },
  });

  const trainer = await prisma.user.upsert({
    where: { email: 'trainer@gmail.com' },
    update: {},
    create: {
      email: 'trainer@gmail.com',
      passwordHash: defaultPassword,
      fullName: 'David Nguyen (Head Trainer)',
      phoneNumber: '+84901234568',
      role: Role.HEAD_TRAINER,
      status: UserStatus.ACTIVE,
    },
  });

  const vet = await prisma.user.upsert({
    where: { email: 'vet@gmail.com' },
    update: {},
    create: {
      email: 'vet@gmail.com',
      passwordHash: defaultPassword,
      fullName: 'Dr. Sarah Connor (Veterinarian)',
      phoneNumber: '+84901234569',
      role: Role.VETERINARIAN,
      status: UserStatus.ACTIVE,
    },
  });

  const groom = await prisma.user.upsert({
    where: { email: 'groom@gmail.com' },
    update: {},
    create: {
      email: 'groom@gmail.com',
      passwordHash: defaultPassword,
      fullName: 'John Smith (Groom Hand)',
      phoneNumber: '+84901234570',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: 'owner@gmail.com' },
    update: {},
    create: {
      email: 'owner@gmail.com',
      passwordHash: defaultPassword,
      fullName: 'Robert Sterling (Horse Owner)',
      phoneNumber: '+84901234571',
      role: Role.HORSE_OWNER,
      status: UserStatus.ACTIVE,
    },
  });

  console.log(`Created 5 demo accounts (password: EquiFlow@2026):`);
  console.log(`- Manager: ${manager.email}`);
  console.log(`- Trainer: ${trainer.email}`);
  console.log(`- Vet: ${vet.email}`);
  console.log(`- Groom: ${groom.email}`);
  console.log(`- Owner: ${owner.email}`);

  // 2. Create Stalls
  const stalls = [
    { code: 'STALL-A01', zone: 'Zone A - Barn 1', status: StallStatus.AVAILABLE },
    { code: 'STALL-A02', zone: 'Zone A - Barn 1', status: StallStatus.AVAILABLE },
    { code: 'STALL-B01', zone: 'Zone B - Barn 2', status: StallStatus.AVAILABLE },
  ];

  for (const s of stalls) {
    await prisma.stall.upsert({
      where: { code: s.code },
      update: {},
      create: s,
    });
  }

  // 3. Create 3 Canonical Horses
  const horse1 = await prisma.horse.upsert({
    where: { microchipRfid: 'RFID-985141002341' },
    update: {
      horseCode: 'HR-000001',
      name: 'Thunderbolt Swift',
      microchip: '985141002341001',
      rfid: 'RFID-985141002341',
      status: HorseStatus.ACTIVE,
      isMedicalLocked: false,
      ownerId: owner.id,
    },
    create: {
      horseCode: 'HR-000001',
      name: 'Thunderbolt Swift',
      microchip: '985141002341001',
      rfid: 'RFID-985141002341',
      microchipRfid: 'RFID-985141002341',
      breed: 'Thoroughbred',
      dob: new Date('2021-04-12'),
      gender: 'Colt',
      color: 'Bay Dark',
      status: HorseStatus.ACTIVE,
      isMedicalLocked: false,
      ownerId: owner.id,
    },
  });

  const horse2 = await prisma.horse.upsert({
    where: { microchipRfid: 'RFID-985141002342' },
    update: {
      horseCode: 'HR-000002',
      name: 'Northern Dancer Legacy',
      microchip: '985141002342002',
      rfid: 'RFID-985141002342',
      status: HorseStatus.INJURED,
      isMedicalLocked: true,
      ownerId: owner.id,
    },
    create: {
      horseCode: 'HR-000002',
      name: 'Northern Dancer Legacy',
      microchip: '985141002342002',
      rfid: 'RFID-985141002342',
      microchipRfid: 'RFID-985141002342',
      breed: 'Thoroughbred',
      dob: new Date('2020-03-15'),
      gender: 'Stallion',
      color: 'Chestnut',
      status: HorseStatus.INJURED,
      isMedicalLocked: true,
      ownerId: owner.id,
    },
  });

  const horse3 = await prisma.horse.upsert({
    where: { microchipRfid: 'RFID-985141002343' },
    update: {
      horseCode: 'HR-000003',
      name: 'Shadowfax Wonder',
      microchip: '985141002343003',
      rfid: 'RFID-985141002343',
      status: HorseStatus.UNDER_OBSERVATION,
      isMedicalLocked: false,
      ownerId: owner.id,
    },
    create: {
      horseCode: 'HR-000003',
      name: 'Shadowfax Wonder',
      microchip: '985141002343003',
      rfid: 'RFID-985141002343',
      microchipRfid: 'RFID-985141002343',
      breed: 'Arabian Cross',
      dob: new Date('2022-01-20'),
      gender: 'Filly',
      color: 'Gray Roaming',
      status: HorseStatus.UNDER_OBSERVATION,
      isMedicalLocked: false,
      ownerId: owner.id,
    },
  });

  // 4. Seed Active Medical Lock for Horse 2 (RULE-MED-01)
  await prisma.medicalLock.upsert({
    where: { lockCode: 'LOCK-HR-000002-001' },
    update: {
      isLocked: true,
      appliedMedicalStatus: HorseStatus.INJURED,
    },
    create: {
      lockCode: 'LOCK-HR-000002-001',
      horseId: horse2.id,
      veterinarianUserId: vet.id,
      lockedAt: new Date(Date.now() - 3 * 86400000),
      expectedRestDays: 14,
      recheckDate: new Date(Date.now() + 11 * 86400000),
      appliedMedicalStatus: HorseStatus.INJURED,
      lockReason: 'Suspensory ligament acute desmitis during intense trial run',
      unlockConditions: 'Complete clinical ultrasound resolution and soundness on flexion test',
      isLocked: true,
    },
  });

  // 5. Seed 2D Musculoskeletal Injury for Horse 3 (SC-3.05)
  const existingInjury = await prisma.injuryLog.findFirst({
    where: { horseId: horse3.id },
  });
  if (!existingInjury) {
    await prisma.injuryLog.create({
      data: {
        horseId: horse3.id,
        coordinateX: 0.46,
        coordinateY: 0.62,
        viewSide: 'LEFT',
        layer: 'MUSCLE',
        anatomicalZone: 'Superficial Digital Flexor Tendon (SDFT)',
        bodySide: 'LEFT',
        injuryType: 'Tendon Strain & Mild Synovitis',
        severity: 'MODERATE',
        stage: 'RECOVERING',
        status: 'ACTIVE',
        description: 'Superficial flexor tendon strain observed after turf workout session.',
        discoveryDate: new Date(Date.now() - 10 * 86400000),
        recoveryHistory: [
          {
            id: 'rec-01',
            stage: 'ACUTE',
            evaluationDate: new Date(Date.now() - 10 * 86400000).toISOString(),
            severity: 'MODERATE',
            notes: 'Initial acute heat and focal sensitivity along mid-metacarpal zone.',
            updatedByName: 'Dr. Sarah Connor',
          },
          {
            id: 'rec-02',
            stage: 'RECOVERING',
            evaluationDate: new Date(Date.now() - 2 * 86400000).toISOString(),
            severity: 'MILD',
            notes: 'Reduced heat and improved weight-bearing; progressive trotting allowed.',
            updatedByName: 'Dr. Sarah Connor',
          },
        ],
      },
    });
  }

  // 6. Seed Stall Allocations
  const stallA01 = await prisma.stall.findUnique({ where: { code: 'STALL-A01' } });
  const stallA02 = await prisma.stall.findUnique({ where: { code: 'STALL-A02' } });
  const stallB01 = await prisma.stall.findUnique({ where: { code: 'STALL-B01' } });

  if (stallA01) {
    await prisma.stallAllocation.upsert({
      where: { id: `alloc-${horse1.id}` },
      update: {},
      create: {
        id: `alloc-${horse1.id}`,
        stallId: stallA01.id,
        horseId: horse1.id,
        assignedGroomUserId: groom.id,
        isActive: true,
      },
    }).catch(() => null);
  }

  if (stallA02) {
    await prisma.stallAllocation.upsert({
      where: { id: `alloc-${horse2.id}` },
      update: {},
      create: {
        id: `alloc-${horse2.id}`,
        stallId: stallA02.id,
        horseId: horse2.id,
        assignedGroomUserId: groom.id,
        isActive: true,
      },
    }).catch(() => null);
  }

  if (stallB01) {
    await prisma.stallAllocation.upsert({
      where: { id: `alloc-${horse3.id}` },
      update: {},
      create: {
        id: `alloc-${horse3.id}`,
        stallId: stallB01.id,
        horseId: horse3.id,
        assignedGroomUserId: groom.id,
        isActive: true,
      },
    }).catch(() => null);
  }

  console.log('--- Seeding Completed Successfully with 3 Canonical Horses ---');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

