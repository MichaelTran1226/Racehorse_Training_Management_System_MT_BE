// Bản giả NotificationsService cho unit test: các service chỉ gọi notify…(), test không cần DB.
import { NotificationsService } from './notifications.service';

export function notificationsMock() {
  return {
    provide: NotificationsService,
    useValue: {
      notifyUsers: jest.fn().mockResolvedValue(undefined),
      notifyRoles: jest.fn().mockResolvedValue(undefined),
      notifyHorse: jest.fn().mockResolvedValue(undefined),
      horseAudience: jest.fn().mockResolvedValue([]),
    },
  };
}
