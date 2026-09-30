import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose, Role, UserStatus } from '@prisma/client';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { OtpService } from '../auth/otp.service';

describe('AccountsService', () => {
  const manager = {
    id: 'viet',
    fullName: 'Đỗ Quốc Việt',
    email: 'viet.do@gmail.com',
    role: Role.CLUB_MANAGER,
    status: UserStatus.ACTIVE,
    permissions: null,
    requestCode: null,
    statusReason: null,
  };
  const actor = { id: 'viet', name: 'Đỗ Quốc Việt' };

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...target, ...data })),
      count: jest.fn(),
      delete: jest.fn(),
    },
    otpCode: { deleteMany: jest.fn() },
    resetToken: { deleteMany: jest.fn() },
    loginAttempt: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const mockMail = { send: jest.fn() };
  const mockAudit = { record: jest.fn() };
  const mockAuth = { revokeAllTokens: jest.fn() };
  const mockOtp = { issue: jest.fn(), assertCooldown: jest.fn() };
  const config = { get: jest.fn() } as unknown as ConfigService;
  let target: Record<string, unknown>;
  let service: AccountsService;

  const fail = (p: Promise<unknown>) => p.catch((e: HttpException) => e) as Promise<HttpException>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AccountsService(
      mockPrisma as unknown as PrismaService,
      mockMail as unknown as MailService,
      mockAudit as unknown as AuditService,
      mockAuth as unknown as AuthService,
      mockOtp as unknown as OtpService,
      config,
    );
  });

  const withTarget = (t: Record<string, unknown>) => {
    target = t;
    mockPrisma.user.findUnique.mockResolvedValue(t);
  };

  it('should approve a pending request, mail the owner and keep sessions', async () => {
    withTarget({
      ...manager,
      id: 'anh',
      role: Role.HORSE_OWNER,
      status: UserStatus.PENDING_APPROVAL,
    });

    const updated = await service.changeStatus(actor, 'anh', 'approve', {});

    expect(updated.status).toBe(UserStatus.ACTIVE);
    expect(mockMail.send).toHaveBeenCalled();
    expect(mockAuth.revokeAllTokens).not.toHaveBeenCalled();
  });

  it('should lock an active account with a reason and sign it out everywhere', async () => {
    withTarget({ ...manager, id: 'binh', role: Role.GROOM });

    const updated = await service.changeStatus(actor, 'binh', 'lock', {
      reason: 'Shared password',
    });

    expect(updated.status).toBe(UserStatus.LOCKED);
    expect(updated.statusReason).toBe('Shared password');
    expect(mockAuth.revokeAllTokens).toHaveBeenCalledWith('binh');
  });

  it('should not let a manager lock their own account', async () => {
    withTarget(manager);
    const error = await fail(service.changeStatus(actor, 'viet', 'lock', {}));
    expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'CANNOT_LOCK_SELF' }));
  });

  it('should keep at least one active Club Manager', async () => {
    withTarget({ ...manager, id: 'minh', fullName: 'Mai Quang Minh' });
    mockPrisma.user.count.mockResolvedValue(1);

    const error = await fail(service.changeStatus(actor, 'minh', 'deactivate', {}));
    expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'LAST_MANAGER' }));
  });

  it('should reject an action that does not fit the current status', async () => {
    withTarget({ ...manager, id: 'ha', role: Role.HORSE_OWNER });
    const error = await fail(service.changeStatus(actor, 'ha', 'approve', {}));
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'INVALID_STATE' }));
  });

  it('should refuse to hard-delete an account that has been used', async () => {
    withTarget({ ...manager, id: 'nam', role: Role.HEAD_TRAINER });
    const error = await fail(service.remove(actor, 'nam'));
    expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'CANNOT_DELETE_USED' }));
  });

  it('should invite staff as INVITED and mail an invite code, but never a Horse Owner', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'tung', ...data }),
    );

    const user = await service.invite(actor, {
      fullName: 'Ngô Thanh Tùng',
      email: 'tung.ngo@gmail.com',
      role: 'GROOM',
    });
    expect(user.status).toBe(UserStatus.INVITED);
    expect(user.invitedBy).toBe('Đỗ Quốc Việt');
    expect(mockOtp.issue).toHaveBeenCalledWith('tung.ngo@gmail.com', OtpPurpose.INVITE, true);

    const error = await fail(
      service.invite(actor, { fullName: 'X', email: 'x@gmail.com', role: 'HORSE_OWNER' }),
    );
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('should count granted and revoked switches when saving permissions', async () => {
    withTarget({ ...manager, id: 'nam', role: Role.HEAD_TRAINER });

    const result = await service.updatePermissions(actor, 'nam', {
      viewAudit: true, // bật thêm
      createPlan: false, // tắt
    });

    expect(result.granted).toBe(1);
    expect(result.revoked).toBe(1);
  });
});
