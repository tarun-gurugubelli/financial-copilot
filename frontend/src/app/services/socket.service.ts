import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TransactionNewPayload {
  transactionId: string | null;
  merchant: string;
  amount: number;
  category: string;
  cardLast4: string;
  timestamp: string;
  notificationId: string;
}

export interface NotificationNewPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private socket: Socket | null = null;

  readonly connected$ = new BehaviorSubject<boolean>(false);
  readonly transactionNew$ = new Subject<TransactionNewPayload>();
  readonly notificationNew$ = new Subject<NotificationNewPayload>();
  readonly extractionFailed$ = new Subject<NotificationNewPayload>();

  connect(): void {
    if (this.socket?.connected) return;

    // Socket.IO will send the HttpOnly access_token cookie automatically
    // because withCredentials is true and we're on the same origin.
    const url = environment.wsUrl || window.location.origin;

    this.socket = io(url, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      this.connected$.next(true);
    });

    this.socket.on('disconnect', () => {
      this.connected$.next(false);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[Socket] connect_error:', err.message);
      this.connected$.next(false);
    });

    this.socket.on('transaction.new', (payload: TransactionNewPayload) => {
      this.transactionNew$.next(payload);
    });

    this.socket.on('notification.new', (payload: NotificationNewPayload) => {
      this.notificationNew$.next(payload);
    });

    this.socket.on('extraction.failed', (payload: NotificationNewPayload) => {
      this.extractionFailed$.next(payload);
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connected$.next(false);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
