import { PartialType } from '@nestjs/swagger';
import { CreateWorkoutSessionDto } from './create-workout-session.dto';

/** Sửa buổi tập Đã lên lịch (HT). Áp lại toàn bộ kiểm tra của DL-2.01. */
export class UpdateWorkoutSessionDto extends PartialType(CreateWorkoutSessionDto) {}
