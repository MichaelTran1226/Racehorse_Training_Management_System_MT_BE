import {
  Body,
  Controller,
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
import { ShiftsService } from './shifts.service';
import {
  CreateShiftCatalogDto,
  QueryShiftCatalogDto,
  SetShiftStatusDto,
  UpdateShiftCatalogDto,
} from './dto/shift.dto';

const STAFF = [UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN, UserRole.GROOM];

@ApiTags('Shifts')
@ApiBearerAuth('JWT-auth')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  @Get()
  @Roles(...STAFF)
  @ApiOperation({ summary: 'SC-4.11 Danh sách ca trực (Staff xem)' })
  findAll(@Query() query: QueryShiftCatalogDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Chi tiết một ca trực' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'BTN-4.50 / DL-4.16 Thêm ca trực mới (Chỉ Club Manager)' })
  create(@Body() dto: CreateShiftCatalogDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'BTN-4.51 / DL-4.16 Sửa thông tin ca trực (Chỉ Club Manager)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateShiftCatalogDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'BTN-4.52 Ngừng dùng / Dùng lại ca trực (Chỉ Club Manager)' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetShiftStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.setStatus(id, dto, user);
  }
}
