import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { str } from '../common/utils/input';
import { AuditService } from './audit.service';
import { ForbiddenDto, PermissionRequestDto, ResolvePermissionRequestDto } from './dto/audit.dto';
import { ListAuditDto } from './dto/list-audit.dto';

@ApiTags('Audit Logs')
@ApiBearerAuth('JWT-auth')
@Controller()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('audit-logs')
  @RequirePermission('viewAudit')
  @ApiOperation({ summary: 'Tra cứu nhật ký bất biến, lọc và phân trang (API-017)' })
  list(@Query() query: ListAuditDto) {
    return this.auditService.list(query);
  }

  @Post('audit/forbidden')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ghi lại lần bị chặn quyền (403) và trả mã tham chiếu' })
  forbidden(@CurrentUser() user: CurrentUserPayload, @Body() dto: ForbiddenDto) {
    return this.auditService.recordForbidden(actorOf(user), str(dto.screen));
  }

  @Post('permission-requests')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xin Club Manager cấp quyền vào một màn hình' })
  requestPermission(@CurrentUser() user: CurrentUserPayload, @Body() dto: PermissionRequestDto) {
    return this.auditService.requestPermission(actorOf(user), str(dto.screen), str(dto.reference));
  }

  @Get('permission-requests')
  @RequirePermission('manageAccounts')
  @ApiOperation({ summary: 'Danh sách yêu cầu cấp quyền (mặc định chỉ yêu cầu đang chờ)' })
  listPermissionRequests(@Query('status') status?: string) {
    return this.auditService.listPermissionRequests(status);
  }

  @Post('permission-requests/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('manageAccounts')
  @ApiOperation({ summary: 'Đánh dấu yêu cầu cấp quyền là GRANTED hoặc DISMISSED' })
  resolve(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: ResolvePermissionRequestDto,
  ) {
    return this.auditService.resolvePermissionRequest(actorOf(user), Number(id), dto.status);
  }
}

function actorOf(user: CurrentUserPayload) {
  return { id: user.userId, name: user.fullName };
}
