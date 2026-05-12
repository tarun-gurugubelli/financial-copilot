import {
  Component, inject, signal, OnInit, OnDestroy, effect
} from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthStore } from '../../state/auth.store';
import { SocketService } from '../../services/socket.service';
import { ToastService } from '../../services/toast.service';
import { ApiService } from '../../services/api.service';

interface NavItem { label: string; path: string; icon: string; }

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AsyncPipe],
  template: `
    <div class="flex h-screen overflow-hidden" style="background-color: var(--color-bg)">

      <!-- Sidebar -->
      <aside class="flex flex-col border-r transition-all duration-200"
        [class]="sidebarOpen() ? 'w-56' : 'w-14'"
        style="background-color: var(--color-surface); border-color: var(--color-border)">

        <!-- Logo -->
        <div class="h-14 flex items-center px-4 border-b gap-2.5" style="border-color: var(--color-border)">
          <div class="h-7 w-7 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
            style="background-color: var(--color-primary)">FC</div>
          @if (sidebarOpen()) {
            <span class="font-semibold text-sm" style="color: var(--color-text)">Financial Copilot</span>
          }
        </div>

        <!-- Nav items -->
        <nav class="flex-1 py-3 space-y-0.5 px-2">
          @for (item of navItems; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="nav-active"
              class="flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors group relative"
              style="color: var(--color-muted)"
              title="{{ item.label }}">
              <span class="text-base flex-shrink-0 relative">
                {{ item.icon }}
                @if (item.path === '/notifications' && unreadCount() > 0) {
                  <span class="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full text-white flex items-center justify-center"
                    style="background-color: var(--color-primary); font-size: 9px; font-weight: 700">
                    {{ unreadCount() > 9 ? '9+' : unreadCount() }}
                  </span>
                }
              </span>
              @if (sidebarOpen()) {
                <span class="font-medium flex-1">{{ item.label }}</span>
                @if (item.path === '/notifications' && unreadCount() > 0) {
                  <span class="h-5 min-w-5 px-1 rounded-full text-white flex items-center justify-center text-xs font-bold"
                    style="background-color: var(--color-primary)">
                    {{ unreadCount() > 99 ? '99+' : unreadCount() }}
                  </span>
                }
              }
            </a>
          }
        </nav>

        <!-- User / logout -->
        <div class="border-t p-3" style="border-color: var(--color-border)">
          <button (click)="authStore.logout()"
            class="flex items-center gap-3 w-full px-2 py-2 rounded-lg text-sm transition-colors"
            style="color: var(--color-muted)">
            <span class="text-base flex-shrink-0">🚪</span>
            @if (sidebarOpen()) { <span>Sign out</span> }
          </button>
        </div>
      </aside>

      <!-- Main -->
      <div class="flex-1 flex flex-col overflow-hidden">

        <!-- Reconnect banner -->
        @if (!(socketConnected$ | async)) {
          <div class="flex items-center justify-center gap-2 py-1.5 text-xs font-medium"
            style="background-color: rgba(245,158,11,0.15); color: #d97706; border-bottom: 1px solid rgba(245,158,11,0.3)">
            <span class="h-2 w-2 rounded-full animate-pulse" style="background-color: #d97706"></span>
            Reconnecting to realtime feed…
          </div>
        }

        <!-- Navbar -->
        <header class="h-14 flex items-center gap-4 px-5 border-b flex-shrink-0"
          style="background-color: var(--color-surface); border-color: var(--color-border)">
          <!-- Sidebar toggle -->
          <button (click)="sidebarOpen.set(!sidebarOpen())"
            class="text-base p-1.5 rounded-lg transition-colors"
            style="color: var(--color-muted)">☰</button>

          <span class="flex-1"></span>

          <!-- Theme toggle -->
          <button (click)="toggleTheme()"
            class="text-base p-1.5 rounded-lg"
            style="color: var(--color-muted)">
            {{ isDark() ? '☀️' : '🌙' }}
          </button>

          <!-- User -->
          @if (authStore.user(); as user) {
            <div class="flex items-center gap-2">
              <div class="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style="background-color: var(--color-primary)">
                {{ user.name.charAt(0).toUpperCase() }}
              </div>
              <span class="text-sm hidden sm:block" style="color: var(--color-text)">{{ user.name }}</span>
            </div>
          }
        </header>

        <!-- Page content -->
        <main class="flex-1 overflow-auto p-6">
          <router-outlet />
        </main>
      </div>

    </div>

    <!-- Toast container (fixed, top-right) -->
    <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80 pointer-events-none">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg pointer-events-auto"
          [style.background-color]="toastBg(toast.severity)"
          [style.border]="toastBorder(toast.severity)"
          style="backdrop-filter: blur(8px)">
          <span class="text-lg flex-shrink-0">{{ toastIcon(toast.severity) }}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold truncate" [style.color]="toastColor(toast.severity)">
              {{ toast.title }}
            </p>
            @if (toast.body) {
              <p class="text-xs mt-0.5 truncate" [style.color]="toastColor(toast.severity)" style="opacity: 0.8">
                {{ toast.body }}
              </p>
            }
          </div>
          <button (click)="toastService.dismiss(toast.id)"
            class="flex-shrink-0 text-xs opacity-60 hover:opacity-100"
            [style.color]="toastColor(toast.severity)">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .nav-active {
      background-color: rgba(99,102,241,0.12);
      color: #6366F1 !important;
    }
  `],
})
export class ShellComponent implements OnInit, OnDestroy {
  readonly authStore = inject(AuthStore);
  readonly socketService = inject(SocketService);
  readonly toastService = inject(ToastService);
  private readonly api = inject(ApiService);

  readonly sidebarOpen = signal(true);
  readonly isDark = signal(true);
  readonly unreadCount = signal(0);

  readonly socketConnected$ = this.socketService.connected$;

  private subs: Subscription[] = [];

  readonly navItems: NavItem[] = [
    { label: 'Dashboard',     path: '/dashboard',     icon: '📊' },
    { label: 'Transactions',  path: '/transactions',  icon: '💳' },
    { label: 'AI Insights',   path: '/insights',      icon: '🤖' },
    { label: 'Cards',         path: '/cards',         icon: '🪪' },
    { label: 'Analytics',     path: '/analytics',     icon: '📈' },
    { label: 'Notifications', path: '/notifications', icon: '🔔' },
    { label: 'Settings',      path: '/settings',      icon: '⚙️' },
  ];

  constructor() {
    // React to auth state changes to connect/disconnect socket
    effect(() => {
      const user = this.authStore.user();
      if (user) {
        this.socketService.connect();
      } else {
        this.socketService.disconnect();
      }
    });
  }

  ngOnInit() {
    this.loadUnreadCount();

    // Live transaction toast
    this.subs.push(
      this.socketService.transactionNew$.subscribe((tx) => {
        const amount = tx.amount.toLocaleString('en-IN');
        this.toastService.success(
          `₹${amount} at ${tx.merchant}`,
          `Card ending ${tx.cardLast4}`,
        );
      }),
    );

    // Live notification badge increment
    this.subs.push(
      this.socketService.notificationNew$.subscribe(() => {
        this.unreadCount.update((c) => c + 1);
      }),
    );

    // Extraction failed toast
    this.subs.push(
      this.socketService.extractionFailed$.subscribe((n) => {
        this.toastService.warning(n.title, n.body);
      }),
    );
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
  }

  private loadUnreadCount() {
    this.api.getNotifications({ limit: 1, unreadOnly: true }).subscribe({
      next: (res) => this.unreadCount.set(res.unreadCount),
    });
  }

  toggleTheme() {
    const isLight = document.documentElement.classList.toggle('light');
    this.isDark.set(!isLight);
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  }

  toastIcon(severity: string): string {
    if (severity === 'success') return '✅';
    if (severity === 'warning') return '⚠️';
    if (severity === 'error')   return '❌';
    return 'ℹ️';
  }

  toastBg(severity: string): string {
    if (severity === 'success') return 'rgba(34,197,94,0.15)';
    if (severity === 'warning') return 'rgba(245,158,11,0.15)';
    if (severity === 'error')   return 'rgba(239,68,68,0.15)';
    return 'rgba(99,102,241,0.15)';
  }

  toastBorder(severity: string): string {
    if (severity === 'success') return '1px solid rgba(34,197,94,0.4)';
    if (severity === 'warning') return '1px solid rgba(245,158,11,0.4)';
    if (severity === 'error')   return '1px solid rgba(239,68,68,0.4)';
    return '1px solid rgba(99,102,241,0.4)';
  }

  toastColor(severity: string): string {
    if (severity === 'success') return '#22c55e';
    if (severity === 'warning') return '#f59e0b';
    if (severity === 'error')   return '#ef4444';
    return 'var(--color-text)';
  }
}
