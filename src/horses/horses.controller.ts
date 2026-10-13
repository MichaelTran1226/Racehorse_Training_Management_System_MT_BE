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
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { apiError } from '../common/exceptions/api-error';
import { UserRole } from '../common/enums/role.enum';
import { HorsesService } from './horses.service';
import { CreateHorseDto } from './dto/create-horse.dto';
import { UpdateHorseDto } from './dto/update-horse.dto';
import { QueryHorseDto } from './dto/query-horse.dto';
import { ChangeHorseStatusDto } from './dto/change-status.dto';
import { TransferHorseOwnerDto } from './dto/transfer-owner.dto';
import { DeleteHorseDto } from './dto/delete-horse.dto';
import { RestoreHorseDto } from './dto/restore-horse.dto';
import { QueryDeletedHorseDto } from './dto/query-deleted-horse.dto';

@ApiTags('Horses')
@ApiBearerAuth('JWT-auth')
@Controller('horses')
export class HorsesController {
  constructor(private readonly horsesService: HorsesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách ngựa theo phân quyền vai trò (FR-1.03)' })
  async findAll(@Query() query: QueryHorseDto, @CurrentUser() user: CurrentUserPayload) {
    return this.horsesService.findAll(query, user);
  }

  // Phải khai báo TRƯỚC ':id', nếu không Nest hiểu "deleted" là một id.
  @Get('deleted')
  @RequirePermission('deleteHorses')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Danh sách hồ sơ ngựa đã xóa (SC-1.05) - Chỉ Club Manager' })
  async findDeleted(@Query() query: QueryDeletedHorseDto) {
    return this.horsesService.findDeleted(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết hồ sơ định danh ngựa (FR-1.04)' })
  async findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.horsesService.findOne(id, user);
  }

  @Get(':id/history')
  @ApiOperation({
    summary:
      'Lấy toàn bộ lịch sử vòng đời định danh, y tế, huấn luyện và chuyển nhượng của ngựa (Flow 1, FR-1.04)',
  })
  async getHistory(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.horsesService.getHistory(id, user);
  }

  @Post()
  @RequirePermission('editHorses')
  @Roles(UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo hồ sơ ngựa mới (FR-1.01) - Chỉ Club Manager' })
  async create(@Body() dto: CreateHorseDto, @CurrentUser() user: CurrentUserPayload) {
    return this.horsesService.create(dto, user);
  }

  @Put(':id')
  @RequirePermission('editHorses')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Cập nhật thông tin định danh ngựa (FR-1.02) - Chỉ Club Manager' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateHorseDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.horsesService.update(id, dto, user);
  }

  @Patch(':id/transfer-owner')
  @RequirePermission('editHorses')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Chuyển quyền sở hữu ngựa (FR-1.02, Flow 1) - Chỉ Club Manager' })
  async transferOwner(
    @Param('id') id: string,
    @Body() dto: TransferHorseOwnerDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.horsesService.transferOwner(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('deleteHorses')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({
    summary: 'Xóa mềm hồ sơ ngựa tạo nhầm (DL-1.10, chưa có dữ liệu phụ thuộc) - Chỉ Club Manager',
  })
  async remove(
    @Param('id') id: string,
    @Body() dto: DeleteHorseDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.horsesService.remove(id, dto, user);
  }

  @Post(':id/restore')
  @RequirePermission('deleteHorses')
  @Roles(UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khôi phục hồ sơ đã xóa hoặc Hoàn tác xóa (DL-1.11) - Chỉ Club Manager',
  })
  async restore(
    @Param('id') id: string,
    @Body() dto: RestoreHorseDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.horsesService.restore(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN)
  @ApiOperation({ summary: 'Chuyển trạng thái ngựa (FR-1.05, FR-1.06, FR-1.08)' })
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeHorseStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    // Q-2.C: CM chỉ dùng API này để Ngừng quản lý / Kích hoạt lại -> cần công tắc deleteHorses.
    if (user.role === UserRole.CLUB_MANAGER && user.permissions && !user.permissions.deleteHorses) {
      throw apiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Not allowed');
    }
    return this.horsesService.changeStatus(id, dto, user);
  }
}
