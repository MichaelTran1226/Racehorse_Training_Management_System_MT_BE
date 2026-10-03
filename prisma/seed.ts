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

  // 3. Create Sample Horses
  await prisma.horse.upsert({
    where: { microchipRfid: 'RFID-985141002341' },
    update: {},
    create: {
      name: 'Thunderbolt Swift',
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

  await prisma.horse.upsert({
    where: { microchipRfid: 'RFID-985141002342' },
    update: {},
    create: {
      name: 'Northern Dancer Legacy',
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

  console.log('--- Seeding Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
