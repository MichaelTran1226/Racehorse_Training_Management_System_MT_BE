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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { toPublicUser } from '../users/public-user';
import { AccountAction, AccountsService } from './accounts.service';
import {
  InviteAccountDto,
  ReasonDto,
  UpdateAccountDto,
  UpdatePermissionsDto,
} from './dto/accounts.dto';

const actorOf = (user: CurrentUserPayload) => ({ id: user.userId, name: user.fullName });

@ApiTags('Authentication')
@ApiBearerAuth('JWT-auth')
@RequirePermission('manageAccounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách mọi tài khoản' })
  async list() {
    const users = await this.accounts.list();
    return { accounts: users.map(toPublicUser) };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mời nhân viên (tạo tài khoản INVITED + gửi mã mời qua email)' })
  async invite(@CurrentUser() user: CurrentUserPayload, @Body() dto: InviteAccountDto) {
    return { account: toPublicUser(await this.accounts.invite(actorOf(user), dto)) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một tài khoản' })
  async detail(@Param('id') id: string) {
    return { account: toPublicUser(await this.accounts.find(id)) };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Sửa họ tên, số điện thoại' })
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return { account: toPublicUser(await this.accounts.update(actorOf(user), id, dto)) };
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Xóa hẳn tài khoản chưa từng hoạt động (INVITED, PENDING_EMAIL, REJECTED)',
  })
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.accounts.remove(actorOf(user), id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Duyệt yêu cầu đăng ký' })
  approve(@CurrentUser() u: CurrentUserPayload, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.changeStatus(u, id, 'approve', dto);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Từ chối yêu cầu đăng ký (kèm lý do)' })
  decline(@CurrentUser() u: CurrentUserPayload, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.changeStatus(u, id, 'decline', dto);
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Khóa tài khoản đang hoạt động' })
  lock(@CurrentUser() u: CurrentUserPayload, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.changeStatus(u, id, 'lock', dto);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mở khóa tài khoản' })
  unlock(@CurrentUser() u: CurrentUserPayload, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.changeStatus(u, id, 'unlock', dto);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vô hiệu hóa tài khoản (giữ lịch sử)' })
  deactivate(
    @CurrentUser() u: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.changeStatus(u, id, 'deactivate', dto);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kích hoạt lại tài khoản đã vô hiệu hóa' })
  reactivate(
    @CurrentUser() u: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.changeStatus(u, id, 'reactivate', dto);
  }

  @Post(':id/resend-invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi lại email mời (mã mới)' })
  async resendInvite(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const result = await this.accounts.resendInvite(actorOf(user), id);
    return { ...result, account: toPublicUser(result.account) };
  }

  @Put(':id/permissions')
  @ApiOperation({ summary: 'Bật/tắt công tắc quyền của một tài khoản' })
  async updatePermissions(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePermissionsDto,
  ) {
    const result = await this.accounts.updatePermissions(actorOf(user), id, dto.permissions);
    return { account: toPublicUser(result.user), granted: result.granted, revoked: result.revoked };
  }

  private async changeStatus(
    user: CurrentUserPayload,
    id: string,
    action: AccountAction,
    dto: ReasonDto,
  ) {
    return {
      account: toPublicUser(await this.accounts.changeStatus(actorOf(user), id, action, dto)),
    };
  }
}
