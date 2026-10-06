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
import { FinalizeRecordDto } from './dto/finalize-record.dto';
import {
  CreateMedicalLockDto,
  ExtendMedicalLockDto,
  ReleaseMedicalLockDto,
  MedicalLockQueryDto,
} from './dto/medical-lock.dto';
import { HealthBoardQueryDto } from './dto/health-board-query.dto';
import { CreateInjuryDto } from './dto/create-injury.dto';
import { UpdateInjuryDto } from './dto/update-injury.dto';
import { UpdateRecoveryProgressDto } from './dto/update-recovery-progress.dto';
import { InjuryQueryDto } from './dto/injury-query.dto';
import {
  CreatePreventiveTypeCatalogDto,
  UpdatePreventiveTypeCatalogDto,
} from './dto/preventive-catalog.dto';
import {
  RecordPreventiveCareDto,
  SetupHorsePreventiveDto,
  PreventiveQueryDto,
} from './dto/preventive-care.dto';
// import { PreventiveType } from '@prisma/client';

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

  @Get('horses/:id')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Hồ sơ y tế ngựa' })
  getHorseMedicalProfile(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.medicalService.getHorseMedicalProfile(id, user);
  }

  // ---------------------------------------------------------------------------
  // 2D INJURIES & RECOVERY PROGRESS (TASK P2-03 / API-007)
  // ---------------------------------------------------------------------------

  @Get('horses/:id/injuries')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Danh sách các điểm chấn thương 2D của chiến mã' })
  getHorseInjuries(
    @Param('id') horseId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: InjuryQueryDto,
  ) {
    return this.medicalService.getHorseInjuries(horseId, user, query);
  }

  @Post('injuries')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Đánh dấu vị trí chấn thương 2D trên mô hình (API-007 / DL-3.10)' })
  createInjury(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateInjuryDto) {
    return this.medicalService.createInjury(user, dto);
  }

  @Get('injuries/:id')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Chi tiết điểm chấn thương 2D và lịch sử tiến trình hồi phục' })
  getInjuryDetail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.medicalService.getInjuryDetail(id, user);
  }

  @Put('injuries/:id')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Chỉnh sửa vị trí / thông tin điểm chấn thương 2D (DL-3.10 Sửa)' })
  updateInjury(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateInjuryDto,
  ) {
    return this.medicalService.updateInjury(id, user, dto);
  }

  @Delete('injuries/:id')
  @RequirePermission('viewMedical')
  @ApiOperation({
    summary: 'Xóa điểm chấn thương (chỉ trong 24h và chưa cập nhật hồi phục - BTN-3.37)',
  })
  deleteInjury(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.medicalService.deleteInjury(id, user);
  }

  @Post('injuries/:id/recovery')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Cập nhật tiến trình hồi phục chấn thương (DL-3.11 / BTN-3.36)' })
  updateRecoveryProgress(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateRecoveryProgressDto,
  ) {
    return this.medicalService.updateRecoveryProgress(id, user, dto);
  }

  // ---------------------------------------------------------------------------
  // MEDICAL LOCKS (KHÓA HUẤN LUYỆN - TASK P2-04)
  // ---------------------------------------------------------------------------

  @Get('locks')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Danh sách Khóa huấn luyện (SC-3.06)' })
  getLocks(@CurrentUser() user: CurrentUserPayload, @Query() query: MedicalLockQueryDto) {
    return this.medicalService.getMedicalLocks(user, query);
  }

  @Get('locks/:id')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Chi tiết Khóa huấn luyện' })
  getLockDetail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.medicalService.getMedicalLockDetail(id, user);
  }

  @Post('locks')
  @RequirePermission('placeLock')
  @ApiOperation({ summary: 'Đặt Khóa huấn luyện khẩn cấp (DL-3.01 / BTN-3.03)' })
  createLock(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateMedicalLockDto) {
    return this.medicalService.createMedicalLock(user, dto);
  }

  @Post('locks/:id/release')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('liftLock')
  @ApiOperation({ summary: 'Gỡ Khóa huấn luyện (DL-3.02 / BTN-3.09)' })
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
  @ApiOperation({ summary: 'Gia hạn ngày xem xét Khóa huấn luyện (DL-3.03 / BTN-3.10)' })
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

  @Post('records/:id/finalize')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Chốt bệnh án (chuyển từ Nháp sang Chính thức)' })
  finalize(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: FinalizeRecordDto,
  ) {
    return this.medicalService.finalizeMedicalRecord(id, user, dto);
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

  // ---------------------------------------------------------------------------
  // PREVENTIVE CARE & CATALOGS (P2-05)
  // ---------------------------------------------------------------------------

  @Get('preventive/catalogs')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Lấy danh mục loại chăm sóc định kỳ' })
  getPreventiveCatalogs() {
    return this.medicalService.getPreventiveCatalogs();
  }

  @Post('preventive/catalogs')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Tạo loại chăm sóc định kỳ' })
  createPreventiveCatalog(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreatePreventiveTypeCatalogDto,
  ) {
    return this.medicalService.createPreventiveCatalog(user, dto);
  }

  @Put('preventive/catalogs/:id')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Cập nhật loại chăm sóc định kỳ' })
  updatePreventiveCatalog(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdatePreventiveTypeCatalogDto,
  ) {
    return this.medicalService.updatePreventiveCatalog(id, user, dto);
  }

  @Post('preventive/catalogs/:id/toggle-status')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Bật/Tắt trạng thái active loại chăm sóc định kỳ' })
  togglePreventiveCatalogStatus(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.medicalService.togglePreventiveCatalogStatus(id, user);
  }

  @Get('preventive/schedules')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Danh sách lịch chăm sóc định kỳ' })
  getPreventiveSchedules(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: PreventiveQueryDto,
  ) {
    return this.medicalService.getPreventiveSchedules(user, query);
  }

  @Post('preventive/record')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Ghi nhận thực hiện chăm sóc định kỳ (đơn lẻ hoặc hàng loạt)' })
  recordPreventiveCare(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RecordPreventiveCareDto,
  ) {
    return this.medicalService.recordPreventiveCare(user, dto);
  }

  @Post('preventive/setup')
  @RequirePermission('viewMedical')
  @ApiOperation({ summary: 'Thiết lập chu kỳ định kỳ riêng cho từng ngựa' })
  setupHorsePreventive(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SetupHorsePreventiveDto,
  ) {
    return this.medicalService.setupHorsePreventive(user, dto);
  }
}
