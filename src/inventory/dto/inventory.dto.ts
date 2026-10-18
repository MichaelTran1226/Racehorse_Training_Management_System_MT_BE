import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { SupplyCategory, RestockStatus } from '@prisma/client';

export class QueryInventoryDto {
  @IsOptional()
  @IsString()
  zoneId?: string;

  @IsOptional()
  @IsEnum(SupplyCategory)
  category?: SupplyCategory;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  lowStockOnly?: boolean;
}

export class AdjustStockDto {
  @IsNotEmpty()
  @IsString()
  zoneId: string;

  @IsNotEmpty()
  @IsString()
  supplyId: string;

  @IsNotEmpty()
  @IsNumber()
  actualQuantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minThreshold?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRestockRequestDto {
  @IsNotEmpty()
  @IsString()
  zoneId: string;

  @IsNotEmpty()
  @IsString()
  supplyId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  requestedQuantity: number;

  @IsOptional()
  @IsString()
  urgencyReason?: string;
}

export class ReviewRestockRequestDto {
  @IsNotEmpty()
  @IsString()
  action: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  approvedQuantity?: number;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class DeliverRestockRequestDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  receivedQuantity?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  deliveryNotes?: string;
}

export class QueryRestockRequestsDto {
  @IsOptional()
  @IsString()
  zoneId?: string;

  @IsOptional()
  @IsEnum(RestockStatus)
  status?: RestockStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}
