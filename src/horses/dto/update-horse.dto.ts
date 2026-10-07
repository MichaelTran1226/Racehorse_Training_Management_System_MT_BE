import { IsEnum, IsISO8601, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { HorseStatus } from '@prisma/client';

export class UpdateHorseDto {
  @ApiPropertyOptional({ description: 'Horse name (2-100 characters)' })
  @IsOptional()
  @IsString({ message: 'Horse name must be a string.' })
  @Length(2, 100, { message: 'Horse name must be between 2 and 100 characters.' })
  @Matches(/^[a-zA-Z0-9\s'.-]+$/, {
    message: "Horse name can only contain alphanumeric characters, spaces, and ' - .",
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

  @ApiPropertyOptional({ description: 'RFID tag code (must follow RFID-... prefix)' })
  @IsOptional()
  @IsString()
  @Matches(/^RFID-[A-Z0-9-]{4,28}$/, {
    message:
      "RFID tag must start with 'RFID-' prefix followed by 4-28 uppercase letters, digits, or hyphens (e.g. RFID-985141002341).",
  })
  rfid?: string;

  @ApiPropertyOptional({ enum: HorseStatus })
  @IsOptional()
  @IsEnum(HorseStatus, { message: 'Invalid horse status.' })
  status?: HorseStatus;

  @ApiPropertyOptional({ description: 'Owner User ID' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Avatar URL' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
