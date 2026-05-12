import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

const SENSITIVE_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

@Injectable()
export class AuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Audit');

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const { method, originalUrl, ip } = req;
    const userId = (req.user as { userId?: string } | undefined)?.userId ?? 'anonymous';

    res.on('finish', () => {
      const duration = Date.now() - start;
      const isSensitive = SENSITIVE_PATHS.some((p) => originalUrl.includes(p));

      this.logger.log({
        method,
        url: isSensitive ? originalUrl.replace(/\?.*/, '') : originalUrl,
        status: res.statusCode,
        duration,
        userId,
        ip,
      } as unknown as string);
    });

    next();
  }
}
