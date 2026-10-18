import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { NutritionService } from './nutrition.service';
import {
  CreateNutritionPlanDto,
  MealDto,
  QueryNutritionPlanDto,
  ReviewNutritionPlanDto,
  UpdateNutritionPlanDto,
} from './dto/nutrition-plan.dto';

const ALL_ROLES = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.GROOM,
  UserRole.HORSE_OWNER,
];

@ApiTags('Nutrition & Meal Rations')
@ApiBearerAuth('JWT-auth')
@Controller('nutrition-plans')
export class NutritionController {
  constructor(private readonly service: NutritionService) {}

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary: 'SC-4.03 Danh sách khẩu phần ăn (RBAC: Groom & Owner chỉ xem bản APPROVED)',
  })
  findAll(@Query() query: QueryNutritionPlanDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findAll(query, user);
  }

  @Get('horses/:horseId/active')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Khẩu phần ăn đang áp dụng (APPROVED) của 1 con ngựa' })
  getActivePlan(@Param('horseId') horseId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getActivePlanForHorse(horseId, user);
  }

  @Post('calculate-metrics')
  @Roles(UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tính thử nghiệm định lượng thức ăn & kiểm tra định mức an toàn 1.5% - 3.0%',
  })
  calculateMetrics(@Body() body: { horseId: string; meals: MealDto[] }) {
    return this.service.calculateMetrics(body.horseId, body.meals);
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Chi tiết một kế hoạch khẩu phần ăn' })
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user);
  }

  @Post()
  @Roles(UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tạo bản thảo (Draft) hoặc gửi duyệt khẩu phần ăn (Head Trainer / Club Manager)',
  })
  create(@Body() dto: CreateNutritionPlanDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles(UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Chỉnh sửa khẩu phần ăn (Chỉ khi DRAFT hoặc REJECTED)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNutritionPlanDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/submit')
  @Roles(UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gửi duyệt khẩu phần ăn tới Bác sĩ thú y (DRAFT/REJECTED -> PENDING_APPROVAL)',
  })
  submitForApproval(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.submitForApproval(id, user);
  }

  @Post(':id/review')
  @Roles(UserRole.VETERINARIAN, UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bác sĩ thú y thẩm định & Phê duyệt (APPROVE) hoặc Từ chối (REJECT kèm lý do)',
  })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewNutritionPlanDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.review(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Xóa khẩu phần ăn (Chỉ khi ở DRAFT hoặc REJECTED)' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }
}
