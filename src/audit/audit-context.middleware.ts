import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export const auditRequestContext = new AsyncLocalStorage<{
  ipAddress: string | null;
  userAgent: string | null;
}>();

@Injectable()
export class AuditContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    // Express applies the configured proxy trust policy; never trust forwarded headers directly.
    auditRequestContext.run(
      {
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
      },
      next,
    );
  }
}
