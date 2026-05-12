import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';

export const WS_EVENTS = {
  TRANSACTION_NEW: 'transaction.new',
  INSIGHT_GENERATED: 'insight.generated',
  CARD_UTILIZATION_WARNING: 'card.utilization_warning',
  DUE_DATE_REMINDER: 'due_date.reminder',
  SYNC_PROGRESS: 'sync.progress',
  EXTRACTION_FAILED: 'extraction.failed',
} as const;

function parseCookies(cookieHeader: string): Record<string, string> {
  return (cookieHeader ?? '').split(';').reduce<Record<string, string>>((acc, pair) => {
    const [k, ...v] = pair.trim().split('=');
    if (k) acc[k.trim()] = decodeURIComponent(v.join('='));
    return acc;
  }, {});
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(SocketGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket gateway initialised');
  }

  handleConnection(client: Socket) {
    // Authenticate on connection using the HttpOnly access_token cookie
    const cookieHeader = client.handshake.headers?.cookie ?? '';
    const cookies = parseCookies(cookieHeader);
    const token =
      cookies['access_token'] ??
      (client.handshake.auth?.token as string | undefined);

    if (!token) {
      this.logger.warn(`WS rejected (no token): ${client.id}`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      client.data.userId = payload.sub;
      client.join(payload.sub);
      this.logger.debug(`WS connected: ${client.id} → user ${payload.sub}`);
    } catch {
      this.logger.warn(`WS rejected (invalid token): ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(
      `WS disconnected: ${client.id} (user: ${client.data.userId ?? 'unknown'})`,
    );
  }

  /** Client can re-join its room after a reconnect (optional). */
  @SubscribeMessage('auth.join')
  handleAuthJoin(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (userId) client.join(userId);
    return { event: 'auth.joined', data: { userId } };
  }

  /** Emit a typed event to a single user's room. */
  emitToUser<T>(userId: string, event: string, payload: T): void {
    this.server?.to(userId).emit(event, payload);
  }
}
