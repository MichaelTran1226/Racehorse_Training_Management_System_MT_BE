import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MedicalService } from './medical.service';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { HealthBoardQueryDto } from './dto/health-board-query.dto';
import { HealthBoardResponseDto } from './dto/health-board-response.dto';
import { ObservationNotesQueryDto } from './dto/observation-notes-query.dto';

@ApiTags('Medical')
@ApiBearerAuth()
@Controller()
export class MedicalController {
  constructor(private readonly medicalService: MedicalService) {}

  @Get('horses/:id/health-board')
  @ApiOperation({
    summary: 'API-004: Lấy chi tiết hồ sơ y tế tổng hợp (6 tab) của một chiến mã (FR-3.02, FR-3.18)',
    description: 'Bao gồm Banner Khóa huấn luyện, 6 tab dữ liệu y tế và xử lý phân quyền xem theo vai trò (Owner/Groom/Vet/Trainer/Manager).',
  })
  @ApiResponse({ status: 200, type: HealthBoardResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden (Không có quyền xem hồ sơ y tế chiến mã này)' })
  @ApiResponse({ status: 404, description: 'Not Found (Chiến mã không tồn tại)' })
  async getHealthBoard(
    @Param('id') id: string,
    @Query() _query: HealthBoardQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<HealthBoardResponseDto> {
    return this.medicalService.getHealthBoard(id, user);
  }

  @Get('medical/horses/:id')
  @ApiOperation({
    summary: 'SC-3.02: Route truy cập Hồ sơ y tế chiến mã (6 tab)',
  })
  @ApiResponse({ status: 200, type: HealthBoardResponseDto })
  async getMedicalHorseProfile(
    @Param('id') id: string,
    @Query() query: HealthBoardQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<HealthBoardResponseDto> {
    return this.medicalService.getHealthBoard(id, user);
  }

  @Get('medical/horses/:id/observations')
  @ApiOperation({
    summary: 'FR-3.17: Lấy danh sách ghi chú quan sát sức khỏe của nhân viên chăm sóc',
    description: 'Cho phép lọc theo khoảng thời gian (startDate, endDate) và mức độ lưu ý (urgency).',
  })
  @ApiResponse({ status: 200, description: 'Danh sách ghi chú quan sát sức khỏe' })
  async getObservationNotes(
    @Param('id') id: string,
    @Query() query: ObservationNotesQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.medicalService.getObservationNotes(id, query, user);
  }
}
