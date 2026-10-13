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
import { HorseCatalogsService } from './horse-catalogs.service';
import {
  CreateHorseCatalogItemDto,
  QueryHorseCatalogDto,
  SetHorseCatalogStatusDto,
  UpdateHorseCatalogItemDto,
} from './dto/horse-catalog.dto';

/** SC-1.06 Danh mục Giống & Màu lông: CM toàn quyền, các vai trò khác chỉ xem. */
@ApiTags('Horse catalogs')
@ApiBearerAuth('JWT-auth')
@Controller('horse-catalogs')
export class HorseCatalogsController {
  constructor(private readonly service: HorseCatalogsService) {}

  @Get()
  @ApiOperation({ summary: 'SC-1.06 Danh sách Giống / Màu lông (mọi vai trò)' })
  findAll(@Query() query: QueryHorseCatalogDto) {
    return this.service.findAll(query);
  }

  @Post()
  @Roles(UserRole.CLUB_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'DL-1.13 Thêm mục danh mục (CM)' })
  create(@Body() dto: CreateHorseCatalogItemDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'DL-1.13 Sửa mục danh mục (CM)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHorseCatalogItemDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'BTN-1.28 / BTN-1.29 Ngừng dùng / Dùng lại (CM)' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetHorseCatalogStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.setStatus(id, dto, user);
  }
}
