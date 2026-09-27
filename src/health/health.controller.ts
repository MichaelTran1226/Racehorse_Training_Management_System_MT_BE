import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService, HealthCheckResult } from './health.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Health & System')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Check API and Database Health Status',
    description: 'Returns health status, uptime, service version, and PostgreSQL connectivity.',
  })
  @ApiResponse({
    status: 200,
    description: 'System health check completed successfully',
    schema: {
      example: {
        statusCode: 200,
        success: true,
        data: {
          status: 'ok',
          service: 'EquiFlow Racehorse Training Management API',
          version: '0.1.0',
          uptime: 124,
          timestamp: '2026-09-28T03:30:00.000Z',
          database: {
            connected: true,
            provider: 'postgresql',
          },
        },
        timestamp: '2026-09-28T03:30:00.000Z',
      },
    },
  })
  async getHealth(): Promise<HealthCheckResult> {
    return this.healthService.check();
  }
}
