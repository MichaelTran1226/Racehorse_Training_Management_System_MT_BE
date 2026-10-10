import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStallDto } from './dto/create-stall.dto';
import { UpdateStallDto } from './dto/update-stall.dto';
import { AssignHorseDto } from './dto/assign-horse.dto';
import { TransferHorseDto } from './dto/transfer-horse.dto';
import { ReturnStallDto } from './dto/return-stall.dto';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class StallsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async findAll(query: any, _user: CurrentUserPayload) {
    const { zone, status, search } = query;

    const where: any = {};
    if (zone) where.zone = zone;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { zone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const stalls = await this.prisma.stall.findMany({
      where,
      include: {
        allocations: {
          where: { isActive: true },
          include: {
            horse: true,
            assignedGroom: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
      orderBy: [{ zone: 'asc' }, { code: 'asc' }],
    });

    return stalls;
  }

  async getZones() {
    const zones = await this.prisma.stall.findMany({
      select: { zone: true },
      distinct: ['zone'],
      orderBy: { zone: 'asc' },
    });
    return zones.map((z) => z.zone).filter(Boolean);
  }

  async create(dto: CreateStallDto, user: CurrentUserPayload) {
    const existing = await this.prisma.stall.findUnique({
      where: { code: dto.code },
    });
    if (existing) throw new BadRequestException('Mã ô chuồng đã tồn tại');

    const stall = await this.prisma.stall.create({
      data: {
        code: dto.code,
        zone: dto.zone,
        notes: dto.notes,
        status: 'AVAILABLE',
      },
    });

    await this.auditService.record(
      { id: user.userId, name: 'System' },
      'CREATE_STALL',
      'Tạo ô chuồng',
      stall.id,
      { newValues: stall },
    );
    return stall;
  }

  async update(id: string, dto: UpdateStallDto, user: CurrentUserPayload) {
    const stall = await this.prisma.stall.findUnique({
      where: { id },
      include: { allocations: { where: { isActive: true } } },
    });
    if (!stall) throw new NotFoundException('Không tìm thấy ô chuồng');

    if (dto.code && dto.code !== stall.code) {
      const existing = await this.prisma.stall.findUnique({ where: { code: dto.code } });
      if (existing) throw new BadRequestException('Mã ô chuồng đã tồn tại');
    }

    if (dto.status === 'MAINTENANCE' && stall.allocations.length > 0) {
      throw new BadRequestException('Ô chuồng đang có ngựa. Vui lòng chuyển ngựa trước.');
    }

    const updated = await this.prisma.stall.update({
      where: { id },
      data: {
        ...dto,
      },
    });

    await this.auditService.record(
      { id: user.userId, name: 'System' },
      'UPDATE_STALL',
      'Cập nhật ô chuồng',
      id,
      { oldValues: stall as any, newValues: updated },
    );
    return updated;
  }

  async remove(id: string, user: CurrentUserPayload) {
    const stall = await this.prisma.stall.findUnique({
      where: { id },
      include: { allocations: true },
    });
    if (!stall) throw new NotFoundException('Không tìm thấy ô chuồng');

    if (stall.allocations.some((a) => a.isActive)) {
      throw new BadRequestException('Ô chuồng đang có ngựa. Vui lòng chuyển ngựa trước.');
    }

    await this.prisma.stall.delete({ where: { id } });
    await this.auditService.record(
      { id: user.userId, name: 'System' },
      'DELETE_STALL',
      'Xóa ô chuồng',
      id,
      { oldValues: stall as any },
    );
    return { success: true };
  }

  async assignHorse(stallId: string, dto: AssignHorseDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (prisma) => {
      const stall = await prisma.stall.findUnique({
        where: { id: stallId },
        include: { allocations: { where: { isActive: true } } },
      });
      if (!stall) throw new NotFoundException('Không tìm thấy ô chuồng');
      if (stall.status === 'MAINTENANCE') throw new BadRequestException('Ô chuồng đang bảo trì');
      if (stall.allocations.length > 0) throw new BadRequestException('Ô chuồng đã có ngựa');

      const horse = await prisma.horse.findUnique({
        where: { id: dto.horseId },
        include: { stallAllocations: { where: { isActive: true } } },
      });
      if (!horse) throw new NotFoundException('Không tìm thấy ngựa');
      if (horse.status === 'RETIRED') throw new BadRequestException('Ngựa đã ngừng quản lý');
      if (horse.stallAllocations.length > 0)
        throw new BadRequestException('Ngựa đang ở ô chuồng khác');

      const allocation = await prisma.stallAllocation.create({
        data: {
          stallId,
          horseId: dto.horseId,
          assignedGroomUserId: dto.assignedGroomUserId,
          isActive: true,
        },
      });

      await prisma.stall.update({
        where: { id: stallId },
        data: { status: 'OCCUPIED' },
      });

      await this.auditService.record(
        { id: user.userId, name: 'System' },
        'ASSIGN_HORSE',
        'Gán ngựa vào ô chuồng',
        allocation.id,
        { newValues: allocation as any },
        prisma as any,
      );
      return allocation;
    });
  }

  async transferHorse(allocationId: string, dto: TransferHorseDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (prisma) => {
      const oldAllocation = await prisma.stallAllocation.findUnique({
        where: { id: allocationId },
        include: { stall: true, horse: true },
      });
      if (!oldAllocation || !oldAllocation.isActive)
        throw new NotFoundException('Không tìm thấy bản ghi phân bổ đang hoạt động');

      const newStall = await prisma.stall.findUnique({
        where: { id: dto.newStallId },
        include: { allocations: { where: { isActive: true } } },
      });
      if (!newStall) throw new NotFoundException('Không tìm thấy ô chuồng mới');
      if (newStall.status === 'MAINTENANCE')
        throw new BadRequestException('Ô chuồng mới đang bảo trì');
      if (newStall.allocations.length > 0) throw new BadRequestException('Ô chuồng mới đã có ngựa');

      // End old allocation
      await prisma.stallAllocation.update({
        where: { id: allocationId },
        data: { isActive: false, endDate: new Date() },
      });

      // Update old stall status
      await prisma.stall.update({
        where: { id: oldAllocation.stallId },
        data: { status: 'AVAILABLE' },
      });

      // Create new allocation
      const newAllocation = await prisma.stallAllocation.create({
        data: {
          stallId: dto.newStallId,
          horseId: oldAllocation.horseId,
          assignedGroomUserId: dto.assignedGroomUserId || oldAllocation.assignedGroomUserId,
          isActive: true,
        },
      });

      // Update new stall status
      await prisma.stall.update({
        where: { id: dto.newStallId },
        data: { status: 'OCCUPIED' },
      });

      await this.auditService.record(
        { id: user.userId, name: 'System' },
        'TRANSFER_HORSE',
        'Chuyển ngựa sang ô chuồng khác',
        newAllocation.id,
        { oldValues: oldAllocation as any, newValues: newAllocation as any },
        prisma as any,
      );
      return newAllocation;
    });
  }

  async returnStall(allocationId: string, dto: ReturnStallDto, user: CurrentUserPayload) {
    return this.prisma.$transaction(async (prisma) => {
      const oldAllocation = await prisma.stallAllocation.findUnique({
        where: { id: allocationId },
      });
      if (!oldAllocation || !oldAllocation.isActive)
        throw new NotFoundException('Không tìm thấy bản ghi phân bổ đang hoạt động');

      await prisma.stallAllocation.update({
        where: { id: allocationId },
        data: { isActive: false, endDate: new Date() },
      });

      await prisma.stall.update({
        where: { id: oldAllocation.stallId },
        data: { status: 'AVAILABLE' },
      });

      await this.auditService.record(
        { id: user.userId, name: 'System' },
        'RETURN_STALL',
        'Trả ô chuồng',
        allocationId,
        {
          oldValues: oldAllocation as any,
          newValues: { isActive: false, notes: dto?.notes },
        },
        prisma as any,
      );
      return { success: true };
    });
  }
}
