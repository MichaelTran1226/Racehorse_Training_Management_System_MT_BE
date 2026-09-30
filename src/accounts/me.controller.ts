import { Body, Controller, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { toPublicUser } from '../users/public-user';
import { MeService } from './me.service';
import { ChangePasswordDto, UpdateNotificationDto, UpdateProfileDto } from './dto/accounts.dto';

@ApiTags('Authentication')
@ApiBearerAuth('JWT-auth')
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Put('profile')
  @ApiOperation({ summary: 'Sửa họ tên, số điện thoại của chính mình' })
  async updateProfile(@CurrentUser('userId') userId: string, @Body() dto: UpdateProfileDto) {
    return { user: toPublicUser(await this.me.updateProfile(userId, dto)) };
  }

  @Put('notifications')
  @ApiOperation({ summary: 'Bật/tắt một loại thông báo' })
  async updateNotification(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateNotificationDto,
  ) {
    return { user: toPublicUser(await this.me.updateNotification(userId, dto)) };
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đổi mật khẩu; đăng xuất các thiết bị khác và trả cặp token mới cho thiết bị này',
  })
  changePassword(@CurrentUser('userId') userId: string, @Body() dto: ChangePasswordDto) {
    return this.me.changePassword(userId, dto);
  }
}
