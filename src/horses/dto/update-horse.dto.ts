import { IsEnum, IsISO8601, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { HorseStatus } from '@prisma/client';

export class UpdateHorseDto {
  @ApiPropertyOptional({ description: 'Tên ngựa (2-100 ký tự)' })
  @IsOptional()
  @IsString({ message: 'Tên ngựa phải là chuỗi ký tự.' })
  @Length(2, 100, { message: 'Tên ngựa phải từ 2 đến 100 ký tự.' })
  @Matches(/^[a-zA-Z0-9\s'.-]+$/, {
    message: "Tên ngựa chỉ được chứa chữ cái, chữ số, khoảng trắng và các ký tự ' - .",
  })
  name?: string;

  @ApiPropertyOptional({ description: 'Giống ngựa' })
  @IsOptional()
  @IsString()
  breed?: string;

  @ApiPropertyOptional({ description: 'Ngày sinh (ISO 8601)' })
  @IsOptional()
  @IsISO8601({}, { message: 'Ngày sinh không đúng định dạng YYYY-MM-DD.' })
  dob?: string;

  @ApiPropertyOptional({ description: 'Giới tính' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: 'Màu lông' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Số microchip (đúng 15 chữ số)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{15}$/, { message: 'Số microchip phải gồm đúng 15 chữ số.' })
  microchip?: string;

  @ApiPropertyOptional({ description: 'Mã thẻ RFID (4-32 ký tự, A-Z, 0-9, -)' })
  @IsOptional()
  @IsString()
  @Matches(/^RFID-[A-Z0-9-]{1,27}$/, {
    message:
      'Mã thẻ RFID phải bắt đầu bằng "RFID-" và dài từ 6 đến 32 ký tự, chỉ gồm chữ in hoa A-Z, chữ số và dấu gạch ngang.',
  })
  rfid?: string;

  @ApiPropertyOptional({ enum: HorseStatus })
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
}
