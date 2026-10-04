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
  @ApiProperty({ description: 'Tên ngựa (2-100 ký tự)', example: 'Thunderbolt Swift' })
  @IsNotEmpty({ message: 'Tên ngựa là bắt buộc.' })
  @IsString({ message: 'Tên ngựa phải là chuỗi ký tự.' })
  @Length(2, 100, { message: 'Tên ngựa phải từ 2 đến 100 ký tự.' })
  @Matches(/^[a-zA-Z0-9\s'.-]+$/, {
    message: "Tên ngựa chỉ được chứa chữ cái, chữ số, khoảng trắng và các ký tự ' - .",
  })
  name: string;

  @ApiProperty({ description: 'Giống ngựa', example: 'Thoroughbred' })
  @IsNotEmpty({ message: 'Vui lòng chọn giống ngựa.' })
  @IsString({ message: 'Giống ngựa không hợp lệ.' })
  breed: string;

  @ApiProperty({ description: 'Ngày sinh (ISO 8601)', example: '2021-04-12' })
  @IsNotEmpty({ message: 'Ngày sinh là bắt buộc.' })
  @IsISO8601({}, { message: 'Ngày sinh không đúng định dạng YYYY-MM-DD.' })
  dob: string;

  @ApiProperty({ description: 'Giới tính', example: 'Colt' })
  @IsNotEmpty({ message: 'Vui lòng chọn giới tính.' })
  @IsString({ message: 'Giới tính không hợp lệ.' })
  gender: string;

  @ApiProperty({ description: 'Màu lông', example: 'Bay Dark' })
  @IsNotEmpty({ message: 'Vui lòng chọn màu lông.' })
  @IsString({ message: 'Màu lông không hợp lệ.' })
  color: string;

  @ApiProperty({ description: 'Số microchip (đúng 15 chữ số)', example: '985141002341001' })
  @IsNotEmpty({ message: 'Số microchip là bắt buộc.' })
  @IsString()
  @Matches(/^\d{15}$/, { message: 'Số microchip phải gồm đúng 15 chữ số.' })
  microchip: string;

  @ApiPropertyOptional({
    description: 'Mã thẻ RFID (4-32 ký tự, A-Z, 0-9, -)',
    example: 'RFID-985141002341',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9-]{4,32}$/, {
    message:
      'Mã thẻ RFID phải từ 4 đến 32 ký tự, chỉ gồm chữ in hoa A-Z, chữ số và dấu gạch ngang.',
  })
  rfid?: string;

  @ApiPropertyOptional({ enum: HorseStatus, default: HorseStatus.RESTING })
  @IsOptional()
  @IsEnum(HorseStatus, { message: 'Trạng thái không hợp lệ.' })
  status?: HorseStatus;

  @ApiPropertyOptional({ description: 'ID chủ sở hữu' })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'URL ảnh đại diện' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ description: 'ID ô chuồng ban đầu' })
  @IsOptional()
  @IsString()
  stallId?: string;
}
