import {
  PrismaClient,
  Role,
  UserStatus,
  HorseStatus,
  StallStatus,
  PlanStatus,
  WorkoutStatus,
  TrackSurface,
  PreventiveType,
  PreventiveStatus,
  HorseCatalogType,
} from '@prisma/client';
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

  // 2. Khu chuồng (SC-1.07) và ô chuồng có vị trí trên lưới
  const zones = [
    { code: 'ZONE-A', name: 'Zone A - Barn 1', rows: 2, cols: 4, sortOrder: 1 },
    { code: 'ZONE-B', name: 'Zone B - Barn 2', rows: 1, cols: 4, sortOrder: 2 },
  ];
  const zoneIds: Record<string, string> = {};
  for (const z of zones) {
    const zone = await prisma.stallZone.upsert({ where: { code: z.code }, update: {}, create: z });
    zoneIds[z.name] = zone.id;
  }

  const stalls = [
    { code: 'STALL-A01', zone: 'Zone A - Barn 1', row: 1, col: 1, status: StallStatus.AVAILABLE },
    { code: 'STALL-A02', zone: 'Zone A - Barn 1', row: 1, col: 2, status: StallStatus.AVAILABLE },
    { code: 'STALL-B01', zone: 'Zone B - Barn 2', row: 1, col: 1, status: StallStatus.AVAILABLE },
  ];

  for (const s of stalls) {
    const place = { zoneId: zoneIds[s.zone], row: s.row, col: s.col };
    await prisma.stall.upsert({
      where: { code: s.code },
      update: place,
      create: { ...s, ...place },
    });
  }

  // 2b. Danh mục Giống & Màu lông (SC-1.06). Tên phải khớp Horse.breed / Horse.color đang có.
  const catalog: Array<{ type: HorseCatalogType; names: string[] }> = [
    {
      type: HorseCatalogType.BREED,
      names: [
        'Thoroughbred',
        'Arabian',
        'Arabian Cross',
        'Quarter Horse',
        'Warmblood',
        'Standardbred',
        'Appaloosa',
        'Paint',
      ],
    },
    {
      type: HorseCatalogType.COLOR,
      names: ['Bay', 'Bay Dark', 'Chestnut', 'Black', 'Grey', 'Gray Roaming', 'Roan', 'Palomino'],
    },
  ];
  for (const { type, names } of catalog) {
    for (const [i, name] of names.entries()) {
      const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      await prisma.horseCatalogItem.upsert({
        where: { type_code: { type, code } },
        update: {},
        create: { type, code, name, sortOrder: i + 1 },
      });
    }
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
    await prisma.stallAllocation
      .upsert({
        where: { id: `alloc-${horse1.id}` },
        update: {},
        create: {
          id: `alloc-${horse1.id}`,
          stallId: stallA01.id,
          horseId: horse1.id,
          assignedGroomUserId: groom.id,
          isActive: true,
        },
      })
      .catch(() => null);
  }

  if (stallA02) {
    await prisma.stallAllocation
      .upsert({
        where: { id: `alloc-${horse2.id}` },
        update: {},
        create: {
          id: `alloc-${horse2.id}`,
          stallId: stallA02.id,
          horseId: horse2.id,
          assignedGroomUserId: groom.id,
          isActive: true,
        },
      })
      .catch(() => null);
  }

  if (stallB01) {
    await prisma.stallAllocation
      .upsert({
        where: { id: `alloc-${horse3.id}` },
        update: {},
        create: {
          id: `alloc-${horse3.id}`,
          stallId: stallB01.id,
          horseId: horse3.id,
          assignedGroomUserId: groom.id,
          isActive: true,
        },
      })
      .catch(() => null);
  }

  // 6. Seed Training Plans and Workout Sessions
  const now = new Date();
  // YYYY-MM-DD theo giờ câu lạc bộ (UTC+7) của ngày hôm nay + offset
  const clubDay = (offset: number) =>
    new Date(now.getTime() + 7 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
  const plan1Phases = [
    {
      id: 'ph-1',
      name: 'Volume building & aerobic base',
      type: 'BASE',
      startDate: clubDay(-20),
      endDate: clubDay(-6),
      goal: 'Aerobic base before speed work',
      sessionsPerWeek: 5,
      maxWeeklyDistance: 9000,
      surface: 'TURF',
      targetSpeedKmh: 38,
    },
    {
      id: 'ph-2',
      name: 'Speed work & sprint conditioning',
      type: 'SPEED',
      startDate: clubDay(-5),
      endDate: clubDay(20),
      goal: 'Race-pace breezes',
      sessionsPerWeek: 5,
      maxWeeklyDistance: 12000,
      surface: 'TURF',
      targetSpeedKmh: 58,
    },
    {
      id: 'ph-3',
      name: 'Tapering & gate rehearsal',
      type: 'PRE_RACE',
      startDate: clubDay(21),
      endDate: clubDay(40),
      sessionsPerWeek: 4,
      maxWeeklyDistance: 8000,
      surface: 'TURF',
      targetSpeedKmh: 45,
    },
  ];
  const plan1 = await prisma.trainingPlan.upsert({
    where: { id: `plan-${horse1.id}` },
    update: {},
    create: {
      id: `plan-${horse1.id}`,
      planCode: 'GA-000001',
      horseId: horse1.id,
      trainerUserId: trainer.id,
      phaseName: 'Derby Speed & Stamina Conditioning 2026',
      objective: 'Peak for the autumn Derby over 2000 m with a strong final 400 m.',
      targetSpeed: 58.0,
      targetDistance: 2000,
      trackSurface: TrackSurface.TURF,
      startDate: new Date(now.getTime() - 20 * 86400000),
      endDate: new Date(now.getTime() + 40 * 86400000),
      status: PlanStatus.ACTIVE,
      phases: plan1Phases,
    },
  });

  // Seed Workout Sessions for Plan 1
  await prisma.workoutSession.upsert({
    where: { id: `w1-${horse1.id}` },
    update: {},
    create: {
      id: `w1-${horse1.id}`,
      phaseId: 'ph-1',
      trainingPlanId: plan1.id,
      horseId: horse1.id,
      assignedStaffUserId: groom.id,
      scheduledDate: new Date(now.getTime() - 14 * 86400000),
      distanceMeters: 1200,
      actualTimeSeconds: 72.0,
      heartRatePeak: 175,
      heartRateRecovery: 108,
      performanceScore: 8.9,
      status: WorkoutStatus.COMPLETED,
      workoutType: 'CANTER',
      intensity: 'MEDIUM',
      trackSurface: 'TURF',
      averageSpeedKmh: 60.0,
      topSpeedKmh: 64.2,
      recoveryTimeMinutes: 4.5,
      staminaScore: 86,
      injuryRiskLevel: 'LOW',
      trainerNotes: 'Excellent gate break and strong forward stride in final 200m.',
    },
  });

  await prisma.workoutSession.upsert({
    where: { id: `w2-${horse1.id}` },
    update: {},
    create: {
      id: `w2-${horse1.id}`,
      phaseId: 'ph-1',
      trainingPlanId: plan1.id,
      horseId: horse1.id,
      assignedStaffUserId: groom.id,
      scheduledDate: new Date(now.getTime() - 7 * 86400000),
      distanceMeters: 1600,
      actualTimeSeconds: 98.5,
      heartRatePeak: 182,
      heartRateRecovery: 114,
      performanceScore: 8.6,
      status: WorkoutStatus.COMPLETED,
      workoutType: 'TRIAL',
      intensity: 'HEAVY',
      trackSurface: 'DIRT',
      averageSpeedKmh: 58.5,
      topSpeedKmh: 63.8,
      recoveryTimeMinutes: 5.2,
      staminaScore: 88,
      injuryRiskLevel: 'LOW',
      trainerNotes: 'Solid stamina endurance throughout backstretch turns.',
    },
  });

  await prisma.workoutSession.upsert({
    where: { id: `w3-${horse1.id}` },
    update: {},
    create: {
      id: `w3-${horse1.id}`,
      phaseId: 'ph-2',
      trainingPlanId: plan1.id,
      horseId: horse1.id,
      assignedStaffUserId: groom.id,
      scheduledDate: new Date(now.getTime() + 2 * 86400000),
      distanceMeters: 1400,
      targetDurationSeconds: 84,
      status: WorkoutStatus.SCHEDULED,
      workoutType: 'CANTER',
      intensity: 'MEDIUM',
      trackSurface: 'TURF',
      trainerNotes: 'Targeting smooth splits and controlled deceleration.',
    },
  });

  // Horse 2 đang Khóa y tế: giáo án giữ Đang áp dụng, chỉ còn bài nhẹ
  const plan2 = await prisma.trainingPlan.upsert({
    where: { id: `plan-${horse2.id}` },
    update: {},
    create: {
      id: `plan-${horse2.id}`,
      planCode: 'GA-000002',
      horseId: horse2.id,
      trainerUserId: trainer.id,
      phaseName: 'Rehabilitation & Low-Impact Conditioning',
      objective: 'Return to light work safely while the fore tendon heals.',
      targetSpeed: 25.0,
      targetDistance: 800,
      trackSurface: TrackSurface.TURF,
      startDate: new Date(now.getTime() - 5 * 86400000),
      endDate: new Date(now.getTime() + 25 * 86400000),
      status: PlanStatus.ACTIVE,
      phases: [
        {
          id: 'ph-r1',
          name: 'Hand walking & gentle trot',
          type: 'RECOVERY',
          startDate: clubDay(-5),
          endDate: clubDay(25),
          sessionsPerWeek: 5,
          maxWeeklyDistance: 5000,
          surface: 'TURF',
        },
      ],
    },
  });
  // Bộ đếm mã giáo án: 2 giáo án seed đã dùng GA-000001, GA-000002.
  await prisma.counter.upsert({
    where: { name: 'training_plan' },
    update: {},
    create: { name: 'training_plan', value: 2 },
  });

  await prisma.workoutSession.upsert({
    where: { id: `w1-${horse2.id}` },
    update: {},
    create: {
      id: `w1-${horse2.id}`,
      phaseId: 'ph-r1',
      trainingPlanId: plan2.id,
      horseId: horse2.id,
      assignedStaffUserId: groom.id,
      scheduledDate: new Date(now.getTime() + 1 * 86400000),
      distanceMeters: 800,
      // Khóa y tế chỉ chặn bài nặng: đi bộ nhẹ phục hồi vẫn được xếp (Flow 2 Q-2.01).
      status: WorkoutStatus.SCHEDULED,
      workoutType: 'WALK',
      intensity: 'LIGHT',
      trackSurface: 'TURF',
      trainerNotes: 'Đi bộ phục hồi 20 phút, theo dõi chi trước.',
    },
  });

  // 7. Seed Preventive Care Catalogs & Schedules
  const catTetanus = await prisma.preventiveTypeCatalog.upsert({
    where: { code: 'VAC_TETANUS' },
    update: {},
    create: {
      code: 'VAC_TETANUS',
      name: 'Tiêm phòng uốn ván & cúm ngựa (Tetanus & Equine Influenza)',
      category: PreventiveType.VACCINATION,
      intervalDays: 180,
      advanceNoticeDays: 14,
      applyToNewHorses: true,
      description: 'Phòng ngừa uốn ván Clostridium tetani và virus cúm ngựa định kỳ 6 tháng.',
    },
  });

  const catDeworm = await prisma.preventiveTypeCatalog.upsert({
    where: { code: 'DEWORM_BROAD' },
    update: {},
    create: {
      code: 'DEWORM_BROAD',
      name: 'Tẩy giun định kỳ phổ rộng (Broad-spectrum Deworming)',
      category: PreventiveType.DEWORMING,
      intervalDays: 90,
      advanceNoticeDays: 7,
      applyToNewHorses: true,
      description: 'Sử dụng Ivermectin / Praziquantel luân phiên mỗi quý.',
    },
  });

  const catFarrier = await prisma.preventiveTypeCatalog.upsert({
    where: { code: 'FARRIER_TRIM' },
    update: {},
    create: {
      code: 'FARRIER_TRIM',
      name: 'Cắt gọt và đóng móng định kỳ (Farrier Hoof Care)',
      category: PreventiveType.FARRIER_HOOF_CARE,
      intervalDays: 45,
      advanceNoticeDays: 5,
      applyToNewHorses: true,
      description: 'Cắt tỉa móng, cân bằng góc chân và thay móng sắt thi đấu mỗi 6 tuần.',
    },
  });

  await prisma.preventiveTypeCatalog.upsert({
    where: { code: 'DENTAL_FLOAT' },
    update: {},
    create: {
      code: 'DENTAL_FLOAT',
      name: 'Khám và mài răng định kỳ (Equine Dental Float)',
      category: PreventiveType.DENTAL,
      intervalDays: 365,
      advanceNoticeDays: 30,
      applyToNewHorses: true,
      description: 'Kiểm tra mài gờ răng nhọn hàm trên và hàm dưới hàng năm.',
    },
  });

  // Preventive Schedules for Horse 1
  await prisma.preventiveSchedule.upsert({
    where: { id: `prev-vac-${horse1.id}` },
    update: {},
    create: {
      id: `prev-vac-${horse1.id}`,
      horseId: horse1.id,
      typeCatalogId: catTetanus.id,
      veterinarianUserId: vet.id,
      scheduleType: PreventiveType.VACCINATION,
      dueDate: new Date(now.getTime() + 150 * 86400000),
      lastCompletedDate: new Date(now.getTime() - 30 * 86400000),
      productAdministered: 'Equi-Flu/Tetanus Duo 2ml',
      batchNumber: 'LOT-2026-TF09',
      performedByMode: 'SELF',
      performedByName: vet.fullName,
      status: PreventiveStatus.PENDING,
      notes: 'Đã tiêm phòng mũi định kỳ đầu mùa thi đấu, không phản ứng phụ.',
    },
  });

  await prisma.preventiveSchedule.upsert({
    where: { id: `prev-far-${horse1.id}` },
    update: {},
    create: {
      id: `prev-far-${horse1.id}`,
      horseId: horse1.id,
      typeCatalogId: catFarrier.id,
      veterinarianUserId: vet.id,
      scheduleType: PreventiveType.FARRIER_HOOF_CARE,
      dueDate: new Date(now.getTime() + 10 * 86400000),
      lastCompletedDate: new Date(now.getTime() - 35 * 86400000),
      performedByMode: 'EXTERNAL',
      performedByName: 'Master Farrier Kenji Sato',
      status: PreventiveStatus.PENDING,
      notes: 'Lịch gọt móng định kỳ chuẩn bị trước giải Derby.',
    },
  });

  // Preventive Schedules for Horse 2
  await prisma.preventiveSchedule.upsert({
    where: { id: `prev-dew-${horse2.id}` },
    update: {},
    create: {
      id: `prev-dew-${horse2.id}`,
      horseId: horse2.id,
      typeCatalogId: catDeworm.id,
      veterinarianUserId: vet.id,
      scheduleType: PreventiveType.DEWORMING,
      dueDate: new Date(now.getTime() + 80 * 86400000),
      lastCompletedDate: new Date(now.getTime() - 10 * 86400000),
      completedDate: new Date(now.getTime() - 10 * 86400000),
      productAdministered: 'Equimax Paste 14g',
      batchNumber: 'LOT-2026-DW03',
      performedByMode: 'SELF',
      performedByName: vet.fullName,
      status: PreventiveStatus.COMPLETED,
      notes: 'Đã cho uống thuốc tẩy giun đầy đủ liều lượng theo thể trọng.',
    },
  });

  await prisma.preventiveSchedule.upsert({
    where: { id: `prev-far-${horse2.id}` },
    update: {},
    create: {
      id: `prev-far-${horse2.id}`,
      horseId: horse2.id,
      typeCatalogId: catFarrier.id,
      veterinarianUserId: vet.id,
      scheduleType: PreventiveType.FARRIER_HOOF_CARE,
      dueDate: new Date(now.getTime() - 5 * 86400000),
      lastCompletedDate: new Date(now.getTime() - 50 * 86400000),
      performedByMode: 'EXTERNAL',
      performedByName: 'Farrier Team',
      status: PreventiveStatus.OVERDUE,
      notes: 'Quá hạn bảo dưỡng móng do đang nghỉ dưỡng thương (cần bảo dưỡng nhẹ tại chuồng).',
    },
  });

  console.log('--- Seeding Completed Successfully with Training Plans & Preventive Care ---');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
