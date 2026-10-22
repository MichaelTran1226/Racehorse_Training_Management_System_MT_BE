import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { SimulatorService } from './simulator.service';
import { SimulatorSessionsResponse } from './simulator.types';

@ApiTags('Simulator Realtime & Sessions')
@ApiBearerAuth('JWT-auth')
@Controller('simulator')
export class SimulatorController {
  constructor(private readonly simulatorService: SimulatorService) {}

  @Get('sessions')
  @Roles(UserRole.CLUB_MANAGER, UserRole.HEAD_TRAINER, UserRole.VETERINARIAN)
  @ApiOperation({ summary: 'Truy vấn danh sách phiên mô phỏng đang chạy và lịch sử gần nhất' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Giới hạn số phiên gần nhất (1..100)',
  })
  async getSessions(@Query('limit') limit?: string): Promise<SimulatorSessionsResponse> {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.simulatorService.listRecent(parsedLimit);
  }
}
