import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ListNotificationsDto, MarkReadDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

// Mọi người đã đăng nhập chỉ đọc/sửa thông báo CỦA CHÍNH MÌNH (lọc theo userId trong service).
@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Thông báo của tôi (mới nhất trước) + số chưa đọc' })
  list(@CurrentUser() user: CurrentUserPayload, @Query() query: ListNotificationsDto) {
    return this.notifications.list(user.userId, query.limit);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đánh dấu đã đọc một số thông báo' })
  markRead(@CurrentUser() user: CurrentUserPayload, @Body() dto: MarkReadDto) {
    return this.notifications.markRead(user.userId, dto.ids);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đánh dấu đã đọc tất cả' })
  markAllRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.markAllRead(user.userId);
  }

  @Delete()
  @ApiOperation({ summary: 'Xóa tất cả thông báo của tôi' })
  clear(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.clear(user.userId);
  }
}
