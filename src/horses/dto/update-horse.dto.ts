import { IsISO8601, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { HORSE_NAME_RE, normalizeName, RFID_RE } from '../horse-rules';

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

  @ApiPropertyOptional({ description: 'Gender' })
  @IsOptional()
  @IsString({ message: 'Invalid gender string.' })
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

  @ApiPropertyOptional({ description: 'RFID tag code (4-32 A-Z, 0-9, -)' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(RFID_RE, {
    message: 'RFID tag must be 4-32 characters: uppercase letters, digits, or hyphens.',
  })
  rfid?: string;

  @ApiPropertyOptional({ description: 'Owner User ID' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
