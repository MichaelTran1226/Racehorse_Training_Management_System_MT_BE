import { ApiProperty } from '@nestjs/swagger';

export class HorseHeaderDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  microchipRfid: string;

  @ApiProperty()
  breed: string;

  @ApiProperty()
  gender: string;

  @ApiProperty()
  color: string;

  @ApiProperty({ nullable: true })
  avatarUrl: string | null;

  @ApiProperty()
  status: string;

  @ApiProperty()
  isMedicalLocked: boolean;

  @ApiProperty({ nullable: true })
  stallCode: string | null;

  @ApiProperty({ nullable: true })
  zone: string | null;

  @ApiProperty({ nullable: true })
  owner: { id: string; fullName: string } | null;
}

export class ActiveMedicalLockBannerDto {
  @ApiProperty()
  isLocked: boolean;

  @ApiProperty({ nullable: true })
  lockedAt: Date | null;

  @ApiProperty({ nullable: true })
  vetName: string | null;

  @ApiProperty({ nullable: true })
  lockReason: string | null;

  @ApiProperty({ nullable: true })
  recheckDate: Date | null;

  @ApiProperty({ nullable: true })
  overdueDays: number | null;
}

export class ActiveMedicationDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  dosage: string;

  @ApiProperty()
  route: string;

  @ApiProperty()
  frequency: string;

  @ApiProperty()
  untilDate: string;

  @ApiProperty()
  withdrawalDate: string;
}

export class VitalSignsDto {
  @ApiProperty()
  temperature: number;

  @ApiProperty()
  heartRate: number;

  @ApiProperty()
  respiratoryRate: number;

  @ApiProperty()
  weight: number;

  @ApiProperty()
  measuredAt: Date;
}

export class TabOverviewDto {
  @ApiProperty()
  currentStatus: string;

  @ApiProperty()
  healthGroup: string;

  @ApiProperty()
  allowedActivityLevel: string;

  @ApiProperty({ type: [String] })
  careInstructions: string[];

  @ApiProperty({ type: [ActiveMedicationDto], nullable: true })
  activeMedications: ActiveMedicationDto[] | null;

  @ApiProperty({ type: VitalSignsDto, nullable: true })
  latestVitals: VitalSignsDto | null;

  @ApiProperty({ type: [VitalSignsDto] })
  vitalsHistory: VitalSignsDto[];

  @ApiProperty({ type: [Object] })
  upcomingOverduePreventives: any[];
}

export class MedicalRecordItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  examinationDate: Date;

  @ApiProperty()
  examinationType: string;

  @ApiProperty()
  clinicalDiagnosis: string;

  @ApiProperty()
  severity: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ nullable: true })
  veterinarianName?: string | null;

  @ApiProperty({ nullable: true })
  symptoms?: string | null;

  @ApiProperty({ nullable: true })
  treatmentProtocol?: string | null;

  @ApiProperty({ nullable: true })
  prescriptionDetails?: string | null;
}

export class InjuryItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  coordinateX: number;

  @ApiProperty()
  coordinateY: number;

  @ApiProperty()
  anatomicalZone: string;

  @ApiProperty()
  bodySide: string;

  @ApiProperty()
  injuryType: string;

  @ApiProperty()
  severity: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  detectedDate: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class MedicalLockItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  isLocked: boolean;

  @ApiProperty()
  lockedAt: Date;

  @ApiProperty()
  expectedRestDays: number;

  @ApiProperty()
  lockReason: string;

  @ApiProperty()
  unlockConditions: string;

  @ApiProperty({ nullable: true })
  unlockedAt: Date | null;

  @ApiProperty()
  vetName: string;

  @ApiProperty({ nullable: true })
  unlockVetName: string | null;

  @ApiProperty({ nullable: true })
  recheckNotes: string | null;
}

export class PreventiveScheduleItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  scheduleType: string;

  @ApiProperty()
  category: string;

  @ApiProperty({ nullable: true })
  lastPerformedDate: Date | null;

  @ApiProperty({ nullable: true })
  performedBy: string | null;

  @ApiProperty()
  dueDate: Date;

  @ApiProperty()
  status: string;
}

export class ObservationNoteItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  shiftDate: Date;

  @ApiProperty()
  shiftType: string;

  @ApiProperty()
  recordedBy: string;

  @ApiProperty()
  content: string;

  @ApiProperty()
  urgency: 'NORMAL' | 'ATTENTION' | 'URGENT';

  @ApiProperty()
  isUrgent: boolean;
}

export class HealthBoardTabsDto {
  @ApiProperty({ type: TabOverviewDto })
  overview: TabOverviewDto;

  @ApiProperty({ type: [MedicalRecordItemDto], nullable: true })
  medicalRecords: MedicalRecordItemDto[] | null;

  @ApiProperty({ type: [InjuryItemDto] })
  injuries: InjuryItemDto[];

  @ApiProperty({ type: [MedicalLockItemDto], nullable: true })
  medicalLocks: MedicalLockItemDto[] | null;

  @ApiProperty({ type: [PreventiveScheduleItemDto] })
  preventiveSchedules: PreventiveScheduleItemDto[];

  @ApiProperty({ type: [ObservationNoteItemDto], nullable: true })
  observationNotes: ObservationNoteItemDto[] | null;
}

export class HealthBoardResponseDto {
  @ApiProperty({ type: HorseHeaderDto })
  horse: HorseHeaderDto;

  @ApiProperty({ type: ActiveMedicalLockBannerDto })
  medicalLockBanner: ActiveMedicalLockBannerDto;

  @ApiProperty({ type: HealthBoardTabsDto })
  tabs: HealthBoardTabsDto;
}
