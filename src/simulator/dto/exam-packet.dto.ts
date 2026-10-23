import { Type } from 'class-transformer';
import {
  Equals,
  IsDefined,
  IsISO8601,
  IsIn,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class StartExamDto {
  @IsOptional()
  @IsUUID()
  medicalRecordId?: string;
}

class TemperatureMeasurementDto {
  @IsNumber()
  @Min(35)
  @Max(43)
  value: number;

  @Equals('CELSIUS')
  unit: 'CELSIUS';
}

class HeartRateMeasurementDto {
  @IsNumber()
  @Min(20)
  @Max(120)
  value: number;

  @Equals('BPM')
  unit: 'BPM';
}

class RespiratoryRateMeasurementDto {
  @IsNumber()
  @Min(4)
  @Max(60)
  value: number;

  @Equals('BREATHS_PER_MINUTE')
  unit: 'BREATHS_PER_MINUTE';
}

class WeightMeasurementDto {
  @IsNumber()
  @Min(200)
  @Max(800)
  value: number;

  @Equals('KG')
  unit: 'KG';
}

class ExamMetricsDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => TemperatureMeasurementDto)
  temperature: TemperatureMeasurementDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => HeartRateMeasurementDto)
  resting_heart_rate: HeartRateMeasurementDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => RespiratoryRateMeasurementDto)
  respiratory_rate: RespiratoryRateMeasurementDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => WeightMeasurementDto)
  weight: WeightMeasurementDto;
}

export class ExamFinishedPacketDto {
  @IsIn(['sim:exam_finished'])
  event: 'sim:exam_finished';

  @IsString()
  @IsNotEmpty()
  session_id: string;

  @IsUUID()
  horse_id: string;

  @IsISO8601()
  captured_at: string;

  @IsString()
  @IsNotEmpty()
  model_version: string;

  @Equals('EQUIFLOW_SIMULATOR')
  source: 'EQUIFLOW_SIMULATOR';

  @IsDefined()
  @ValidateNested()
  @Type(() => ExamMetricsDto)
  metrics: ExamMetricsDto;
}
