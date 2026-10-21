import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class HorseRefDto {
  @IsString()
  @IsNotEmpty()
  horse_id: string;

  @IsOptional()
  @IsString()
  microchip_id?: string;

  @IsOptional()
  @IsString()
  lifecycle_status?: string;

  @IsOptional()
  @IsBoolean()
  medical_lock?: boolean;
}

export class TelemetryTrackDto {
  @IsString()
  surface: string;

  @IsNumber()
  @Min(0)
  target_distance_m: number;

  @IsNumber()
  @Min(0)
  covered_distance_m: number;

  @IsString()
  track_condition: string;

  @IsInt()
  @Min(0)
  obstacles_cleared: number;

  @IsInt()
  @Min(0)
  obstacles_total: number;
}

export class TelemetryMetricsDto {
  @IsNumber()
  @Min(0)
  @Max(50)
  velocity_mps: number;

  @IsNumber()
  @Min(20)
  @Max(300)
  heart_rate_bpm: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  stamina_pct: number;

  @IsNumber()
  @Min(30)
  @Max(45)
  body_temp_c: number;

  @IsNumber()
  @Min(0)
  stride_length_m: number;

  @IsNumber()
  @Min(0)
  stride_freq_spm: number;

  @IsNumber()
  @Min(0)
  calories_kcal: number;
}

export class TelemetryTickPacketDto {
  @IsIn(['sim:telemetry_tick'])
  event: 'sim:telemetry_tick';

  @IsString()
  @IsNotEmpty()
  session_id: string;

  @IsNumber()
  timestamp_ms: number;

  @IsNumber()
  sim_time_s: number;

  @IsNumber()
  sim_speed_multiplier: number;

  @ValidateNested()
  @Type(() => HorseRefDto)
  horse: HorseRefDto;

  @ValidateNested()
  @Type(() => TelemetryTrackDto)
  track: TelemetryTrackDto;

  @ValidateNested()
  @Type(() => TelemetryMetricsDto)
  metrics: TelemetryMetricsDto;

  @IsArray()
  @IsString({ each: true })
  alerts: string[];
}

export class IncidentPayloadDto {
  @IsIn(['FRACTURE', 'LAMENESS', 'COLIC', 'FEVER'])
  kind: 'FRACTURE' | 'LAMENESS' | 'COLIC' | 'FEVER';

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsIn(['TRACK', 'STALL'])
  location: 'TRACK' | 'STALL';

  @IsOptional()
  @IsString()
  stall?: string;
}

export class IncidentSnapshotDto {
  @IsOptional()
  @IsNumber()
  covered_distance_m?: number;

  @IsOptional()
  @IsNumber()
  velocity_mps?: number;

  @IsOptional()
  @IsNumber()
  heart_rate_bpm?: number;

  @IsOptional()
  @IsNumber()
  body_temp_c?: number;
}

export class IncidentNotifyDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  managing_actors?: string[];

  @IsOptional()
  @IsString()
  veterinarian_scope?: string;
}

export class IncidentReportPacketDto {
  @IsIn(['sim:incident_report'])
  event: 'sim:incident_report';

  @IsOptional()
  @IsString()
  packet_id?: string;

  @IsOptional()
  @IsString()
  session_id: string | null;

  @IsNumber()
  timestamp_ms: number;

  @ValidateNested()
  @Type(() => HorseRefDto)
  horse: HorseRefDto;

  @ValidateNested()
  @Type(() => IncidentPayloadDto)
  incident: IncidentPayloadDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => IncidentSnapshotDto)
  snapshot?: IncidentSnapshotDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => IncidentNotifyDto)
  notify?: IncidentNotifyDto;
}

export class RacePositionDto {
  @IsInt()
  @Min(1)
  position: number;

  @IsInt()
  @Min(1)
  lane: number;

  @IsString()
  @IsNotEmpty()
  horse_id: string;

  @IsNumber()
  @Min(0)
  covered_distance_m: number;

  @IsNumber()
  gap_lengths: number;

  @IsNumber()
  @Min(0)
  velocity_mps: number;

  @IsNumber()
  @Min(0)
  heart_rate_bpm: number;

  @IsIn(['DNF', 'FINISHED', 'RUNNING'])
  status: 'DNF' | 'FINISHED' | 'RUNNING';
}

export class RaceProgressPacketDto {
  @IsIn(['sim:race_progress'])
  event: 'sim:race_progress';

  @IsString()
  @IsNotEmpty()
  session_id: string;

  @IsNumber()
  sim_time_s: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RacePositionDto)
  positions: RacePositionDto[];
}

export class SessionFinishedPacketDto {
  @IsIn(['sim:session_finished'])
  event: 'sim:session_finished';

  @IsOptional()
  @IsString()
  packet_id?: string;

  @IsString()
  @IsNotEmpty()
  session_id: string;

  @IsIn(['WORKOUT', 'RACE'])
  type: 'WORKOUT' | 'RACE';

  @IsOptional()
  @IsIn(['COMPLETED', 'ABORTED_INJURY'])
  status?: 'COMPLETED' | 'ABORTED_INJURY';

  @IsOptional()
  @ValidateNested()
  @Type(() => HorseRefDto)
  horse?: HorseRefDto;

  @IsOptional()
  @IsString()
  surface?: string;

  @IsOptional()
  @IsNumber()
  distance_planned_m?: number;

  @IsOptional()
  @IsNumber()
  distance_m?: number;

  @IsOptional()
  result?: any;

  @IsOptional()
  results?: any[];
}
