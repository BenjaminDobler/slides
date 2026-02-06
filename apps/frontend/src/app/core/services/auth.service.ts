import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { AuthResponse, LoginDto, RegisterDto } from '@slides/shared-types';

// Detect if running in Tauri desktop app
declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenSignal = signal<string | null>(localStorage.getItem('token'));
  private userSignal = signal<{ id: string; email: string; name?: string } | null>(null);

  /** True if running in Tauri desktop app - checked dynamically */
  get isDesktopApp(): boolean {
    if (typeof window === 'undefined') return false;
    // Check multiple indicators for Tauri detection
    return (
      !!window.__TAURI__ ||
      window.location.protocol === 'tauri:' ||
      window.location.hostname === 'tauri.localhost' ||
      // @ts-expect-error - Tauri internals injected before __TAURI__
      !!window.__TAURI_INTERNALS__
    );
  }

  isLoggedIn = computed(() => this.isDesktopApp || !!this.tokenSignal());
  user = this.userSignal.asReadonly();
  token = this.tokenSignal.asReadonly();

  constructor(private http: HttpClient) {
    // Auto-set user for desktop mode (check after a tick to ensure __TAURI__ is set)
    setTimeout(() => {
      if (this.isDesktopApp) {
        this.userSignal.set({ id: 'local', email: 'local@desktop', name: 'Local User' });
      }
    }, 0);
  }

  async login(dto: LoginDto): Promise<void> {
    const res = await this.http.post<AuthResponse>('/api/auth/login', dto).toPromise();
    if (res) {
      localStorage.setItem('token', res.token);
      this.tokenSignal.set(res.token);
      this.userSignal.set(res.user);
    }
  }

  async register(dto: RegisterDto): Promise<void> {
    const res = await this.http.post<AuthResponse>('/api/auth/register', dto).toPromise();
    if (res) {
      localStorage.setItem('token', res.token);
      this.tokenSignal.set(res.token);
      this.userSignal.set(res.user);
    }
  }

  logout(): void {
    localStorage.removeItem('token');
    this.tokenSignal.set(null);
    this.userSignal.set(null);
  }

  getToken(): string | null {
    return this.tokenSignal();
  }
}
