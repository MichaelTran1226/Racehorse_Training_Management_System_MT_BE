import { IsISO8601, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { HORSE_NAME_RE, normalizeName, RFID_RE } from '../horse-rules';

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
    description: 'RFID tag code (4-32 A-Z, 0-9, -)',
    example: 'RFID-985141002341',
  })
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

  @ApiPropertyOptional({ description: 'Initial Stall ID' })
  @IsOptional()
  @IsString()
  stallId?: string;
}
