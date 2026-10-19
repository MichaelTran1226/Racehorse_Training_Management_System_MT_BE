import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';

export class QueryInvoiceDto {
  @ApiPropertyOptional({ description: 'Trang hiện tại', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Số bản ghi mỗi trang', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Lọc theo ID chủ sở hữu' })
  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID con ngựa' })
  @IsUUID()
  @IsOptional()
  horseId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo kỳ thanh toán YYYY-MM' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'billingPeriod must be in YYYY-MM format' })
  @IsOptional()
  billingPeriod?: string;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái hóa đơn', enum: InvoiceStatus })
  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;
}
