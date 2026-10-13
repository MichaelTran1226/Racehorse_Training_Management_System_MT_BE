import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  ParseEnumPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { UserRole } from '../common/enums/role.enum';
import { WorkoutStatus } from '@prisma/client';
import { TrainingService } from './training.service';
import { CreateTrainingPlanDto } from './dto/create-training-plan.dto';
import { UpdateTrainingPlanDto } from './dto/update-training-plan.dto';
import { QueryTrainingPlanDto } from './dto/query-training-plan.dto';
import { CreateWorkoutSessionDto, RepeatWorkoutDto } from './dto/create-workout-session.dto';
import { UpdateWorkoutSessionDto } from './dto/update-workout-session.dto';
import { RecordWorkoutResultDto } from './dto/record-result.dto';
import {
  AcknowledgeAlertDto,
  CancelWorkoutDto,
  ChangePlanStatusDto,
  ClonePlanDto,
  RestoreWorkoutDto,
} from './dto/workout-actions.dto';

/**
 * Flow 2 - phân quyền theo đặc tả §2: chỉ HT lập/sửa/kích hoạt giáo án, xếp buổi tập và ghi kết quả;
 * CM, VET xem; OWNER xem ngựa sở hữu; GROOM xem buổi được giao.
 * Q-2.C: ngoài vai trò, BE kiểm cả công tắc quyền (createPlan, assignSchedule, recordMetrics, ackAlerts).
 */
@ApiTags('Training')
@ApiBearerAuth('JWT-auth')
@Controller('training')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Get('overview')
  @Roles(UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN)
  @ApiOperation({ summary: 'SC-2.01 Tổng quan huấn luyện: 4 thẻ chỉ số + bảng ngựa' })
  async getOverview() {
    return this.trainingService.getOverview();
  }

  // ------------------------------------------------------------ Giáo án

  @Get('plans')
  @Roles(UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN, UserRole.HORSE_OWNER)
  @ApiOperation({ summary: 'SC-2.02 Danh sách giáo án (OWNER: ngựa sở hữu)' })
  async findAllPlans(
    @Query() query: QueryTrainingPlanDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.findAllPlans(query, user);
  }

  @Get('plans/:id')
  @Roles(UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN, UserRole.HORSE_OWNER)
  @ApiOperation({ summary: 'SC-2.04 Chi tiết giáo án kèm buổi tập' })
  async findPlanById(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.trainingService.findPlanById(id, user);
  }

  @Post('plans')
  @RequirePermission('createPlan')
  @Roles(UserRole.HEAD_TRAINER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'SC-2.03 Tạo giáo án (luôn ở Nháp) - HT' })
  async createPlan(@Body() dto: CreateTrainingPlanDto, @CurrentUser() user: CurrentUserPayload) {
    return this.trainingService.createPlan(dto, user);
  }

  @Put('plans/:id')
  @RequirePermission('createPlan')
  @Roles(UserRole.HEAD_TRAINER)
  @ApiOperation({ summary: 'Sửa giáo án Nháp / Đang áp dụng - HT' })
  async updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdateTrainingPlanDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.updatePlan(id, dto, user);
  }

  @Patch('plans/:id/status')
  @RequirePermission('createPlan')
  @Roles(UserRole.HEAD_TRAINER)
  @ApiOperation({ summary: 'DL-2.02 Kích hoạt / DL-2.04 Hoàn thành / DL-2.03 Hủy giáo án - HT' })
  async changePlanStatus(
    @Param('id') id: string,
    @Body() dto: ChangePlanStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.changePlanStatus(id, dto, user);
  }

  @Post('plans/:id/clone')
  @RequirePermission('createPlan')
  @Roles(UserRole.HEAD_TRAINER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'DL-2.08 Nhân bản giáo án sang ngựa khác - HT' })
  async clonePlan(
    @Param('id') id: string,
    @Body() dto: ClonePlanDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.clonePlan(id, dto, user);
  }

  @Delete('plans/:id')
  @RequirePermission('createPlan')
  @Roles(UserRole.HEAD_TRAINER)
  @ApiOperation({ summary: 'Xóa giáo án Nháp chưa có buổi hoàn thành - HT' })
  async deletePlan(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.trainingService.deletePlan(id, user);
  }

  // ------------------------------------------------------------ Buổi tập

  @Get('workouts')
  @ApiOperation({ summary: 'SC-2.05 Lịch tập (OWNER: ngựa sở hữu; GROOM: buổi được giao)' })
  async findAllWorkouts(
    @CurrentUser() user: CurrentUserPayload,
    @Query('planId') planId?: string,
    @Query('horseId') horseId?: string,
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status', new ParseEnumPipe(WorkoutStatus, { optional: true })) status?: WorkoutStatus,
  ) {
    return this.trainingService.findAllWorkouts({ planId, horseId, date, from, to, status }, user);
  }

  @Get('trial-runs')
  @Roles(UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN)
  @ApiOperation({ summary: 'Lượt chạy thử (buổi tập loại TRIAL)' })
  async findTrialRuns(
    @CurrentUser() user: CurrentUserPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.trainingService.findTrialRuns({ from, to }, user);
  }

  @Get('grooms')
  @Roles(UserRole.HEAD_TRAINER)
  @ApiOperation({ summary: 'Nhân viên chăm sóc đang hoạt động để phân công buổi tập - HT' })
  async findGrooms() {
    return this.trainingService.findGrooms();
  }

  @Post('plans/:id/workouts')
  @RequirePermission('assignSchedule')
  @Roles(UserRole.HEAD_TRAINER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'DL-2.01 Thêm buổi tập (chặn bài nặng khi Khóa y tế) - HT' })
  async createWorkout(
    @Param('id') planId: string,
    @Body() dto: CreateWorkoutSessionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.createWorkout(planId, dto, user);
  }

  @Post('plans/:id/workouts/repeat')
  @RequirePermission('assignSchedule')
  @Roles(UserRole.HEAD_TRAINER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'DL-2.01 Lặp lại hằng tuần (tối đa 60 buổi, bỏ qua ngày bị chặn) - HT' })
  async createRepeatWorkouts(
    @Param('id') planId: string,
    @Body() dto: RepeatWorkoutDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.createRepeatWorkouts(planId, dto, user);
  }

  @Get('workouts/:id')
  @ApiOperation({ summary: 'Chi tiết buổi tập (theo phạm vi vai trò)' })
  async findWorkoutById(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.trainingService.findWorkoutById(id, user);
  }

  @Patch('workouts/:id')
  @RequirePermission('assignSchedule')
  @Roles(UserRole.HEAD_TRAINER)
  @ApiOperation({ summary: 'Sửa buổi tập Đã lên lịch - HT' })
  async updateWorkout(
    @Param('id') workoutId: string,
    @Body() dto: UpdateWorkoutSessionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.updateWorkout(workoutId, dto, user);
  }

  @Post('workouts/:id/result')
  @RequirePermission('recordMetrics')
  @Roles(UserRole.HEAD_TRAINER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'SC-2.06 Ghi / sửa kết quả buổi tập - HT' })
  async recordResult(
    @Param('id') workoutId: string,
    @Body() dto: RecordWorkoutResultDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.recordResult(workoutId, dto, user);
  }

  @Post('workouts/:id/cancel')
  @RequirePermission('assignSchedule')
  @Roles(UserRole.HEAD_TRAINER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'DL-2.05 Hủy buổi tập - HT' })
  async cancelWorkout(
    @Param('id') workoutId: string,
    @Body() dto: CancelWorkoutDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.cancelWorkout(workoutId, dto, user);
  }

  @Post('workouts/:id/restore')
  @RequirePermission('assignSchedule')
  @Roles(UserRole.HEAD_TRAINER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'DL-2.07 Khôi phục buổi tập bị chặn sau khi gỡ khóa - HT' })
  async restoreWorkout(
    @Param('id') workoutId: string,
    @Body() dto: RestoreWorkoutDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.restoreWorkout(workoutId, dto, user);
  }

  // ------------------------------------------------------------ Cảnh báo & thể lực

  @Get('alerts')
  @Roles(UserRole.HEAD_TRAINER, UserRole.VETERINARIAN)
  @ApiOperation({ summary: 'Buổi tập có dấu hiệu bất thường (FR-2.14)' })
  async findAlerts() {
    return this.trainingService.findAlerts();
  }

  @Patch('alerts/:id')
  @RequirePermission('ackAlerts')
  @Roles(UserRole.VETERINARIAN)
  @ApiOperation({ summary: 'Bác sĩ thú y ghi nhận cảnh báo (id = id buổi tập)' })
  async acknowledgeAlert(
    @Param('id') workoutId: string,
    @Body() dto: AcknowledgeAlertDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.acknowledgeAlert(workoutId, dto, user);
  }

  @Get('horses/:horseId/fitness-metrics')
  @Roles(UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN, UserRole.HORSE_OWNER)
  @ApiOperation({ summary: 'SC-2.07 Biểu đồ thể lực (một điểm mỗi buổi hoàn thành)' })
  async getFitnessMetrics(
    @Param('horseId') horseId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('weeks') weeks?: string,
  ) {
    // BTN-2.34: 4 / 12 / 26 tuần, mặc định 12.
    const w = [4, 12, 26].includes(Number(weeks)) ? Number(weeks) : 12;
    return this.trainingService.getFitnessMetrics(horseId, user, w);
  }
}
