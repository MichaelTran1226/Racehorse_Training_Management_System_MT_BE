import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class CreateInvoiceDto {
  @ApiProperty({ description: 'ID con ngựa tính phí', example: 'uuid-horse-123' })
  @IsUUID()
  @IsNotEmpty()
  horseId: string;

  @ApiProperty({ description: 'ID Chủ sở hữu nhận hóa đơn', example: 'uuid-owner-123' })
  @IsUUID()
  @IsNotEmpty()
  ownerId: string;

  @ApiProperty({ description: 'Kỳ thanh toán định dạng YYYY-MM', example: '2026-10' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'billingPeriod must be in YYYY-MM format' })
  @IsNotEmpty()
  billingPeriod: string;

  @ApiPropertyOptional({ description: 'Phí lưu chuồng & dọn dẹp chuồng trại (VNĐ)', default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  boardingFee?: number = 0;

  @ApiPropertyOptional({ description: 'Phí thuốc, điều trị thú y & chăm sóc sức khỏe (VNĐ)', default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  medicalFee?: number = 0;

  @ApiPropertyOptional({ description: 'Phí dịch vụ huấn luyện & nài ngựa (VNĐ)', default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  trainingFee?: number = 0;

  @ApiPropertyOptional({ description: 'Tiền thưởng giải đua được khấu trừ cho Chủ ngựa (VNĐ)', default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  prizeCredit?: number = 0;

  @ApiPropertyOptional({ description: 'Trạng thái hóa đơn', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus = InvoiceStatus.DRAFT;

  @ApiPropertyOptional({ description: 'Đường dẫn liên kết sao kê / hóa đơn PDF' })
  @IsString()
  @IsOptional()
  invoiceUrl?: string;
}
