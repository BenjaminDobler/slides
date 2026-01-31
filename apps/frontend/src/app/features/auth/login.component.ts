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
    .auth-container { display: flex; justify-content: center; align-items: center; height: 100vh; background: #1a1a2e; }
    .auth-card { background: #16213e; padding: 2rem; border-radius: 12px; width: 360px; color: #fff; }
    h1 { margin: 0 0 1.5rem; text-align: center; }
    input { width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid #333; border-radius: 6px; background: #0f3460; color: #fff; box-sizing: border-box; }
    button { width: 100%; padding: 0.75rem; border: none; border-radius: 6px; background: #e94560; color: #fff; cursor: pointer; font-size: 1rem; }
    button:hover { background: #c73a54; }
    .error { color: #e94560; font-size: 0.9rem; }
    .toggle { text-align: center; color: #a8a8b3; cursor: pointer; margin-top: 1rem; }
    .toggle:hover { color: #fff; }
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
