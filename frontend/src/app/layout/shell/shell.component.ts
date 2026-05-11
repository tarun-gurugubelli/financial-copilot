import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthStore } from '../../state/auth.store';

interface NavItem { label: string; path: string; icon: string; }

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
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
              class="flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors group"
              style="color: var(--color-muted)"
              title="{{ item.label }}">
              <span class="text-base flex-shrink-0">{{ item.icon }}</span>
              @if (sidebarOpen()) {
                <span class="font-medium">{{ item.label }}</span>
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
  `,
  styles: [`
    .nav-active {
      background-color: rgba(99,102,241,0.12);
      color: #6366F1 !important;
    }
  `],
})
export class ShellComponent {
  readonly authStore = inject(AuthStore);
  readonly sidebarOpen = signal(true);
  readonly isDark = signal(true);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard',     path: '/dashboard',     icon: '📊' },
    { label: 'Transactions',  path: '/transactions',  icon: '💳' },
    { label: 'AI Insights',   path: '/insights',      icon: '🤖' },
    { label: 'Cards',         path: '/cards',         icon: '🪪' },
    { label: 'Analytics',     path: '/analytics',     icon: '📈' },
    { label: 'Notifications', path: '/notifications', icon: '🔔' },
    { label: 'Settings',      path: '/settings',      icon: '⚙️' },
  ];

  toggleTheme() {
    const isLight = document.documentElement.classList.toggle('light');
    this.isDark.set(!isLight);
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  }
}
