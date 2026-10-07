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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { WorkoutStatus } from '@prisma/client';
import { TrainingService } from './training.service';
import { CreateTrainingPlanDto } from './dto/create-training-plan.dto';
import { UpdateTrainingPlanDto } from './dto/update-training-plan.dto';
import { QueryTrainingPlanDto } from './dto/query-training-plan.dto';
import { CreateWorkoutSessionDto } from './dto/create-workout-session.dto';
import { UpdateWorkoutSessionDto } from './dto/update-workout-session.dto';

@ApiTags('Training')
@ApiBearerAuth('JWT-auth')
@Controller('training')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get list of training plans with role scoping and filters' })
  async findAllPlans(
    @Query() query: QueryTrainingPlanDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.findAllPlans(query, user);
  }

  @Get('plans/:id')
  @ApiOperation({ summary: 'Get detailed training plan with scheduled workouts' })
  async findPlanById(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.trainingService.findPlanById(id, user);
  }

  @Post('plans')
  @Roles(UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new training plan (enforces RULE-MED-01 Medical Lock guard)' })
  async createPlan(@Body() dto: CreateTrainingPlanDto, @CurrentUser() user: CurrentUserPayload) {
    return this.trainingService.createPlan(dto, user);
  }

  @Put('plans/:id')
  @Roles(UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Update training plan details and status' })
  async updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdateTrainingPlanDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.updatePlan(id, dto, user);
  }

  @Delete('plans/:id')
  @Roles(UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Delete or archive training plan' })
  async deletePlan(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.trainingService.deletePlan(id, user);
  }

  @Get('workouts')
  @ApiOperation({ summary: 'Query workout sessions with optional date and horse filters' })
  async findAllWorkouts(
    @Query('planId') planId?: string,
    @Query('horseId') horseId?: string,
    @Query('date') date?: string,
    @Query('status') status?: WorkoutStatus,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.trainingService.findAllWorkouts({ planId, horseId, date, status }, user!);
  }

  @Post('plans/:id/workouts')
  @Roles(UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Schedule a workout session for an existing training plan' })
  async createWorkout(
    @Param('id') planId: string,
    @Body() dto: CreateWorkoutSessionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.createWorkout(planId, dto, user);
  }

  @Patch('workouts/:id')
  @Roles(UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER, UserRole.GROOM)
  @ApiOperation({ summary: 'Record actual workout metrics, debrief, or execution status' })
  async updateWorkout(
    @Param('id') workoutId: string,
    @Body() dto: UpdateWorkoutSessionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trainingService.updateWorkout(workoutId, dto, user);
  }
}
