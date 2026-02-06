import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AiService } from '../../core/services/ai.service';
import { AuthService } from '../../core/services/auth.service';
import type { AiProviderConfigDto } from '@slides/shared-types';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  private aiService = inject(AiService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  configs = signal<AiProviderConfigDto[]>([]);
  tokenCopied = signal(false);
  newProvider = 'openai';
  newApiKey = '';
  newModel = '';
  newBaseUrl = '';
  backendUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3332';
  isDesktopApp = this.authService.isDesktopApp;
  appVersion = signal<string | null>(null);

  constructor() {
    this.loadAppVersion();
  }

  private async loadAppVersion() {
    if (this.isDesktopApp && window.__TAURI__) {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        this.appVersion.set(await getVersion());
      } catch {
        // Fallback if Tauri API not available
      }
    }
  }

  ngOnInit() {
    this.loadConfigs();
  }

  private loadConfigs() {
    this.aiService.getConfigs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => this.configs.set(c));
  }

  addConfig() {
    // Validate: need either API key or base URL
    if (!this.newApiKey && !this.newBaseUrl) return;
    this.aiService
      .saveConfig({
        providerName: this.newProvider,
        apiKey: this.newApiKey || undefined,
        model: this.newModel || undefined,
        baseUrl: this.newBaseUrl || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.newApiKey = '';
        this.newModel = '';
        this.newBaseUrl = '';
        this.loadConfigs();
      });
  }

  removeConfig(id: string) {
    this.aiService.deleteConfig(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadConfigs());
  }

  copyToken() {
    const token = this.authService.getToken();
    if (token) {
      navigator.clipboard.writeText(token);
      this.tokenCopied.set(true);
      setTimeout(() => this.tokenCopied.set(false), 2000);
    }
  }

  goBack() {
    this.router.navigate(['/presentations']);
  }
}
