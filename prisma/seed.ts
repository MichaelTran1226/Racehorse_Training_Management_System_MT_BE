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
  MedicalRecordStatus,
  SeverityLevel,
  NotificationCategory,
  RetireReason,
  InjuryStatus,
  BodySide,
  TournamentStatus,
  RegistrationStatus,
  InvoiceStatus,
  SupplyCategory,
  SupplyUnit,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Seeding 100% Comprehensive EquiFlow Database ---');

  const defaultPassword = await bcrypt.hash('EquiFlow@2026', 10);

  // 1. Users Covering All Roles and Account Lifecycles (ACTIVE, PENDING_APPROVAL, INVITED, LOCKED)
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
      fullName: 'Dr. Sarah Connor (Chief Veterinarian)',
      phoneNumber: '+84901234569',
      role: Role.VETERINARIAN,
      status: UserStatus.ACTIVE,
    },
  });

  const groom1 = await prisma.user.upsert({
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

  const groom2 = await prisma.user.upsert({
    where: { email: 'groom2@gmail.com' },
    update: {},
    create: {
      email: 'groom2@gmail.com',
      passwordHash: defaultPassword,
      fullName: 'Lê Văn Phúc (Senior Groom)',
      phoneNumber: '+84901234572',
      role: Role.GROOM,
      status: UserStatus.ACTIVE,
    },
  });

  const owner1 = await prisma.user.upsert({
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

  const owner2 = await prisma.user.upsert({
    where: { email: 'owner2@gmail.com' },
    update: {},
    create: {
      email: 'owner2@gmail.com',
      passwordHash: defaultPassword,
      fullName: 'Phan Đức Long (VIP Owner)',
      phoneNumber: '+84901234573',
      role: Role.HORSE_OWNER,
      status: UserStatus.ACTIVE,
    },
  });

  // Account test cases for Club Manager governance:
  await prisma.user.upsert({
    where: { email: 'pending.groom@gmail.com' },
    update: {},
    create: {
      email: 'pending.groom@gmail.com',
      passwordHash: defaultPassword,
      fullName: 'Trần Văn Nam (Pending Groom)',
      phoneNumber: '+84909888111',
      role: Role.GROOM,
      status: UserStatus.PENDING_APPROVAL,
    },
  });

  await prisma.user.upsert({
    where: { email: 'invited.vet@gmail.com' },
    update: {},
    create: {
      email: 'invited.vet@gmail.com',
      passwordHash: defaultPassword,
      fullName: 'Dr. Alexander Bell (Invited Vet)',
      phoneNumber: '+84909888222',
      role: Role.VETERINARIAN,
      status: UserStatus.INVITED,
    },
  });

  await prisma.user.upsert({
    where: { email: 'locked.user@gmail.com' },
    update: {},
    create: {
      email: 'locked.user@gmail.com',
      passwordHash: defaultPassword,
      fullName: 'Đặng Tuấn Kiệt (Locked Account)',
      phoneNumber: '+84909888333',
      role: Role.GROOM,
      status: UserStatus.LOCKED,
    },
  });

  console.log(`[1/9] Seeded 10 Users across all Roles and Account Lifecycles (ACTIVE, PENDING_APPROVAL, INVITED, LOCKED)`);

  // 2. Khu chuồng (Stall Zones)
  const zoneDefs = [
    { code: 'ZONE-A', name: 'Zone A - Barn 1', rows: 2, cols: 4, sortOrder: 1, description: 'Chuồng đua tiêu chuẩn số 1' },
    { code: 'ZONE-B', name: 'Zone B - Barn 2', rows: 2, cols: 4, sortOrder: 2, description: 'Chuồng tập huấn luyện số 2' },
    { code: 'ZONE-C', name: 'Zone C - Isolation', rows: 1, cols: 4, sortOrder: 3, description: 'Khu cách ly thú y & kiểm dịch' },
  ];

  const zoneIds: Record<string, string> = {};
  for (const z of zoneDefs) {
    const zone = await prisma.stallZone.upsert({
      where: { code: z.code },
      update: { name: z.name, rows: z.rows, cols: z.cols, description: z.description },
      create: z,
    });
    zoneIds[z.name] = zone.id;
  }

  // 3. Toàn bộ 20 ô chuồng với các trạng thái: OCCUPIED, AVAILABLE, MAINTENANCE, INACTIVE
  const stallDefs: Array<{ code: string; zone: string; row: number; col: number; status: StallStatus; notes?: string }> = [];

  // Zone A: 2x4 = 8 ô (STALL-A01 đến STALL-A08)
  for (let r = 1; r <= 2; r++) {
    for (let c = 1; c <= 4; c++) {
      const idx = (r - 1) * 4 + c;
      stallDefs.push({
        code: `STALL-A0${idx}`,
        zone: 'Zone A - Barn 1',
        row: r,
        col: c,
        status: StallStatus.AVAILABLE,
      });
    }
  }

  // Zone B: 2x4 = 8 ô (STALL-B01 đến STALL-B08)
  for (let r = 1; r <= 2; r++) {
    for (let c = 1; c <= 4; c++) {
      const idx = (r - 1) * 4 + c;
      stallDefs.push({
        code: `STALL-B0${idx}`,
        zone: 'Zone B - Barn 2',
        row: r,
        col: c,
        status: idx === 8 ? StallStatus.MAINTENANCE : StallStatus.AVAILABLE,
        notes: idx === 8 ? 'Bảo trì thay đệm lót và van cấp nước tự động' : undefined,
      });
    }
  }

  // Zone C: 1x4 = 4 ô (STALL-C01 đến STALL-C04)
  for (let c = 1; c <= 4; c++) {
    stallDefs.push({
      code: `STALL-C0${c}`,
      zone: 'Zone C - Isolation',
      row: 1,
      col: c,
      status: c === 4 ? StallStatus.INACTIVE : StallStatus.AVAILABLE,
      notes: c === 4 ? 'Ô chuồng ngừng sử dụng (đang cải tạo hệ thống khử trùng áp lực âm)' : undefined,
    });
  }

  for (const s of stallDefs) {
    const place = { zoneId: zoneIds[s.zone], row: s.row, col: s.col, notes: s.notes || null };
    await prisma.stall.upsert({
      where: { code: s.code },
      update: { ...place, status: s.status },
      create: { ...s, ...place },
    });
  }
  console.log(`[2/9] Seeded 3 Zones and 20 Stalls (covering AVAILABLE, OCCUPIED, MAINTENANCE, INACTIVE)`);

  // 4. Danh mục Giống & Màu lông (SC-1.06)
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

  // 5. Đàn ngựa bao quát 100% tất cả trạng thái HorseStatus:
  // ACTIVE, IN_TRAINING, UNDER_OBSERVATION, INJURED, ISOLATED, RESTING, RETIRED
  const horsesData = [
    {
      horseCode: 'HR-000001',
      name: 'Thunderbolt Swift',
      microchip: '985141002341001',
      rfid: 'RFID-985141002341',
      breed: 'Thoroughbred',
      dob: new Date('2021-04-12'),
      gender: 'Colt',
      color: 'Bay Dark',
      status: HorseStatus.ACTIVE,
      isMedicalLocked: false,
      ownerId: owner1.id,
      stallCode: 'STALL-A01',
      groomId: groom1.id,
    },
    {
      horseCode: 'HR-000002',
      name: 'Northern Dancer Legacy',
      microchip: '985141002342002',
      rfid: 'RFID-985141002342',
      breed: 'Thoroughbred',
      dob: new Date('2020-03-15'),
      gender: 'Stallion',
      color: 'Chestnut',
      status: HorseStatus.INJURED,
      isMedicalLocked: true,
      ownerId: owner2.id,
      stallCode: 'STALL-A02',
      groomId: groom1.id,
    },
    {
      horseCode: 'HR-000003',
      name: 'Shadowfax Wonder',
      microchip: '985141002343003',
      rfid: 'RFID-985141002343',
      breed: 'Arabian Cross',
      dob: new Date('2022-01-20'),
      gender: 'Filly',
      color: 'Gray Roaming',
      status: HorseStatus.UNDER_OBSERVATION,
      isMedicalLocked: false,
      ownerId: owner2.id,
      stallCode: 'STALL-B01',
      groomId: groom2.id,
    },
    {
      horseCode: 'HR-000004',
      name: 'Pegasus Dream',
      microchip: '985141002344004',
      rfid: 'RFID-985141002344',
      breed: 'Thoroughbred',
      dob: new Date('2021-08-05'),
      gender: 'Gelding',
      color: 'Bay',
      status: HorseStatus.ACTIVE,
      isMedicalLocked: false,
      ownerId: owner1.id,
      stallCode: 'STALL-A03',
      groomId: groom1.id,
    },
    {
      horseCode: 'HR-000005',
      name: 'Golden Eclipse',
      microchip: '985141002345005',
      rfid: 'RFID-985141002345',
      breed: 'Quarter Horse',
      dob: new Date('2022-05-18'),
      gender: 'Mare',
      color: 'Palomino',
      status: HorseStatus.IN_TRAINING,
      isMedicalLocked: false,
      ownerId: owner1.id,
      stallCode: 'STALL-A04',
      groomId: groom2.id,
    },
    {
      horseCode: 'HR-000006',
      name: 'Storm Runner',
      microchip: '985141002346006',
      rfid: 'RFID-985141002346',
      breed: 'Thoroughbred',
      dob: new Date('2020-11-10'),
      gender: 'Stallion',
      color: 'Black',
      status: HorseStatus.IN_TRAINING,
      isMedicalLocked: false,
      ownerId: owner2.id,
      stallCode: 'STALL-B02',
      groomId: groom1.id,
    },
    {
      horseCode: 'HR-000007',
      name: 'Midnight Mirage',
      microchip: '985141002347007',
      rfid: 'RFID-985141002347',
      breed: 'Standardbred',
      dob: new Date('2021-02-14'),
      gender: 'Mare',
      color: 'Black',
      status: HorseStatus.ISOLATED,
      isMedicalLocked: true,
      ownerId: owner1.id,
      stallCode: 'STALL-C01',
      groomId: groom2.id,
    },
    {
      horseCode: 'HR-000008',
      name: 'Red Velvet',
      microchip: '985141002348008',
      rfid: 'RFID-985141002348',
      breed: 'Warmblood',
      dob: new Date('2022-09-01'),
      gender: 'Mare',
      color: 'Chestnut',
      status: HorseStatus.RESTING,
      isMedicalLocked: false,
      ownerId: owner2.id,
      stallCode: 'STALL-B03',
      groomId: groom2.id,
    },
    {
      horseCode: 'HR-000009',
      name: 'Silver Comet',
      microchip: '985141002349009',
      rfid: 'RFID-985141002349',
      breed: 'Thoroughbred',
      dob: new Date('2017-06-25'),
      gender: 'Gelding',
      color: 'Grey',
      status: HorseStatus.RETIRED,
      isMedicalLocked: false,
      ownerId: owner1.id,
      stallCode: null,
      groomId: null,
    },
  ];

  const createdHorses: Record<string, any> = {};

  for (const h of horsesData) {
    const horse = await prisma.horse.upsert({
      where: { microchipRfid: h.rfid },
      update: {
        horseCode: h.horseCode,
        name: h.name,
        microchip: h.microchip,
        rfid: h.rfid,
        breed: h.breed,
        dob: h.dob,
        gender: h.gender,
        color: h.color,
        status: h.status,
        isMedicalLocked: h.isMedicalLocked,
        ownerId: h.ownerId,
        retireReason: h.status === HorseStatus.RETIRED ? RetireReason.RETIRED : null,
        deleteReason: h.status === HorseStatus.RETIRED ? 'Tuổi tác đạt ngưỡng và nghỉ hưu vinh danh sau chức vô địch Derby 2024' : null,
        deletedAt: h.status === HorseStatus.RETIRED ? new Date('2025-11-20') : null,
      },
      create: {
        horseCode: h.horseCode,
        name: h.name,
        microchip: h.microchip,
        rfid: h.rfid,
        microchipRfid: h.rfid,
        breed: h.breed,
        dob: h.dob,
        gender: h.gender,
        color: h.color,
        status: h.status,
        isMedicalLocked: h.isMedicalLocked,
        ownerId: h.ownerId,
        retireReason: h.status === HorseStatus.RETIRED ? RetireReason.RETIRED : null,
        deleteReason: h.status === HorseStatus.RETIRED ? 'Tuổi tác đạt ngưỡng và nghỉ hưu vinh danh sau chức vô địch Derby 2024' : null,
        deletedAt: h.status === HorseStatus.RETIRED ? new Date('2025-11-20') : null,
      },
    });
    createdHorses[h.horseCode] = horse;

    if (h.stallCode && h.groomId) {
      const stall = await prisma.stall.findUnique({ where: { code: h.stallCode } });
      if (stall) {
        await prisma.stallAllocation.upsert({
          where: { id: `alloc-${horse.id}` },
          update: { stallId: stall.id, assignedGroomUserId: h.groomId, isActive: true },
          create: {
            id: `alloc-${horse.id}`,
            stallId: stall.id,
            horseId: horse.id,
            assignedGroomUserId: h.groomId,
            isActive: true,
          },
        });
        await prisma.stall.update({
          where: { id: stall.id },
          data: { status: StallStatus.OCCUPIED },
        });
      }
    }
  }
  console.log(`[3/9] Seeded 9 Horses covering 100% of HorseStatus values`);

  // 6. Medical Locks (Cả Active Lock và Released Lock lịch sử)
  const horse1 = createdHorses['HR-000001'];
  const horse2 = createdHorses['HR-000002'];
  const horse7 = createdHorses['HR-000007'];

  // Active Lock 1
  await prisma.medicalLock.upsert({
    where: { lockCode: 'LOCK-HR-000002-001' },
    update: { isLocked: true, appliedMedicalStatus: HorseStatus.INJURED },
    create: {
      lockCode: 'LOCK-HR-000002-001',
      horseId: horse2.id,
      veterinarianUserId: vet.id,
      lockedAt: new Date(Date.now() - 3 * 86400000),
      expectedRestDays: 14,
      recheckDate: new Date(Date.now() + 11 * 86400000),
      appliedMedicalStatus: HorseStatus.INJURED,
      lockReason: 'Viêm cấp tính dây chằng treo (Suspensory ligament acute desmitis) trong bài chạy thử',
      unlockConditions: 'Siêu âm lại hoàn toàn bình phục và vượt qua bài test co duỗi flexion test',
      isLocked: true,
    },
  });

  // Active Lock 2
  await prisma.medicalLock.upsert({
    where: { lockCode: 'LOCK-HR-000007-001' },
    update: { isLocked: true, appliedMedicalStatus: HorseStatus.ISOLATED },
    create: {
      lockCode: 'LOCK-HR-000007-001',
      horseId: horse7.id,
      veterinarianUserId: vet.id,
      lockedAt: new Date(Date.now() - 2 * 86400000),
      expectedRestDays: 21,
      recheckDate: new Date(Date.now() + 19 * 86400000),
      appliedMedicalStatus: HorseStatus.ISOLATED,
      lockReason: 'Cách ly theo dõi nghi ngờ sốt cúm hô hấp EHV-1',
      unlockConditions: 'Xét nghiệm PCR 2 lần âm tính cách nhau 7 ngày',
      isLocked: true,
    },
  });

  // Released Lock (Lịch sử đã mở khóa)
  await prisma.medicalLock.upsert({
    where: { lockCode: 'LOCK-HR-000001-HIST' },
    update: { isLocked: false },
    create: {
      lockCode: 'LOCK-HR-000001-HIST',
      horseId: horse1.id,
      veterinarianUserId: vet.id,
      lockedAt: new Date(Date.now() - 45 * 86400000),
      expectedRestDays: 14,
      recheckDate: new Date(Date.now() - 31 * 86400000),
      appliedMedicalStatus: HorseStatus.INJURED,
      lockReason: 'Đụng dập nhẹ phần mềm vùng cổ chân sau buổi tập đường cát',
      unlockConditions: 'Hết sưng nóng và vận động bình thường',
      isLocked: false,
      unlockedAt: new Date(Date.now() - 30 * 86400000),
      unlockVetUserId: vet.id,
      unlockReason: 'Đã hoàn toàn bình phục sau 2 tuần chườm lạnh và vật lý trị liệu, kết quả siêu âm bình thường',
    },
  });

  // 7. Injury Logs (Bản đồ giải phẫu 2D: Cả ACTIVE và RESOLVED)
  const horse3 = createdHorses['HR-000003'];
  await prisma.injuryLog.upsert({
    where: { id: `inj-${horse3.id}-active` },
    update: {},
    create: {
      id: `inj-${horse3.id}-active`,
      horseId: horse3.id,
      coordinateX: 0.46,
      coordinateY: 0.62,
      viewSide: 'LEFT',
      layer: 'MUSCLE',
      anatomicalZone: 'Superficial Digital Flexor Tendon (SDFT)',
      bodySide: BodySide.LEFT,
      injuryType: 'Căng gân gấp ngón nông & tràn dịch bao hoạt dịch nhẹ',
      severity: SeverityLevel.MODERATE,
      stage: 'RECOVERING',
      status: InjuryStatus.ACTIVE,
      description: 'Căng gân gấp ngón nông quan sát thấy sau buổi tập trên đường cỏ.',
      discoveryDate: new Date(Date.now() - 10 * 86400000),
      recoveryHistory: [
        {
          id: 'rec-01',
          stage: 'ACUTE',
          evaluationDate: new Date(Date.now() - 10 * 86400000).toISOString(),
          severity: 'MODERATE',
          notes: 'Nóng cục bộ và nhạy cảm đau dọc vùng bàn chân giữa.',
          updatedByName: 'Dr. Sarah Connor',
        },
        {
          id: 'rec-02',
          stage: 'RECOVERING',
          evaluationDate: new Date(Date.now() - 2 * 86400000).toISOString(),
          severity: 'MILD',
          notes: 'Giảm nhiệt độ nóng, chịu lực tốt hơn; cho phép bài tập đi bộ nhẹ.',
          updatedByName: 'Dr. Sarah Connor',
        },
      ],
    },
  });

  await prisma.injuryLog.upsert({
    where: { id: `inj-${horse1.id}-healed` },
    update: {},
    create: {
      id: `inj-${horse1.id}-healed`,
      horseId: horse1.id,
      coordinateX: 0.68,
      coordinateY: 0.72,
      viewSide: 'RIGHT',
      layer: 'BONE',
      anatomicalZone: 'Right Fetlock Joint Abrasion',
      bodySide: BodySide.RIGHT,
      injuryType: 'Trầy xước da khớp bàn ngón chân sau',
      severity: SeverityLevel.MILD,
      stage: 'HEALED',
      status: InjuryStatus.RESOLVED,
      description: 'Vết trầy nhẹ do quẹt vào rào chắn thi đấu, đã lành sẹo hoàn toàn.',
      discoveryDate: new Date(Date.now() - 40 * 86400000),
      recoveryHistory: [
        {
          id: 'rec-h1',
          stage: 'HEALED',
          evaluationDate: new Date(Date.now() - 30 * 86400000).toISOString(),
          severity: 'MILD',
          notes: 'Vết thương biểu mô hóa hoàn toàn, không để lại dị tật.',
          updatedByName: 'Dr. Sarah Connor',
        },
      ],
    },
  });

  // 8. Hồ Sơ Bệnh Án bao quát đầy đủ trạng thái: OPEN, CLOSED, DRAFT
  // OPEN (Đang điều trị)
  await prisma.medicalRecord.upsert({
    where: { id: `med-${horse1.id}-1` },
    update: {},
    create: {
      id: `med-${horse1.id}-1`,
      recordNumber: 'BA-2610-001',
      horseId: horse1.id,
      veterinarianUserId: vet.id,
      status: MedicalRecordStatus.OPEN,
      examinationType: 'Khám thể lực tiền thi đấu',
      severity: SeverityLevel.MILD,
      temperature: 37.8,
      restingHeartRate: 36,
      respiratoryRate: 14,
      weightKg: 495.0,
      clinicalExamination: 'Màng niêm mạc hồng hào, phản xạ âm tim đều, nhịp thở êm.',
      symptoms: 'Không có triệu chứng bất thường, thể trạng sung sức.',
      clinicalDiagnosis: 'Thể lực hoàn hảo, sẵn sàng cho bài tập tốc độ cao.',
      treatmentProtocol: 'Duy trì chế độ dinh dưỡng giàu năng lượng và bổ sung điện giải sau tập.',
      createdAt: new Date(Date.now() - 5 * 86400000),
    },
  });

  // OPEN (Chấn thương nặng)
  await prisma.medicalRecord.upsert({
    where: { id: `med-${horse2.id}-1` },
    update: {},
    create: {
      id: `med-${horse2.id}-1`,
      recordNumber: 'BA-2610-002',
      horseId: horse2.id,
      veterinarianUserId: vet.id,
      status: MedicalRecordStatus.OPEN,
      examinationType: 'Khám chấn thương cấp tính',
      severity: SeverityLevel.SEVERE,
      temperature: 38.3,
      restingHeartRate: 46,
      respiratoryRate: 18,
      weightKg: 510.0,
      clinicalExamination: 'Sưng nóng rõ rệt vùng gân gót chân trước bên trái, phản xạ co giật đau cấp 3/5.',
      symptoms: 'Khập khiễng khi sải bước nhanh, né tránh chịu lực hoàn toàn chân trước trái.',
      clinicalDiagnosis: 'Viêm rách vi thể gân treo chi trước (Suspensory Ligament Desmitis).',
      treatmentProtocol: 'Chườm lạnh hydrotherapy 3 lần/ngày, băng ép cố định, tiêm kháng viêm NSAID và đặt lệnh Khóa Y Tế.',
      requiresFollowUp: true,
      followUpDate: new Date(Date.now() + 11 * 86400000),
      createdAt: new Date(Date.now() - 3 * 86400000),
    },
  });

  // CLOSED (Bệnh án đã đóng - đã chữa khỏi)
  await prisma.medicalRecord.upsert({
    where: { id: `med-${horse1.id}-closed` },
    update: {},
    create: {
      id: `med-${horse1.id}-closed`,
      recordNumber: 'BA-2609-001',
      horseId: horse1.id,
      veterinarianUserId: vet.id,
      status: MedicalRecordStatus.CLOSED,
      examinationType: 'Viêm phế quản nhẹ theo mùa',
      severity: SeverityLevel.MILD,
      temperature: 38.1,
      restingHeartRate: 40,
      respiratoryRate: 16,
      weightKg: 490.0,
      symptoms: 'Ho nhẹ vào sáng sớm khi xuất chuồng, có ít dịch mũi trong.',
      clinicalDiagnosis: 'Viêm đường hô hấp trên thể nhẹ (Equine Bronchitis).',
      treatmentProtocol: 'Xông khí dung tinh dầu khuynh diệp, uống kháng sinh amoxicillin 5 ngày.',
      conclusion: 'Ngựa đã hết ho hoàn toàn, phổi trong, thể lực hồi phục 100%.',
      treatmentResult: 'Khỏi bệnh hoàn toàn',
      closedAt: new Date(Date.now() - 25 * 86400000),
      createdAt: new Date(Date.now() - 35 * 86400000),
    },
  });

  // DRAFT (Bản nháp bệnh án)
  const horse4 = createdHorses['HR-000004'];
  await prisma.medicalRecord.upsert({
    where: { id: `med-${horse4.id}-draft` },
    update: {},
    create: {
      id: `med-${horse4.id}-draft`,
      recordNumber: 'BA-2610-DRAFT',
      horseId: horse4.id,
      veterinarianUserId: vet.id,
      status: MedicalRecordStatus.DRAFT,
      examinationType: 'Kiểm tra mắt định kỳ',
      symptoms: 'Chảy nước mắt nhẹ mắt trái.',
      clinicalDiagnosis: 'Nghi ngờ kích ứng cát bụi đường chạy.',
      treatmentProtocol: 'Nhỏ mắt dung dịch nước muối sinh lý 0.9%.',
      createdAt: new Date(),
    },
  });
  console.log(`[4/9] Seeded Medical Records (OPEN, CLOSED, DRAFT) & Medical Locks (ACTIVE, RELEASED)`);

  // 9. Giáo án Huấn Luyện bao quát 100% PlanStatus: ACTIVE, COMPLETED, DRAFT
  const now = new Date();
  const clubDay = (offset: number) =>
    new Date(now.getTime() + 7 * 3600000 + offset * 86400000).toISOString().slice(0, 10);

  // ACTIVE Plan
  const plan1 = await prisma.trainingPlan.upsert({
    where: { id: `plan-${horse1.id}` },
    update: {},
    create: {
      id: `plan-${horse1.id}`,
      planCode: 'GA-000001',
      horseId: horse1.id,
      trainerUserId: trainer.id,
      phaseName: 'Huấn luyện tốc độ & Bứt phá Derby 2026',
      objective: 'Đạt đỉnh phong độ cự ly 2000m, tăng tốc 400m cuối.',
      targetSpeed: 58.0,
      targetDistance: 2000,
      trackSurface: TrackSurface.TURF,
      startDate: new Date(now.getTime() - 20 * 86400000),
      endDate: new Date(now.getTime() + 40 * 86400000),
      status: PlanStatus.ACTIVE,
      phases: [
        {
          id: 'ph-1',
          name: 'Tích lũy hiếu khí & Thể lực nền',
          type: 'BASE',
          startDate: clubDay(-20),
          endDate: clubDay(-6),
          sessionsPerWeek: 5,
          maxWeeklyDistance: 9000,
          surface: 'TURF',
          targetSpeedKmh: 38,
        },
        {
          id: 'ph-2',
          name: 'Nước rút tốc độ cao',
          type: 'SPEED',
          startDate: clubDay(-5),
          endDate: clubDay(20),
          sessionsPerWeek: 5,
          maxWeeklyDistance: 12000,
          surface: 'TURF',
          targetSpeedKmh: 58,
        },
      ],
    },
  });

  // COMPLETED Plan
  await prisma.trainingPlan.upsert({
    where: { id: `plan-${horse1.id}-completed` },
    update: {},
    create: {
      id: `plan-${horse1.id}-completed`,
      planCode: 'GA-000000',
      horseId: horse1.id,
      trainerUserId: trainer.id,
      phaseName: 'Giai đoạn xây dựng nền tảng mùa xuân 2026',
      objective: 'Hoàn thành khối lượng tích lũy 10,000m chạy bước vừa.',
      targetSpeed: 40.0,
      targetDistance: 1500,
      trackSurface: TrackSurface.DIRT,
      startDate: new Date(now.getTime() - 90 * 86400000),
      endDate: new Date(now.getTime() - 30 * 86400000),
      status: PlanStatus.COMPLETED,
    },
  });

  // DRAFT Plan
  const horse6 = createdHorses['HR-000006'];
  await prisma.trainingPlan.upsert({
    where: { id: `plan-${horse6.id}-draft` },
    update: {},
    create: {
      id: `plan-${horse6.id}-draft`,
      planCode: 'GA-000004',
      horseId: horse6.id,
      trainerUserId: trainer.id,
      phaseName: 'Kế hoạch huấn luyện thử nghiệm cự ly ngắn (Bản nháp)',
      objective: 'Đánh giá khả năng xuất phát cổng và thích ứng đường cỏ.',
      targetSpeed: 55.0,
      targetDistance: 1200,
      trackSurface: TrackSurface.TURF,
      startDate: new Date(now.getTime() + 5 * 86400000),
      endDate: new Date(now.getTime() + 45 * 86400000),
      status: PlanStatus.DRAFT,
    },
  });

  // 10. Bài Tập (Workouts) bao quát tất cả WorkoutStatus:
  // COMPLETED, SCHEDULED, BLOCKED (do Khóa y tế), MISSED
  await prisma.workoutSession.upsert({
    where: { id: `w1-${horse1.id}` },
    update: {},
    create: {
      id: `w1-${horse1.id}`,
      phaseId: 'ph-1',
      trainingPlanId: plan1.id,
      horseId: horse1.id,
      assignedStaffUserId: groom1.id,
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
      trainerNotes: 'Xuất phát cổng mượt mà, sải chân dài uy lực 200m cuối.',
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
      assignedStaffUserId: groom1.id,
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
      trainerNotes: 'Sức bền tuyệt vời ở khúc cua đường cát.',
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
      assignedStaffUserId: groom1.id,
      scheduledDate: new Date(now.getTime() + 2 * 86400000),
      distanceMeters: 1400,
      targetDurationSeconds: 84,
      status: WorkoutStatus.SCHEDULED,
      workoutType: 'CANTER',
      intensity: 'MEDIUM',
      trackSurface: 'TURF',
      trainerNotes: 'Duy trì nhịp thở ổn định và giảm tốc mượt mà.',
    },
  });

  // BLOCKED workout: Bài tập nặng bị chặn do Khóa y tế (RULE-MED-01)
  const plan2 = await prisma.trainingPlan.upsert({
    where: { id: `plan-${horse2.id}` },
    update: {},
    create: {
      id: `plan-${horse2.id}`,
      planCode: 'GA-000002',
      horseId: horse2.id,
      trainerUserId: trainer.id,
      phaseName: 'Phục hồi chức năng & Vận động nhẹ',
      objective: 'Chỉ cho phép bài tập đi bộ nhẹ không quá 800m.',
      targetSpeed: 20.0,
      targetDistance: 800,
      trackSurface: TrackSurface.TURF,
      startDate: new Date(now.getTime() - 5 * 86400000),
      endDate: new Date(now.getTime() + 25 * 86400000),
      status: PlanStatus.ACTIVE,
    },
  });

  await prisma.workoutSession.upsert({
    where: { id: `w-blocked-${horse2.id}` },
    update: {},
    create: {
      id: `w-blocked-${horse2.id}`,
      trainingPlanId: plan2.id,
      horseId: horse2.id,
      assignedStaffUserId: groom1.id,
      scheduledDate: new Date(now.getTime() + 1 * 86400000),
      distanceMeters: 1600,
      status: WorkoutStatus.BLOCKED,
      workoutType: 'TRIAL',
      intensity: 'HEAVY',
      trackSurface: 'TURF',
      trainerNotes: 'Bị chặn tự động bởi Khóa Y Tế LOCK-HR-000002-001 (RULE-MED-01)',
    },
  });

  // MISSED workout: Bài tập bị lỡ ngày hôm qua
  await prisma.workoutSession.upsert({
    where: { id: `w-missed-${horse1.id}` },
    update: {},
    create: {
      id: `w-missed-${horse1.id}`,
      trainingPlanId: plan1.id,
      horseId: horse1.id,
      assignedStaffUserId: groom1.id,
      scheduledDate: new Date(now.getTime() - 1 * 86400000),
      distanceMeters: 1000,
      status: WorkoutStatus.MISSED,
      workoutType: 'TROT',
      intensity: 'LIGHT',
      trackSurface: 'TURF',
      trainerNotes: 'Bỏ lỡ do thời tiết mưa bão ngập đường chạy.',
    },
  });

  await prisma.counter.upsert({
    where: { name: 'training_plan' },
    update: { value: 4 },
    create: { name: 'training_plan', value: 4 },
  });
  console.log(`[5/9] Seeded Training Plans (ACTIVE, COMPLETED, DRAFT) & Workouts (COMPLETED, SCHEDULED, BLOCKED, MISSED)`);

  // 11. Chăm Sóc Định Kỳ (Catalogs & Schedules: PENDING, COMPLETED, OVERDUE)
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

  const catDental = await prisma.preventiveTypeCatalog.upsert({
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

  // PENDING
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

  // COMPLETED
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

  // OVERDUE
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
  console.log(`[6/9] Seeded Preventive Care (PENDING, COMPLETED, OVERDUE)`);

  // 12. Thông Báo Mẫu (Notifications: Cả chưa đọc và đã đọc)
  const notificationsData = [
    {
      userId: manager.id,
      type: 'ACCOUNT_REGISTRATION_SUBMITTED',
      category: NotificationCategory.ACCOUNT,
      title: 'New Account Pending Approval',
      message: 'Trần Văn Nam has registered for Groom Hand role and is pending approval.',
      senderName: 'System Registration',
      readAt: null,
    },
    {
      userId: manager.id,
      type: 'HORSE_STATUS_CHANGED',
      category: NotificationCategory.HORSE,
      title: 'Horse Status Update',
      message: 'Northern Dancer Legacy was placed on Medical Lock due to acute desmitis.',
      senderName: vet.fullName,
      readAt: null,
    },
    {
      userId: trainer.id,
      type: 'TRAINING_LOCK_PLACED',
      category: NotificationCategory.LOCK,
      title: 'Training Lock Placed',
      message: 'Medical Lock LOCK-HR-000002-001 placed on Northern Dancer Legacy. Heavy workouts blocked.',
      senderName: vet.fullName,
      readAt: null,
    },
    {
      userId: vet.id,
      type: 'PREVENTIVE_OVERDUE',
      category: NotificationCategory.MEDICAL,
      title: 'Care Schedule Overdue',
      message: 'Farrier Hoof Care schedule for Northern Dancer Legacy is overdue by 5 days.',
      senderName: 'System Monitor',
      readAt: null,
    },
    {
      userId: groom1.id,
      type: 'STALL_ASSIGNED',
      category: NotificationCategory.HORSE,
      title: 'New Stall Allocation',
      message: 'You have been assigned as primary groom for Thunderbolt Swift at STALL-A01.',
      senderName: manager.fullName,
      readAt: new Date(Date.now() - 2 * 86400000),
    },
    {
      userId: owner1.id,
      type: 'WORKOUT_COMPLETED',
      category: NotificationCategory.TRAINING,
      title: 'Workout Completed',
      message: 'Thunderbolt Swift completed a trial workout session with score 8.9.',
      senderName: trainer.fullName,
      readAt: null,
    },
  ];

  for (const [i, n] of notificationsData.entries()) {
    await prisma.notification.upsert({
      where: { dedupeKey: `seed-notif-${i + 1}` },
      update: {},
      create: {
        ...n,
        dedupeKey: `seed-notif-${i + 1}`,
      },
    });
  }
  console.log(`[7/9] Seeded In-app Notifications (Unread & Read)`);

  // 13. Nhật Ký Hệ Thống (Audit Logs: Đa dạng loại hành động)
  const auditLogs = [
    {
      userId: manager.id,
      action: 'USER_REGISTERED',
      entityName: 'User',
      entityId: 'pending-groom-id',
      newValuesJson: JSON.stringify({ email: 'pending.groom@gmail.com', role: 'GROOM', status: 'PENDING_APPROVAL' }),
      timestamp: new Date(Date.now() - 5 * 86400000),
    },
    {
      userId: manager.id,
      action: 'STALL_ALLOCATION_CREATED',
      entityName: 'StallAllocation',
      entityId: `alloc-${horse1.id}`,
      newValuesJson: JSON.stringify({ horseCode: horse1.horseCode, stallCode: 'STALL-A01', groom: groom1.fullName }),
      timestamp: new Date(Date.now() - 4 * 86400000),
    },
    {
      userId: vet.id,
      action: 'MEDICAL_LOCK_APPLIED',
      entityName: 'MedicalLock',
      entityId: 'LOCK-HR-000002-001',
      newValuesJson: JSON.stringify({ horseCode: horse2.horseCode, reason: 'Suspensory ligament acute desmitis', restDays: 14 }),
      timestamp: new Date(Date.now() - 3 * 86400000),
    },
    {
      userId: trainer.id,
      action: 'TRAINING_PLAN_CREATED',
      entityName: 'TrainingPlan',
      entityId: plan1.id,
      newValuesJson: JSON.stringify({ planCode: 'GA-000001', horseCode: horse1.horseCode, phaseName: plan1.phaseName }),
      timestamp: new Date(Date.now() - 2 * 86400000),
    },
    {
      userId: groom1.id,
      action: 'WORKOUT_SESSION_COMPLETED',
      entityName: 'WorkoutSession',
      entityId: `w1-${horse1.id}`,
      newValuesJson: JSON.stringify({ horseCode: horse1.horseCode, score: 8.9, duration: 72.0 }),
      timestamp: new Date(Date.now() - 1 * 86400000),
    },
  ];

  for (const a of auditLogs) {
    await prisma.auditLog.create({ data: a });
  }
  console.log(`[8/9] Seeded Audit Trail Records`);

  // 14. Flow 5: Tournaments, Registrations, Results & Financial Invoices
  const t1 = await prisma.tournament.upsert({
    where: { id: 'seed-tourn-1' },
    update: {},
    create: {
      id: 'seed-tourn-1',
      name: 'Grand Autumn Cup 2026',
      raceDate: new Date('2026-10-10'),
      location: 'Saigon Racecourse - Track A',
      distanceMeters: 2400,
      trackType: TrackSurface.TURF,
      prizePool: 500000000,
      registrationDeadline: new Date('2026-10-01'),
      status: TournamentStatus.COMPLETED,
    },
  });

  await prisma.tournament.upsert({
    where: { id: 'seed-tourn-2' },
    update: {},
    create: {
      id: 'seed-tourn-2',
      name: 'Saigon Spring Sprint 2026',
      raceDate: new Date('2026-11-15'),
      location: 'Saigon Racecourse - Sprint Track',
      distanceMeters: 1200,
      trackType: TrackSurface.SYNTHETIC,
      prizePool: 200000000,
      registrationDeadline: new Date('2026-11-05'),
      status: TournamentStatus.OPEN_REGISTRATION,
    },
  });

  await prisma.tournament.upsert({
    where: { id: 'seed-tourn-3' },
    update: {},
    create: {
      id: 'seed-tourn-3',
      name: 'National Endurance Derby 2026',
      raceDate: new Date('2026-12-20'),
      location: 'Da Lat Highland Turf Club',
      distanceMeters: 3200,
      trackType: TrackSurface.DIRT,
      prizePool: 750000000,
      registrationDeadline: new Date('2026-12-05'),
      status: TournamentStatus.UPCOMING,
    },
  });

  // Registrations & Results for t1
  const reg1 = await prisma.tournamentRegistration.upsert({
    where: { tournamentId_horseId: { tournamentId: t1.id, horseId: horse1.id } },
    update: {},
    create: {
      id: 'seed-reg-1',
      tournamentId: t1.id,
      horseId: horse1.id,
      registeredByTrainerId: trainer.id,
      status: RegistrationStatus.CONFIRMED,
      registrationDate: new Date('2026-09-28'),
      notes: 'Peak fitness for Autumn Cup',
    },
  });

  await prisma.tournamentResult.upsert({
    where: { registrationId: reg1.id },
    update: {},
    create: {
      id: 'seed-res-1',
      registrationId: reg1.id,
      finalRank: 1,
      finishTimeSeconds: 142.5,
      avgSpeedKmh: 60.63,
      prizeMoneyWon: 71428571.43,
      officialNotes: 'Champion of Grand Autumn Cup 2026 - Outstanding finish',
    },
  });

  // Financial Invoices (Flow 5 Ledger)
  await prisma.financialInvoice.upsert({
    where: { id: 'seed-inv-1' },
    update: {},
    create: {
      id: 'seed-inv-1',
      horseId: horse1.id,
      ownerId: owner1.id,
      billingPeriod: '2026-10',
      boardingFee: 15000000,
      medicalFee: 8500000,
      trainingFee: 12000000,
      prizeCredit: 50000000, // 70% of ~71.4M VND
      netAmount: -14500000, // Negative means Club Payout to Owner!
      status: InvoiceStatus.PAID,
      invoiceUrl: '/invoices/INV-2026-10-HR-000001.pdf',
    },
  });

  await prisma.financialInvoice.upsert({
    where: { id: 'seed-inv-2' },
    update: {},
    create: {
      id: 'seed-inv-2',
      horseId: horse1.id,
      ownerId: owner1.id,
      billingPeriod: '2026-09',
      boardingFee: 15000000,
      medicalFee: 3200000,
      trainingFee: 12000000,
      prizeCredit: 0,
      netAmount: 30200000,
      status: InvoiceStatus.PAID,
      invoiceUrl: '/invoices/INV-2026-09-HR-000001.pdf',
    },
  });

  await prisma.financialInvoice.upsert({
    where: { id: 'seed-inv-3' },
    update: {},
    create: {
      id: 'seed-inv-3',
      horseId: horse1.id,
      ownerId: owner1.id,
      billingPeriod: '2026-11',
      boardingFee: 15000000,
      medicalFee: 1500000,
      trainingFee: 12000000,
      prizeCredit: 0,
      netAmount: 28500000,
      status: InvoiceStatus.DRAFT,
      invoiceUrl: null,
    },
  });

  console.log(`[9/10] Seeded Flow 5 Tournaments, Results & Financial Invoices`);

  // ----------------------------------------------------------------
  // Flow 4 Phase 1: Danh mục Ca trực (ShiftCatalog)
  // ----------------------------------------------------------------
  const shiftDefs = [
    {
      code: 'SHIFT_MORNING',
      name: 'Ca Sáng (05:00 - 13:00)',
      startTime: '05:00',
      endTime: '13:00',
      isOvernight: false,
      sortOrder: 1,
      description: 'Ca sáng: Cho ăn bữa 1, dọn chuồng, chuẩn bị ngựa tập buổi sáng',
    },
    {
      code: 'SHIFT_AFTERNOON',
      name: 'Ca Chiều (13:00 - 21:00)',
      startTime: '13:00',
      endTime: '21:00',
      isOvernight: false,
      sortOrder: 2,
      description: 'Ca chiều: Tắm rửa, chải lông, ngâm chân đá, cho ăn bữa chiều',
    },
    {
      code: 'SHIFT_NIGHT',
      name: 'Ca Đêm (21:00 - 05:00)',
      startTime: '21:00',
      endTime: '05:00',
      isOvernight: true,
      sortOrder: 3,
      description: 'Ca đêm: Trực tuần tra an ninh chuồng trại, kiểm tra sức khỏe đột xuất',
    },
  ];

  const shiftIds: Record<string, string> = {};
  for (const s of shiftDefs) {
    const shift = await prisma.shiftCatalog.upsert({
      where: { code: s.code },
      update: { name: s.name, startTime: s.startTime, endTime: s.endTime, isOvernight: s.isOvernight, sortOrder: s.sortOrder, description: s.description },
      create: s,
    });
    shiftIds[s.code] = shift.id;
  }
  console.log(`[*] Seeded 3 Standard Shift Catalogs (Morning, Afternoon, Night)`);

  // ----------------------------------------------------------------
  // Flow 4 Phase 1: Danh mục Vật tư & Y tế (SupplyCatalog)
  // ----------------------------------------------------------------
  const supplyDefs = [
    {
      code: 'SUP_HAY_ALFALFA',
      name: 'Cỏ khô Alfalfa (Lục lăng cao cấp)',
      category: SupplyCategory.FEED_HAY,
      unit: SupplyUnit.KG,
      unitPrice: 45000,
      description: 'Cỏ Alfalfa giàu đạm và canxi cho ngựa đua đang trong chu kỳ tải cao',
    },
    {
      code: 'SUP_HAY_TIMOTHY',
      name: 'Cỏ khô Timothy nhập khẩu',
      category: SupplyCategory.FEED_HAY,
      unit: SupplyUnit.KG,
      unitPrice: 55000,
      description: 'Cỏ Timothy chất xơ cao, lượng đường thấp, cân bằng tiêu hóa',
    },
    {
      code: 'SUP_GRAIN_OATS',
      name: 'Yến mạch cán vỡ tiêu hóa nhanh',
      category: SupplyCategory.FEED_GRAIN,
      unit: SupplyUnit.KG,
      unitPrice: 38000,
      description: 'Ngũ cốc cung cấp carbohydrate chuyển hóa nhanh cho buổi tập cường độ cao',
    },
    {
      code: 'SUP_GRAIN_BARLEY',
      name: 'Đại mạch hấp cán mỏng',
      category: SupplyCategory.FEED_GRAIN,
      unit: SupplyUnit.KG,
      unitPrice: 42000,
      description: 'Cung cấp năng lượng bền bỉ và tạo cơ bắp',
    },
    {
      code: 'SUP_VIT_E_SELENIUM',
      name: 'Vitamin E & Selenium EquiMuscle',
      category: SupplyCategory.SUPPLEMENT_VITAMIN,
      unit: SupplyUnit.PACKET,
      unitPrice: 120000,
      description: 'Chống oxy hóa, bảo vệ tế bào cơ bắp sau các bài phi nước đại',
    },
    {
      code: 'SUP_ELECTROLYTE_PLUS',
      name: 'Bột điện giải bù khoáng HydratePlus',
      category: SupplyCategory.SUPPLEMENT_ELECTROLYTE,
      unit: SupplyUnit.PACKET,
      unitPrice: 85000,
      description: 'Bù nước, Natri, Kali, Magie ngay sau khi hoàn thành buổi tập',
    },
    {
      code: 'SUP_PROBIOTIC_PASTE',
      name: 'Men vi sinh đường ruột EquiFlora dạng ống',
      category: SupplyCategory.SUPPLEMENT_GENERAL,
      unit: SupplyUnit.VIAL,
      unitPrice: 150000,
      description: 'Ổn định hệ vi sinh vật manh tràng, giảm nguy cơ đau bụng colics',
    },
    {
      code: 'SUP_MED_PHENYLBUTAZONE',
      name: 'Phenylbutazone 20% dung dịch tiêm',
      category: SupplyCategory.MEDICINE,
      unit: SupplyUnit.BOTTLE,
      unitPrice: 320000,
      withdrawalDays: 7,
      description: 'Kháng viêm giảm đau NSAID cho chấn thương gân cơ',
    },
    {
      code: 'SUP_MED_FLUNIXIN',
      name: 'Flunixin Meglumine 50mg/ml',
      category: SupplyCategory.MEDICINE,
      unit: SupplyUnit.BOTTLE,
      unitPrice: 410000,
      withdrawalDays: 5,
      description: 'Hạ sốt, giảm đau nội tạng và đau bụng cấp tính',
    },
    {
      code: 'SUP_DEWORM_IVERMECTIN',
      name: 'Thuốc tẩy giun Ivermectin Paste 1.87%',
      category: SupplyCategory.DEWORMER,
      unit: SupplyUnit.VIAL,
      unitPrice: 180000,
      withdrawalDays: 0,
      description: 'Tẩy ký sinh trùng đường ruột định kỳ',
    },
    {
      code: 'SUP_TOOL_LEG_WRAP',
      name: 'Bộ băng quấn ống chân bảo vệ gân',
      category: SupplyCategory.TOOL_EQUIPMENT,
      unit: SupplyUnit.SET,
      unitPrice: 250000,
      description: 'Dụng cụ bảo vệ khớp cổ chân và gân chuối',
    },
    {
      code: 'SUP_CLEAN_BETADINE',
      name: 'Dung dịch sát trùng Povidone Iodine 10%',
      category: SupplyCategory.CLEANING_SUPPLY,
      unit: SupplyUnit.BOTTLE,
      unitPrice: 95000,
      description: 'Sát trùng vết trầy xước và vệ sinh móng chân',
    },
  ];

  for (const sup of supplyDefs) {
    await prisma.supplyCatalog.upsert({
      where: { code: sup.code },
      update: { name: sup.name, category: sup.category, unit: sup.unit, unitPrice: sup.unitPrice, withdrawalDays: sup.withdrawalDays, description: sup.description },
      create: sup,
    });
  }
  console.log(`[*] Seeded 12 Comprehensive Supply Catalog Items across Feeds, Supplements, Medicine & Tools`);

  // ----------------------------------------------------------------
  // Flow 4 Phase 1: Phân ca trực mẫu (ShiftRoster) cho tuần hiện tại
  // ----------------------------------------------------------------
  const today = new Date();
  const currentMonday = new Date(today);
  const dayOfWeek = currentMonday.getDay(); // 0 is Sunday
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  currentMonday.setDate(currentMonday.getDate() + diffToMonday);
  currentMonday.setHours(0, 0, 0, 0);

  const zoneAId = zoneIds['Zone A - Barn 1'];
  const zoneBId = zoneIds['Zone B - Barn 2'];

  if (zoneAId && zoneBId && shiftIds['SHIFT_MORNING'] && shiftIds['SHIFT_AFTERNOON']) {
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const rosterDate = new Date(currentMonday);
      rosterDate.setDate(rosterDate.getDate() + dayOffset);

      // Groom 1 trực Ca Sáng Khu A
      await prisma.shiftRoster.upsert({
        where: {
          date_shiftId_zoneId_groomUserId: {
            date: rosterDate,
            shiftId: shiftIds['SHIFT_MORNING'],
            zoneId: zoneAId,
            groomUserId: groom1.id,
          },
        },
        update: {},
        create: {
          date: rosterDate,
          shiftId: shiftIds['SHIFT_MORNING'],
          zoneId: zoneAId,
          groomUserId: groom1.id,
          createdById: manager.id,
          notes: 'Phân ca định kỳ đầu tuần',
        },
      });

      // Groom 2 trực Ca Chiều Khu A
      await prisma.shiftRoster.upsert({
        where: {
          date_shiftId_zoneId_groomUserId: {
            date: rosterDate,
            shiftId: shiftIds['SHIFT_AFTERNOON'],
            zoneId: zoneAId,
            groomUserId: groom2.id,
          },
        },
        update: {},
        create: {
          date: rosterDate,
          shiftId: shiftIds['SHIFT_AFTERNOON'],
          zoneId: zoneAId,
          groomUserId: groom2.id,
          createdById: manager.id,
          notes: 'Phân ca định kỳ đầu tuần',
        },
      });
    }
    console.log(`[*] Seeded 14 Shift Roster Allocations for current week across Zone A`);
  }

  console.log('[10/10] --- Comprehensive EquiFlow Database Seeding Completed 100%! ---');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
