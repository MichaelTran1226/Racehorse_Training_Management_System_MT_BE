import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { HORSE_GENDERS, HORSE_NAME_RE, normalizeName } from '../horse-rules';

export class UpdateHorseDto {
  @ApiPropertyOptional({ description: 'Horse name (2-100 characters)' })
  @IsOptional()
  @IsString({ message: 'Horse name must be a string.' })
  @Length(2, 100, { message: 'Horse name must be between 2 and 100 characters.' })
  @Transform(({ value }) => normalizeName(value))
  @Matches(HORSE_NAME_RE, {
    message: "Horse name can only contain letters (accents allowed), digits, spaces, and ' - .",
  })
  name?: string;

  @ApiPropertyOptional({ description: 'Horse breed' })
  @IsOptional()
  @IsString({ message: 'Invalid horse breed string.' })
  breed?: string;

  @ApiPropertyOptional({ description: 'Date of birth (ISO 8601)' })
  @IsOptional()
  @IsISO8601({}, { message: 'Date of birth must follow YYYY-MM-DD format.' })
  dob?: string;

  @ApiPropertyOptional({ description: 'Gender: Stallion, Mare, Gelding' })
  @IsOptional()
  @IsString({ message: 'Invalid gender string.' })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const v = value.trim();
      if (v.toLowerCase() === 'colt') return 'Stallion';
      if (v.toLowerCase() === 'filly') return 'Mare';
      return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
    }
    return value;
  })
  @IsIn(HORSE_GENDERS, { message: 'Please select a gender.' })
  gender?: string;

  @ApiPropertyOptional({ description: 'Coat color' })
  @IsOptional()
  @IsString({ message: 'Invalid coat color string.' })
  color?: string;

  @ApiPropertyOptional({ description: 'Microchip number (exactly 15 digits)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{15}$/, { message: 'Microchip number must consist of exactly 15 digits.' })
  microchip?: string;

  @ApiPropertyOptional({ description: 'Owner User ID' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Weight in kg (> 0)' })
  @IsOptional()
  @IsNumber({}, { message: 'Cân nặng phải là số.' })
  @Min(0.01, { message: 'Cân nặng phải lớn hơn 0 kg.' })
  weightKg?: number;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
