import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { DailyTasksService } from './daily-tasks.service';
import {
  CompleteDailyTaskDto,
  GenerateDailyTasksDto,
  QueryDailyTasksDto,
} from './dto/daily-task.dto';

const ALL_STAFF_ROLES = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.GROOM,
];

@ApiTags('Daily Care Tasks & Checklist')
@ApiBearerAuth('JWT-auth')
@Controller('daily-tasks')
export class DailyTasksController {
  constructor(private readonly service: DailyTasksService) {}

  @Get()
  @Roles(...ALL_STAFF_ROLES)
  @ApiOperation({ summary: 'SC-4.04 Lấy danh sách checklist công việc theo ngày & khu chuồng' })
  findAll(@Query() query: QueryDailyTasksDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findAll(query, user);
  }

  @Post('generate')
  @Roles(UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kích hoạt thủ công sinh danh sách công việc hàng ngày cho một ngày cụ thể',
  })
  generateTasks(@Body() dto: GenerateDailyTasksDto) {
    const targetDate = dto.date ? new Date(`${dto.date}T00:00:00.000Z`) : new Date();
    return this.service.generateDailyTasksForDate(targetDate, dto.zoneId);
  }

  @Post(':id/complete')
  @Roles(UserRole.GROOM, UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Groom đánh dấu hoàn thành 1 công việc (kèm cửa sổ hoàn tác 15 phút)' })
  completeTask(
    @Param('id') id: string,
    @Body() dto: CompleteDailyTaskDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.completeTask(id, dto, user);
  }

  @Post(':id/uncomplete')
  @Roles(UserRole.GROOM, UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hoàn tác trạng thái hoàn thành trong vòng 15 phút an toàn' })
  uncompleteTask(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.uncompleteTask(id, user);
  }
}
