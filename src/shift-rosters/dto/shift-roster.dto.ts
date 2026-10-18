import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export type ApplyScope = 'ONLY_THIS_DAY' | 'REST_OF_WEEK' | 'SAME_DAY_4_WEEKS';

/** DL-4.01 Phân ca (một ô: Ngày x Ca x Khu) */
export class AssignShiftRosterDto {
  @ApiProperty({ example: '2026-10-19', description: 'Ngày trực (YYYY-MM-DD)' })
  @IsDateString({}, { message: 'Ngày trực phải theo định dạng YYYY-MM-DD.' })
  date: string;

  @ApiProperty({ description: 'ID ca trực (ShiftCatalog)' })
  @IsUUID('4', { message: 'ID ca trực không hợp lệ.' })
  shiftId: string;

  @ApiProperty({ description: 'ID khu chuồng (StallZone)' })
  @IsUUID('4', { message: 'ID khu chuồng không hợp lệ.' })
  zoneId: string;

  @ApiProperty({
    type: [String],
    description: 'Danh sách ID nhân viên Groom được phân công (tối đa 10 người)',
  })
  @IsArray({ message: 'Danh sách nhân viên phải là mảng.' })
  @ArrayMaxSize(10, { message: 'Mỗi ca tối đa 10 nhân viên.' })
  @IsUUID('4', { each: true, message: 'ID nhân viên không hợp lệ.' })
  groomUserIds: string[];

  @ApiPropertyOptional({
    enum: ['ONLY_THIS_DAY', 'REST_OF_WEEK', 'SAME_DAY_4_WEEKS'],
    default: 'ONLY_THIS_DAY',
    description: 'Phạm vi áp dụng phân ca',
  })
  @IsOptional()
  @IsIn(['ONLY_THIS_DAY', 'REST_OF_WEEK', 'SAME_DAY_4_WEEKS'], {
    message: 'Phạm vi áp dụng không hợp lệ.',
  })
  applyScope?: ApplyScope;

  @ApiPropertyOptional({ example: 'Trực vệ sinh tăng cường' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300, { message: 'Ghi chú tối đa 300 ký tự.' })
  notes?: string;
}

/** DL-4.02 Sao chép phân ca tuần */
export class CopyWeekRosterDto {
  @ApiProperty({ example: '2026-10-12', description: 'Thứ Hai tuần nguồn (YYYY-MM-DD)' })
  @IsDateString({}, { message: 'Ngày bắt đầu tuần nguồn phải theo định dạng YYYY-MM-DD.' })
  sourceWeekStart: string;

  @ApiProperty({ example: '2026-10-19', description: 'Thứ Hai tuần đích (YYYY-MM-DD)' })
  @IsDateString({}, { message: 'Ngày bắt đầu tuần đích phải theo định dạng YYYY-MM-DD.' })
  targetWeekStart: string;

  @ApiPropertyOptional({
    default: false,
    description: 'false = Giữ nguyên ô đã có, true = Ghi đè toàn bộ',
  })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}

export class QueryShiftRosterDto {
  @ApiPropertyOptional({ example: '2026-10-19', description: 'Từ ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-10-25', description: 'Đến ngày (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Lọc theo khu chuồng' })
  @IsOptional()
  @IsUUID('4')
  zoneId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo nhân viên Groom' })
  @IsOptional()
  @IsUUID('4')
  groomUserId?: string;
}
