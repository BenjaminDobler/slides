import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  name = '';
  isRegister = signal(false);
  error = signal('');

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
