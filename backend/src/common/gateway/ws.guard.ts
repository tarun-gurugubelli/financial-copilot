import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';

function parseCookies(cookieHeader: string): Record<string, string> {
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, pair) => {
    const [k, ...v] = pair.trim().split('=');
    acc[k.trim()] = decodeURIComponent(v.join('='));
    return acc;
  }, {});
}

@Injectable()
export class WsGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const client: Socket = ctx.switchToWs().getClient();

    // Primary: read access_token HttpOnly cookie (sent automatically with withCredentials)
    const cookieHeader = client.handshake.headers?.cookie ?? '';
    const cookies = parseCookies(cookieHeader);
    const cookieToken = cookies['access_token'];

    // Fallback: bearer token in handshake.auth (useful for testing)
    const authToken = client.handshake.auth?.token as string | undefined;
    const authHeader = (client.handshake.headers?.authorization as string | undefined)
      ?.replace('Bearer ', '');

    const token = cookieToken ?? authToken ?? authHeader;

    if (!token) throw new WsException('Missing token');

    try {
      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      client.data.userId = payload.sub;
      return true;
    } catch {
      throw new WsException('Invalid token');
    }
  }
}
