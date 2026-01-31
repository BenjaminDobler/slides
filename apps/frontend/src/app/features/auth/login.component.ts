import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <h1>{{ isRegister() ? 'Register' : 'Login' }}</h1>
        <form (ngSubmit)="submit()">
          @if (isRegister()) {
            <input type="text" [(ngModel)]="name" name="name" placeholder="Name" />
          }
          <input type="email" [(ngModel)]="email" name="email" placeholder="Email" required />
          <input type="password" [(ngModel)]="password" name="password" placeholder="Password" required />
          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
          <button type="submit">{{ isRegister() ? 'Register' : 'Login' }}</button>
        </form>
        <p class="toggle" (click)="isRegister.set(!isRegister())">
          {{ isRegister() ? 'Already have an account? Login' : 'No account? Register' }}
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-container { display: flex; justify-content: center; align-items: center; height: 100vh; background: #090b11; }
    .auth-card { background: #111318; padding: 2rem; border-radius: 12px; width: 360px; color: #f8f9fa; border: 1px solid rgba(255,255,255,0.08); }
    h1 { margin: 0 0 1.5rem; text-align: center; }
    input { width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; background: #1c1f26; color: #f8f9fa; box-sizing: border-box; transition: border-color 0.15s; }
    input:focus { outline: none; border-color: #3b82f6; }
    button { width: 100%; padding: 0.75rem; border: none; border-radius: 6px; background: #3b82f6; color: #fff; cursor: pointer; font-size: 1rem; transition: background 0.15s; }
    button:hover { background: #2563eb; }
    .error { color: #ef4444; font-size: 0.9rem; }
    .toggle { text-align: center; color: #8b8d98; cursor: pointer; margin-top: 1rem; }
    .toggle:hover { color: #f8f9fa; }
  `],
})
export class LoginComponent {
  email = '';
  password = '';
  name = '';
  isRegister = signal(false);
  error = signal('');

  constructor(private auth: AuthService, private router: Router) {}

  async submit() {
    this.error.set('');
    try {
      if (this.isRegister()) {
        await this.auth.register({ email: this.email, password: this.password, name: this.name });
      } else {
        await this.auth.login({ email: this.email, password: this.password });
      }
      this.router.navigate(['/presentations']);
    } catch (err: any) {
      this.error.set(err?.error?.error || 'Something went wrong');
    }
  }
}
