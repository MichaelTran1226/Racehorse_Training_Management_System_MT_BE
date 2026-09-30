import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Role, UserStatus } from '@prisma/client';
import { AccountsService } from '../src/accounts/accounts.service';
import { AuditService } from '../src/audit/audit.service';
import { CounterService } from '../src/audit/counter.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { OtpService } from '../src/auth/otp.service';
import { MailService } from '../src/mail/mail.service';

// Opt-in: a disposable PostgreSQL database with the Prisma schema already applied.
// Never falls back to DATABASE_URL. Cleanup only touches this run's random IDs.
describe('P1-06 PostgreSQL transaction guarantees', () => {
  const actorId = randomUUID();
  const targetId = randomUUID();
  let prisma: PrismaClient;
  let accounts: AccountsService;
  let audit: AuditService;

  beforeAll(async () => {
    const url = process.env.AUDIT_TEST_DATABASE_URL;
    if (!url) throw new Error('Set AUDIT_TEST_DATABASE_URL to an isolated test database');
    prisma = new PrismaClient({ datasourceUrl: url });
    const module = await Test.createTestingModule({
      providers: [
        AccountsService,
        AuditService,
        CounterService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: {} },
        { provide: OtpService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();
    accounts = module.get(AccountsService);
    audit = module.get(AuditService);
    await prisma.user.createMany({
      data: [
        {
          id: actorId,
          email: `${actorId}@example.test`,
          fullName: 'Audit test manager',
          role: Role.CLUB_MANAGER,
          status: UserStatus.ACTIVE,
        },
        {
          id: targetId,
          email: `${targetId}@example.test`,
          fullName: 'Before',
          role: Role.GROOM,
          status: UserStatus.ACTIVE,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.auditLog.deleteMany({ where: { userId: actorId } });
      await prisma.user.deleteMany({ where: { id: { in: [actorId, targetId] } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('chains before/after values across concurrent writers', async () => {
    const actor = { id: actorId, name: 'Audit test manager' };
    await Promise.all([
      accounts.update(actor, targetId, { fullName: 'Writer A' }),
      accounts.update(actor, targetId, { fullName: 'Writer B' }),
    ]);
    const logs = await prisma.auditLog.findMany({ where: { userId: actorId, entityId: targetId } });
    expect(logs).toHaveLength(2);
    const changes = logs.map((log) => ({
      before: JSON.parse(log.oldValuesJson!).fullName as string,
      after: JSON.parse(log.newValuesJson!).values.fullName as string,
    }));
    const first = changes.find((change) => change.before === 'Before')!;
    expect(first).toBeDefined();
    const second = changes.find((change) => change.before === first.after)!;
    expect(second).toBeDefined();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).fullName).toBe(
      second.after,
    );
  });

  it('rolls back the account mutation when the audit insert fails', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: targetId } });
    const count = await prisma.auditLog.count({ where: { userId: actorId } });
    // A nonexistent actor produces a real audit FK violation after the account UPDATE.
    await expect(
      accounts.update({ id: randomUUID(), name: 'Missing actor' }, targetId, {
        fullName: 'Must roll back',
      }),
    ).rejects.toThrow();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).fullName).toBe(
      before.fullName,
    );
    expect(await prisma.auditLog.count({ where: { userId: actorId } })).toBe(count);
  });

  it('queries real rows with name/action filters and pagination', async () => {
    const result = await audit.list({
      userId: actorId,
      actor: 'TEST MANAGER',
      action: 'ACCOUNT_EDITED',
      page: 2,
      pageSize: 1,
    });
    expect(result.total).toBe(2);
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].user).toEqual({ id: actorId, fullName: 'Audit test manager' });
  });
});
