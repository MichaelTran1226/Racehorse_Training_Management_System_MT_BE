import { IsOptional, IsString } from 'class-validator';

export class HealthBoardQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  healthGroup?: string;

  @IsOptional()
  @IsString()
  isLocked?: string;

  @IsOptional()
  @IsString()
  zone?: string;
}
