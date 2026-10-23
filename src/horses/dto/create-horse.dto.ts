import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { HORSE_GENDERS, HORSE_NAME_RE, normalizeName } from '../horse-rules';

export class CreateHorseDto {
  @ApiProperty({ description: 'Horse name (2-100 characters)', example: 'Thunderbolt Swift' })
  @IsNotEmpty({ message: 'Horse name is required.' })
  @IsString({ message: 'Horse name must be a string.' })
  @Length(2, 100, { message: 'Horse name must be between 2 and 100 characters.' })
  @Transform(({ value }) => normalizeName(value))
  @Matches(HORSE_NAME_RE, {
    message: "Horse name can only contain letters (accents allowed), digits, spaces, and ' - .",
  })
  name: string;

  @ApiProperty({ description: 'Horse breed', example: 'Thoroughbred' })
  @IsNotEmpty({ message: 'Please select a horse breed.' })
  @IsString({ message: 'Invalid horse breed string.' })
  breed: string;

  @ApiProperty({ description: 'Date of birth (ISO 8601)', example: '2021-04-12' })
  @IsNotEmpty({ message: 'Date of birth is required.' })
  @IsISO8601({}, { message: 'Date of birth must follow YYYY-MM-DD format.' })
  dob: string;

  @ApiProperty({ description: 'Gender: Stallion, Mare, Gelding', example: 'Stallion' })
  @IsNotEmpty({ message: 'Please select a gender.' })
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
  gender: string;

  @ApiProperty({ description: 'Coat color', example: 'Bay Dark' })
  @IsNotEmpty({ message: 'Please select a coat color.' })
  @IsString({ message: 'Invalid coat color string.' })
  color: string;

  @ApiPropertyOptional({
    description: 'Microchip number (exactly 15 digits, auto-generated if omitted)',
    example: '985141002341001',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{15}$/, { message: 'Microchip number must consist of exactly 15 digits.' })
  microchip?: string;

  @ApiPropertyOptional({ description: 'Owner User ID' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ description: 'Weight in kg (> 0)', example: 485.5 })
  @IsOptional()
  @IsNumber({}, { message: 'Cân nặng phải là số.' })
  @Min(0.01, { message: 'Cân nặng phải lớn hơn 0 kg.' })
  weightKg?: number;

  @ApiPropertyOptional({ description: 'Initial Stall ID' })
  @IsOptional()
  @IsString()
  stallId?: string;
}
