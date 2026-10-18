import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto, QueryIncidentsDto, ReviewIncidentDto } from './dto/incident.dto';

const ALL_STAFF_ROLES = [
  UserRole.CLUB_MANAGER,
  UserRole.HEAD_TRAINER,
  UserRole.VETERINARIAN,
  UserRole.GROOM,
];

@ApiTags('Incident Reports & Health Observations')
@ApiBearerAuth('JWT-auth')
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}

  @Post()
  @Roles(...ALL_STAFF_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'TASK F4-05-BE: Báo cáo sự cố đột xuất hoặc quan sát sức khỏe tại chuồng',
  })
  create(@Body() dto: CreateIncidentDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles(...ALL_STAFF_ROLES)
  @ApiOperation({ summary: 'Danh sách các sự cố và quan sát sức khỏe theo bộ lọc' })
  findAll(@Query() query: QueryIncidentsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(...ALL_STAFF_ROLES)
  @ApiOperation({ summary: 'Xem chi tiết một sự cố báo cáo' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/review')
  @Roles(UserRole.VETERINARIAN, UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bác sĩ thú y hoặc Quản lý đánh giá và cập nhật trạng thái sự cố' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewIncidentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.review(id, dto, user);
  }
}
