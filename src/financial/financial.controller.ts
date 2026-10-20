import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { FinancialService } from './financial.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { QueryInvoiceDto } from './dto/query-invoice.dto';

@ApiTags('Financial Ledger & Invoices (Flow 5: F5-05 & F5-06)')
@ApiBearerAuth('JWT-auth')
@Controller('invoices')
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách hóa đơn sổ tài chính (Chủ ngựa chỉ thấy hóa đơn của mình)',
  })
  async findAll(@Query() query: QueryInvoiceDto, @CurrentUser() user: CurrentUserPayload) {
    return this.financialService.findAll(query, {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }

  @Get('owner-summary')
  @ApiOperation({
    summary: 'Tổng hợp báo cáo tài chính & doanh thu giải đua cho Chủ ngựa (SC-5.06)',
  })
  async getOwnerSummary(
    @CurrentUser() user: CurrentUserPayload,
    @Query('ownerId') queryOwnerId?: string,
  ) {
    // Nếu là HORSE_OWNER luôn xem của chính mình; Club Manager có thể xem của owner khác hoặc toàn CLB
    const targetOwnerId =
      user.role === UserRole.HORSE_OWNER ? user.userId : queryOwnerId;
    return this.financialService.getOwnerSummary(targetOwnerId);
  }


  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết một hóa đơn' })
  async findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.financialService.findOne(id, {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }

  @Post()
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Tạo mới hóa đơn tài chính (Chỉ Club Manager)' })
  async create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: CurrentUserPayload) {
    return this.financialService.create(dto, {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }

  @Post('generate-monthly')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({
    summary: 'Tự động sinh hóa đơn định kỳ đầu tháng cho toàn bộ Chủ ngựa (Chỉ Club Manager)',
  })
  async generateMonthly(
    @Body('billingPeriod') billingPeriod: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.financialService.generateMonthlyDrafts(billingPeriod, {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }

  @Patch(':id')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Cập nhật số tiền / chi phí hóa đơn (Chỉ Club Manager)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.financialService.update(id, dto, {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }

  @Patch(':id/status')
  @Roles(UserRole.CLUB_MANAGER)
  @ApiOperation({ summary: 'Đổi trạng thái hóa đơn (Phát hành SENT / Xác nhận thanh toán PAID)' })
  async changeStatus(
    @Param('id') id: string,
    @Body('status') status: InvoiceStatus,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.financialService.changeStatus(id, status, {
      id: user.userId,
      name: user.fullName || user.email,
      role: user.role,
    });
  }
}
