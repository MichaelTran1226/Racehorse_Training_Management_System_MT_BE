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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { MedicalService } from './medical.service';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import { UpdateMedicalRecordDto } from './dto/update-medical-record.dto';
import { MedicalRecordQueryDto } from './dto/medical-record-query.dto';
import { CreateTreatmentPhaseDto, UpdateTreatmentPhaseDto } from './dto/treatment-phase.dto';
import {
  CreatePrescriptionDto,
  StopPrescriptionDto,
  UpdatePrescriptionDto,
} from './dto/prescription.dto';
import { CreateFollowUpDto } from './dto/follow-up.dto';
import { CloseMedicalRecordDto, ReopenMedicalRecordDto } from './dto/close-record.dto';
import {
  CreateMedicalLockDto,
  ExtendMedicalLockDto,
  ReleaseMedicalLockDto,
} from './dto/medical-lock.dto';
import { HealthBoardQueryDto } from './dto/health-board-query.dto';
import { CreateInjuryDto } from './dto/create-injury.dto';

@ApiTags('Medical')
@ApiBearerAuth('JWT-auth')
@Controller('medical')
export class MedicalController {
  constructor(private readonly medicalService: MedicalService) {}

  // ---------------------------------------------------------------------------
  // HEALTH BOARD & OVERVIEW
  // ---------------------------------------------------------------------------

  @Get('health-board')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Sơ đồ sức khỏe đàn ngựa (thống kê nhóm & danh sách)' })
  getHealthBoard(@Query() query: HealthBoardQueryDto) {
    return this.medicalService.getHealthBoard(query);
  }

  // ---------------------------------------------------------------------------
  // 2D INJURIES (API-007)
  // ---------------------------------------------------------------------------

  @Post('injuries')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Đánh dấu vị trí chấn thương 2D và tạo/liên kết bệnh án (API-007)' })
  createInjury(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateInjuryDto) {
    return this.medicalService.createInjury(user, dto);
  }

  // ---------------------------------------------------------------------------
  // MEDICAL LOCKS (KHÓA HUẤN LUYỆN)
  // ---------------------------------------------------------------------------

  @Get('locks')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Danh sách Khóa huấn luyện' })
  getLocks(@Query('horseId') horseId?: string, @Query('isLocked') isLocked?: string) {
    return this.medicalService.getMedicalLocks({
      horseId,
      isLocked: isLocked !== undefined ? isLocked === 'true' : undefined,
    });
  }

  @Post('locks')
  @RequirePermission('placeLock')
  @ApiOperation({ summary: 'Đặt Khóa huấn luyện khẩn cấp' })
  createLock(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateMedicalLockDto) {
    return this.medicalService.createMedicalLock(user, dto);
  }

  @Post('locks/:id/release')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('liftLock')
  @ApiOperation({ summary: 'Gỡ Khóa huấn luyện' })
  releaseLock(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ReleaseMedicalLockDto,
  ) {
    return this.medicalService.releaseMedicalLock(id, user, dto);
  }

  @Post('locks/:id/extend')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('placeLock')
  @ApiOperation({ summary: 'Gia hạn ngày xem xét Khóa huấn luyện' })
  extendLock(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ExtendMedicalLockDto,
  ) {
    return this.medicalService.extendMedicalLock(id, user, dto);
  }

  // ---------------------------------------------------------------------------
  // MEDICAL RECORDS (BỆNH ÁN)
  // ---------------------------------------------------------------------------

  @Get('records')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Danh sách bệnh án điện tử' })
  getRecords(@CurrentUser() user: CurrentUserPayload, @Query() query: MedicalRecordQueryDto) {
    return this.medicalService.getMedicalRecords(user, query);
  }

  @Post('records')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Tạo bệnh án mới (Nháp hoặc Chốt)' })
  createRecord(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateMedicalRecordDto) {
    return this.medicalService.createMedicalRecord(user, dto);
  }

  @Get('records/:id')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Chi tiết bệnh án' })
  getRecordDetail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.medicalService.getMedicalRecordDetail(id, user);
  }

  @Put('records/:id')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Chỉnh sửa bệnh án' })
  updateRecord(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateMedicalRecordDto,
  ) {
    return this.medicalService.updateMedicalRecord(id, user, dto);
  }

  @Delete('records/:id')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Xóa bản nháp bệnh án' })
  deleteRecord(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.medicalService.deleteMedicalRecord(id, user);
  }

  @Post('records/:id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Kết thúc điều trị bệnh án' })
  closeRecord(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CloseMedicalRecordDto,
  ) {
    return this.medicalService.closeMedicalRecord(id, user, dto);
  }

  @Post('records/:id/reopen')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Mở lại bệnh án đã kết thúc (trong 7 ngày)' })
  reopenRecord(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ReopenMedicalRecordDto,
  ) {
    return this.medicalService.reopenMedicalRecord(id, user, dto);
  }

  // ---------------------------------------------------------------------------
  // PHÁC ĐỒ ĐIỀU TRỊ & KÊ ĐƠN THUỐC & TÁI KHÁM
  // ---------------------------------------------------------------------------

  @Post('records/:id/treatment-phases')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Thêm giai đoạn phác đồ điều trị' })
  addTreatmentPhase(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateTreatmentPhaseDto,
  ) {
    return this.medicalService.addTreatmentPhase(id, user, dto);
  }

  @Put('records/:id/treatment-phases/:phaseId')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Cập nhật giai đoạn phác đồ' })
  updateTreatmentPhase(
    @Param('id') id: string,
    @Param('phaseId') phaseId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateTreatmentPhaseDto,
  ) {
    return this.medicalService.updateTreatmentPhase(id, phaseId, user, dto);
  }

  @Post('records/:id/prescriptions')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Kê đơn thuốc' })
  addPrescription(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreatePrescriptionDto,
  ) {
    return this.medicalService.addPrescription(id, user, dto);
  }

  @Put('records/:id/prescriptions/:prescriptionId')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Sửa đơn thuốc' })
  updatePrescription(
    @Param('id') id: string,
    @Param('prescriptionId') prescriptionId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdatePrescriptionDto,
  ) {
    return this.medicalService.updatePrescription(id, prescriptionId, user, dto);
  }

  @Post('records/:id/prescriptions/:prescriptionId/stop')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Dừng đơn thuốc' })
  stopPrescription(
    @Param('id') id: string,
    @Param('prescriptionId') prescriptionId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: StopPrescriptionDto,
  ) {
    return this.medicalService.stopPrescription(id, prescriptionId, user, dto);
  }

  @Post('records/:id/follow-ups')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Ghi nhận lần tái khám' })
  addFollowUp(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateFollowUpDto,
  ) {
    return this.medicalService.addFollowUp(id, user, dto);
  }
}
