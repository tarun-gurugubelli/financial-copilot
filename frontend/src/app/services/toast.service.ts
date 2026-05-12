import { Injectable, signal } from '@angular/core';

export type ToastSeverity = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  title: string;
  body?: string;
  severity: ToastSeverity;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(title: string, body?: string, severity: ToastSeverity = 'info', durationMs = 5000): void {
    const id = `${Date.now()}-${Math.random()}`;
    this.toasts.update((t) => [...t, { id, title, body, severity }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  dismiss(id: string): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }

  success(title: string, body?: string): void { this.show(title, body, 'success'); }
  warning(title: string, body?: string): void  { this.show(title, body, 'warning', 7000); }
  error(title: string, body?: string): void    { this.show(title, body, 'error', 8000); }
}
