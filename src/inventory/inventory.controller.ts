import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { InventoryService } from './inventory.service';
import {
  AdjustStockDto,
  CreateRestockRequestDto,
  DeliverRestockRequestDto,
  QueryInventoryDto,
  QueryRestockRequestsDto,
  ReviewRestockRequestDto,
} from './dto/inventory.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * SC-4.06: Lấy danh sách tồn kho vật tư theo Khu chuồng
   */
  @Get()
  async findAllStock(
    @Query() query: QueryInventoryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.inventoryService.findAllStock(query, currentUser);
  }

  /**
   * SC-4.06 / DL-4.06: Kiểm kê & Điều chỉnh tồn kho thực tế (Chỉ Club Manager)
   */
  @Post('adjust')
  @Roles(UserRole.CLUB_MANAGER)
  async adjustStock(@Body() dto: AdjustStockDto, @CurrentUser() currentUser: CurrentUserPayload) {
    return this.inventoryService.adjustStock(dto, currentUser);
  }

  /**
   * SC-4.07: Lấy danh sách phiếu đề xuất bổ sung vật tư
   */
  @Get('requests')
  async findAllRestockRequests(
    @Query() query: QueryRestockRequestsDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.inventoryService.findAllRestockRequests(query, currentUser);
  }

  /**
   * SC-4.07: Chi tiết một phiếu đề xuất
   */
  @Get('requests/:id')
  async findOneRestockRequest(@Param('id') id: string) {
    return this.inventoryService.findOneRestockRequest(id);
  }

  /**
   * SC-4.07 / DL-4.07: Tạo phiếu đề xuất bổ sung vật tư
   */
  @Post('requests')
  async createRestockRequest(
    @Body() dto: CreateRestockRequestDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.inventoryService.createRestockRequest(dto, currentUser);
  }

  /**
   * SC-4.07: Phê duyệt hoặc từ chối phiếu đề xuất (Chỉ Club Manager)
   */
  @Post('requests/:id/review')
  @Roles(UserRole.CLUB_MANAGER)
  async reviewRestockRequest(
    @Param('id') id: string,
    @Body() dto: ReviewRestockRequestDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.inventoryService.reviewRestockRequest(id, dto, currentUser);
  }

  /**
   * SC-4.07: Xác nhận nhận hàng / Nhập kho & tự động cộng dồn số lượng tồn (Chỉ Club Manager)
   */
  @Post('requests/:id/deliver')
  @Roles(UserRole.CLUB_MANAGER)
  async deliverRestockRequest(
    @Param('id') id: string,
    @Body() dto: DeliverRestockRequestDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.inventoryService.deliverRestockRequest(id, dto, currentUser);
  }
}
