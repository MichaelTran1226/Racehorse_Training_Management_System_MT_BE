import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import { OtpService, purposeOf, sha256 } from './otp.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

describe('OtpService', () => {
  const mockPrisma = {
    otpCode: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), delete: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const mockMail = { send: jest.fn() };
  const config = { get: jest.fn().mockReturnValue('true') } as unknown as ConfigService;
  let service: OtpService;

  const record = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    email: 'anh@gmail.com',
    purpose: OtpPurpose.SIGNUP,
    codeHash: sha256('123456'),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 60000),
    resendAt: new Date(Date.now() + 60000),
    attempts: 0,
    ...overrides,
  });

  const fail = (p: Promise<unknown>) => p.catch((e: HttpException) => e) as Promise<HttpException>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OtpService(
      mockPrisma as unknown as PrismaService,
      mockMail as unknown as MailService,
      config,
    );
  });

  it('should map FE purposes to the enum', () => {
    expect(purposeOf('signup')).toBe(OtpPurpose.SIGNUP);
    expect(purposeOf('invite')).toBe(OtpPurpose.INVITE);
    expect(purposeOf('anything-else')).toBe(OtpPurpose.RESET);
  });

  it('should store only the hash of the code and mail the code when delivering', async () => {
    mockPrisma.otpCode.upsert.mockImplementation(({ create }) => Promise.resolve(create));

    await service.issue('anh@gmail.com', OtpPurpose.SIGNUP, true);

    const saved = mockPrisma.otpCode.upsert.mock.calls[0][0].create;
    expect(saved.codeHash).toBe(sha256('123456')); // DEV_FIXED_OTP=true
    expect(saved).not.toHaveProperty('code');
    expect(mockMail.send).toHaveBeenCalledWith(
      'anh@gmail.com',
      expect.stringContaining('123456'),
      expect.any(String),
    );
  });

  it('should not send mail when deliver is false', async () => {
    mockPrisma.otpCode.upsert.mockImplementation(({ create }) => Promise.resolve(create));
    await service.issue('ghost@gmail.com', OtpPurpose.RESET, false);
    expect(mockMail.send).not.toHaveBeenCalled();
  });

  it('should consume the code when it is correct', async () => {
    mockPrisma.otpCode.findUnique.mockResolvedValue(record());
    await service.check('anh@gmail.com', OtpPurpose.SIGNUP, '123456');
    expect(mockPrisma.otpCode.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('should return OTP_INVALID with attemptsLeft on a wrong code', async () => {
    mockPrisma.otpCode.findUnique.mockResolvedValue(record());
    mockPrisma.otpCode.update.mockResolvedValue(record({ attempts: 1 }));

    const error = await fail(service.check('anh@gmail.com', OtpPurpose.SIGNUP, '000000'));
    expect(error.getResponse()).toEqual(
      expect.objectContaining({ code: 'OTP_INVALID', data: { attemptsLeft: 4 } }),
    );
  });

  it('should treat a valid code for the wrong account state like a wrong code', async () => {
    mockPrisma.otpCode.findUnique.mockResolvedValue(record());
    mockPrisma.otpCode.update.mockResolvedValue(record({ attempts: 1 }));

    const error = await fail(service.check('anh@gmail.com', OtpPurpose.SIGNUP, '123456', false));
    expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'OTP_INVALID' }));
    expect(mockPrisma.otpCode.delete).not.toHaveBeenCalled();
  });

  it('should refuse after 5 wrong attempts and when the code expired', async () => {
    mockPrisma.otpCode.findUnique.mockResolvedValue(record({ attempts: 5 }));
    const tooMany = await fail(service.check('anh@gmail.com', OtpPurpose.SIGNUP, '123456'));
    expect(tooMany.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);

    mockPrisma.otpCode.findUnique.mockResolvedValue(
      record({ expiresAt: new Date(Date.now() - 1) }),
    );
    const expired = await fail(service.check('anh@gmail.com', OtpPurpose.SIGNUP, '123456'));
    expect(expired.getResponse()).toEqual(expect.objectContaining({ code: 'OTP_EXPIRED' }));
  });

  it('should enforce the 60-second cooldown before resending', async () => {
    mockPrisma.otpCode.findUnique.mockResolvedValue(record());
    const error = await fail(service.resend('anh@gmail.com', OtpPurpose.SIGNUP));
    expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'OTP_COOLDOWN' }));
  });
});
