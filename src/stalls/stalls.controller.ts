import { Controller, Get, Post, Body, Patch, Param, Delete, Put, Query } from '@nestjs/common';
import { StallsService } from './stalls.service';
import { CreateStallDto } from './dto/create-stall.dto';
import { UpdateStallDto } from './dto/update-stall.dto';
import { AssignHorseDto } from './dto/assign-horse.dto';
import { TransferHorseDto } from './dto/transfer-horse.dto';
import { ReturnStallDto } from './dto/return-stall.dto';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';

@ApiTags('Stalls')
@ApiBearerAuth('JWT-auth')
@Controller('stalls')
export class StallsController {
  constructor(private readonly stallsService: StallsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách ô chuồng' })
  findAll(@Query() query: any, @CurrentUser() user: CurrentUserPayload) {
    return this.stallsService.findAll(query, user);
  }

  @Get('zones')
  @ApiOperation({ summary: 'Lấy danh sách khu chuồng' })
  getZones() {
    return this.stallsService.getZones();
  }

  @Post()
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Tạo ô chuồng mới (CM)' })
  create(@Body() createStallDto: CreateStallDto, @CurrentUser() user: CurrentUserPayload) {
    return this.stallsService.create(createStallDto, user);
  }

  @Put(':id')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Cập nhật ô chuồng (CM)' })
  update(@Param('id') id: string, @Body() updateStallDto: UpdateStallDto, @CurrentUser() user: CurrentUserPayload) {
    return this.stallsService.update(id, updateStallDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Xóa ô chuồng (CM)' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.stallsService.remove(id, user);
  }

  @Post(':id/allocations')
  @Roles(UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER)
  @ApiOperation({ summary: 'Gán ngựa vào ô chuồng (CM, HT)' })
  assignHorse(@Param('id') id: string, @Body() dto: AssignHorseDto, @CurrentUser() user: CurrentUserPayload) {
    return this.stallsService.assignHorse(id, dto, user);
  }

  @Put('allocations/:id/transfer')
  @Roles(UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER)
  @ApiOperation({ summary: 'Chuyển ngựa sang ô chuồng khác (CM, HT)' })
  transferHorse(@Param('id') id: string, @Body() dto: TransferHorseDto, @CurrentUser() user: CurrentUserPayload) {
    return this.stallsService.transferHorse(id, dto, user);
  }

  @Put('allocations/:id/return')
  @Roles(UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER)
  @ApiOperation({ summary: 'Trả ô chuồng, rút ngựa ra khỏi ô (CM, HT)' })
  returnStall(@Param('id') id: string, @Body() dto: ReturnStallDto, @CurrentUser() user: CurrentUserPayload) {
    return this.stallsService.returnStall(id, dto, user);
  }
}
