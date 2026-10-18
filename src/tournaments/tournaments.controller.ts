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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { TournamentsService } from './tournaments.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { ChangeTournamentStatusDto } from './dto/change-tournament-status.dto';
import { RegisterHorseDto } from './dto/register-horse.dto';
import { BatchRecordResultsDto } from './dto/record-result.dto';

@ApiTags('Tournaments & Racing (Flow 5)')
@ApiBearerAuth('JWT-auth')
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách các giải đua (SC-5.01)' })
  async findAll(@Query() query: QueryTournamentDto) {
    return this.tournamentsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết giải đua và danh sách đăng ký / kết quả (SC-5.01)' })
  async findOne(@Param('id') id: string) {
    return this.tournamentsService.findOne(id);
  }

  @Get(':id/eligibility')
  @Roles(UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER)
  @ApiOperation({
    summary:
      'Rà soát điều kiện tham gia giải đua của đàn ngựa (SC-5.02: Khóa y tế, Thể lực, Số buổi tập)',
  })
  async getEligibility(@Param('id') id: string) {
    return this.tournamentsService.getEligibility(id);
  }

  @Post()
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Tạo mới giải đua (SC-5.01: Club Manager)' })
  async create(@Body() dto: CreateTournamentDto, @CurrentUser() user: CurrentUserPayload) {
    return this.tournamentsService.create(dto, {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }

  @Patch(':id')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Cập nhật thông tin giải đua (SC-5.01: Club Manager)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTournamentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tournamentsService.update(id, dto, {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }

  @Patch(':id/status')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Chuyển đổi trạng thái vòng đời giải đua (SC-5.01: Club Manager)' })
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeTournamentStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tournamentsService.changeStatus(id, dto, {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }

  @Delete(':id')
  @Roles(UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xóa giải đua chưa có ngựa đăng ký (SC-5.01: Club Manager)' })
  async delete(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.tournamentsService.delete(id, {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }

  @Post(':id/registrations')
  @Roles(UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Đăng ký ngựa tham gia giải đua (SC-5.02: Trainer / CM)' })
  async registerHorse(
    @Param('id') id: string,
    @Body() dto: RegisterHorseDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tournamentsService.registerHorse(id, dto, {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }

  @Delete(':id/registrations/:regId')
  @Roles(UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Rút ngựa khỏi giải đua (Scratch: Trainer / CM)' })
  async cancelRegistration(
    @Param('id') id: string,
    @Param('regId') regId: string,
    @Query('reason') reason: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tournamentsService.cancelRegistration(id, regId, reason || 'Trainer scratch', {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }

  @Post(':id/results')
  @Roles(UserRole.HEAD_TRAINER, UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Nhập kết quả thi đấu (SC-5.03: Trainer / CM)' })
  async recordResults(
    @Param('id') id: string,
    @Body() dto: BatchRecordResultsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.tournamentsService.recordResults(id, dto, {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }

  @Post(':id/lock-results')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({
    summary: 'Chốt kết quả chính thức và tự động phân bổ giải thưởng (SC-5.03: Chỉ Club Manager)',
  })
  async lockResults(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.tournamentsService.lockResults(id, {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }
}
