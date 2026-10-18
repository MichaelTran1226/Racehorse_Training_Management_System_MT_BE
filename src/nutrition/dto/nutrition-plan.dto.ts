import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { NutritionPlanStatus } from '@prisma/client';

export class MealItemDto {
  @ApiProperty({ description: 'ID vật tư từ danh mục SupplyCatalog' })
  @IsUUID()
  @IsNotEmpty()
  supplyId: string;

  @ApiPropertyOptional({ description: 'Mã vật tư' })
  @IsOptional()
  @IsString()
  supplyCode?: string;

  @ApiProperty({ description: 'Tên vật tư (Cỏ khô, Cám, Vitamin...)' })
  @IsString()
  @IsNotEmpty()
  supplyName: string;

  @ApiProperty({ description: 'Nhóm vật tư (FEED_HAY, FEED_GRAIN, SUPPLEMENT_...)' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ description: 'Định lượng số lượng' })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ description: 'Đơn vị tính (KG, G, LITER, PACKET...)' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiPropertyOptional({ description: 'Ghi chú cho món ăn này' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class MealDto {
  @ApiProperty({ enum: ['MORNING', 'NOON', 'EVENING'], description: 'Bữa ăn trong ngày' })
  @IsIn(['MORNING', 'NOON', 'EVENING'])
  mealType: 'MORNING' | 'NOON' | 'EVENING';

  @ApiPropertyOptional({ description: 'Khung giờ cho ăn (VD: 06:00, 11:30, 17:00)' })
  @IsOptional()
  @IsString()
  time?: string;

  @ApiProperty({ type: [MealItemDto], description: 'Danh sách món ăn/vật tư trong bữa' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MealItemDto)
  items: MealItemDto[];
}

export class CreateNutritionPlanDto {
  @ApiProperty({ description: 'ID của ngựa' })
  @IsUUID()
  @IsNotEmpty()
  horseId: string;

  @ApiProperty({ type: [MealDto], description: 'Danh sách 3 bữa ăn' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MealDto)
  meals: MealDto[];

  @ApiPropertyOptional({ description: 'Chỉ dẫn đặc biệt (pha nước ấm, cho ăn sau tập...)' })
  @IsOptional()
  @IsString()
  specialInstructions?: string;

  @ApiPropertyOptional({ description: 'Ngày bắt đầu áp dụng' })
  @IsOptional()
  @IsString()
  validFrom?: string;

  @ApiPropertyOptional({ description: 'Ngày hết hạn áp dụng' })
  @IsOptional()
  @IsString()
  validTo?: string;

  @ApiPropertyOptional({ description: 'Gửi duyệt ngay (bỏ qua DRAFT)' })
  @IsOptional()
  submitImmediately?: boolean;
}

export class UpdateNutritionPlanDto {
  @ApiPropertyOptional({ type: [MealDto], description: 'Danh sách các bữa ăn' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MealDto)
  meals?: MealDto[];

  @ApiPropertyOptional({ description: 'Chỉ dẫn đặc biệt' })
  @IsOptional()
  @IsString()
  specialInstructions?: string;

  @ApiPropertyOptional({ description: 'Ngày bắt đầu áp dụng' })
  @IsOptional()
  @IsString()
  validFrom?: string;

  @ApiPropertyOptional({ description: 'Ngày hết hiệu lực' })
  @IsOptional()
  @IsString()
  validTo?: string;
}

export class ReviewNutritionPlanDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'], description: 'Hành động duyệt' })
  @IsIn(['APPROVE', 'REJECT'])
  action: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ description: 'Lý do từ chối (bắt buộc nếu action là REJECT)' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Ghi chú dinh dưỡng chuyên sâu từ Bác sĩ thú y' })
  @IsOptional()
  @IsString()
  vetNotes?: string;
}

export class QueryNutritionPlanDto {
  @ApiPropertyOptional({ description: 'Lọc theo ID ngựa' })
  @IsOptional()
  @IsUUID()
  horseId?: string;

  @ApiPropertyOptional({
    enum: [...Object.values(NutritionPlanStatus), 'ALL'],
    description: 'Lọc theo trạng thái',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Lọc theo khu chuồng (Zone)' })
  @IsOptional()
  @IsString()
  zoneId?: string;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo tên ngựa, mã ngựa hoặc mã kế hoạch' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Trang hiện tại' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ description: 'Số lượng mỗi trang' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
