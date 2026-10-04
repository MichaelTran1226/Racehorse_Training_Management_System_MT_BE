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
import { HorsesService } from './horses.service';
import { CreateHorseDto } from './dto/create-horse.dto';
import { UpdateHorseDto } from './dto/update-horse.dto';
import { QueryHorseDto } from './dto/query-horse.dto';

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

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết hồ sơ định danh ngựa (FR-1.04)' })
  async findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.horsesService.findOne(id, user);
  }

  @Post()
  @Roles(UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo hồ sơ ngựa mới (FR-1.01) - Chỉ Club Manager' })
  async create(@Body() dto: CreateHorseDto, @CurrentUser() user: CurrentUserPayload) {
    return this.horsesService.create(dto, user);
  }

  @Put(':id')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Cập nhật thông tin định danh ngựa (FR-1.02) - Chỉ Club Manager' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateHorseDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.horsesService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Xóa hồ sơ ngựa (chưa có dữ liệu phụ thuộc) - Chỉ Club Manager' })
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.horsesService.remove(id, user);
  }
}
