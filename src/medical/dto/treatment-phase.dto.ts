import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTreatmentPhaseDto {
  @IsString()
  @MinLength(2)
  phaseName: string;

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;

  @IsOptional()
  @IsString()
  target?: string;

  @IsOptional()
  @IsString()
  allowedActivityLevel?: string;

  @IsOptional()
  @IsString()
  allowedActivity?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  careInstructions?: string[];
}

export class UpdateTreatmentPhaseDto {
  @IsOptional()
  @IsString()
  phaseName?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  target?: string;

  @IsOptional()
  @IsString()
  allowedActivityLevel?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  careInstructions?: string[];
}
