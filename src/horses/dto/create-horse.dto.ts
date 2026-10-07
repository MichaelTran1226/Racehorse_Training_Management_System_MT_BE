import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HorseStatus } from '@prisma/client';

export class CreateHorseDto {
  @ApiProperty({ description: 'Horse name (2-100 characters)', example: 'Thunderbolt Swift' })
  @IsNotEmpty({ message: 'Horse name is required.' })
  @IsString({ message: 'Horse name must be a string.' })
  @Length(2, 100, { message: 'Horse name must be between 2 and 100 characters.' })
  @Matches(/^[a-zA-Z0-9\s'.-]+$/, {
    message: "Horse name can only contain alphanumeric characters, spaces, and ' - .",
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

  @ApiProperty({ description: 'Gender', example: 'Colt' })
  @IsNotEmpty({ message: 'Please select a gender.' })
  @IsString({ message: 'Invalid gender string.' })
  gender: string;

  @ApiProperty({ description: 'Coat color', example: 'Bay Dark' })
  @IsNotEmpty({ message: 'Please select a coat color.' })
  @IsString({ message: 'Invalid coat color string.' })
  color: string;

  @ApiProperty({ description: 'Microchip number (exactly 15 digits)', example: '985141002341001' })
  @IsNotEmpty({ message: 'Microchip number is required.' })
  @IsString()
  @Matches(/^\d{15}$/, { message: 'Microchip number must consist of exactly 15 digits.' })
  microchip: string;

  @ApiPropertyOptional({
    description: 'RFID tag code (must follow RFID-... prefix)',
    example: 'RFID-985141002341',
  })
  @IsOptional()
  @IsString()
feat/p1-01-canonical-horses-be
  @Matches(/^RFID-[A-Z0-9-]{4,28}$/, {
    message:
      "RFID tag must start with 'RFID-' prefix followed by 4-28 uppercase letters, digits, or hyphens (e.g. RFID-985141002341).",

  @Matches(/^RFID-[A-Z0-9-]{1,27}$/, {
    message:
      'Mã thẻ RFID phải bắt đầu bằng "RFID-" và dài từ 6 đến 32 ký tự, chỉ gồm chữ in hoa A-Z, chữ số và dấu gạch ngang.',
main
  })
  rfid?: string;

  @ApiPropertyOptional({ enum: HorseStatus, default: HorseStatus.RESTING })
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

  @ApiPropertyOptional({ description: 'Initial Stall ID' })
  @IsOptional()
  @IsString()
  stallId?: string;
}

