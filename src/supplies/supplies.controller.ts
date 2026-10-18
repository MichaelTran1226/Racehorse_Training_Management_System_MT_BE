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
import { SuppliesService } from './supplies.service';
import {
  CreateSupplyCatalogDto,
  QuerySupplyCatalogDto,
  SetSupplyStatusDto,
  UpdateSupplyCatalogDto,
} from './dto/supply.dto';

const STAFF = [UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN, UserRole.GROOM];

@ApiTags('Supplies')
@ApiBearerAuth('JWT-auth')
@Controller('supplies')
export class SuppliesController {
  constructor(private readonly service: SuppliesService) {}

  @Get()
  @Roles(...STAFF)
  @ApiOperation({ summary: 'SC-4.10 Danh sách vật tư (Staff xem; non-CM bị ẩn đơn giá)' })
  findAll(@Query() query: QuerySupplyCatalogDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Chi tiết một vật tư' })
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user);
  }

  @Post()
  @Roles(UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'BTN-4.47 / DL-4.15 Thêm vật tư mới (Chỉ Club Manager)' })
  create(@Body() dto: CreateSupplyCatalogDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'BTN-4.48 / DL-4.15 Sửa thông tin vật tư (Chỉ Club Manager)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplyCatalogDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'BTN-4.49 Ngừng dùng / Dùng lại vật tư (Chỉ Club Manager)' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetSupplyStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.setStatus(id, dto, user);
  }
}
