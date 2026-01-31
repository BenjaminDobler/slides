import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { AuthResponse, LoginDto, RegisterDto } from '@slides/shared-types';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenSignal = signal<string | null>(localStorage.getItem('token'));
  private userSignal = signal<{ id: string; email: string; name?: string } | null>(null);

  isLoggedIn = computed(() => !!this.tokenSignal());
  user = this.userSignal.asReadonly();
  token = this.tokenSignal.asReadonly();

  constructor(private http: HttpClient) {}

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
