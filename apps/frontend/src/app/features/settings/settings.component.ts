import { Component, OnInit, signal } from '@angular/core';
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
  template: `
    <div class="container">
      <div class="header">
        <h1>Settings</h1>
        <button class="btn-back" (click)="goBack()">&larr; Back</button>
      </div>

      <section>
        <h2>AI Providers</h2>
        <div class="provider-list">
          @for (c of configs(); track c.id) {
            <div class="provider-card">
              <span>{{ c.providerName }} {{ c.model ? '(' + c.model + ')' : '' }}</span>
              <button class="btn-delete" (click)="removeConfig(c.id)">Remove</button>
            </div>
          }
        </div>

        <div class="add-provider">
          <h3>Add Provider</h3>
          <select [(ngModel)]="newProvider">
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
          </select>
          <input type="password" [(ngModel)]="newApiKey" placeholder="API Key" />
          <input type="text" [(ngModel)]="newModel" placeholder="Model (optional)" />
          <button (click)="addConfig()">Add</button>
        </div>
      </section>
      <section>
        <h2>MCP Server</h2>
        <p class="mcp-desc">Use this token to connect the MCP server to external AI tools like Claude Code.</p>
        <div class="token-row">
          <code class="token-display">{{ tokenCopied() ? 'Copied!' : '••••••••••••••••' }}</code>
          <button class="btn-copy" (click)="copyToken()">Copy Token</button>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .container { max-width: 600px; margin: 0 auto; padding: 2rem; color: #f8f9fa; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
    .btn-back { padding: 0.4rem 0.8rem; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; background: transparent; color: #f8f9fa; cursor: pointer; transition: background 0.15s; }
    .btn-back:hover { background: #23262f; }
    section { background: #111318; padding: 1.5rem; border-radius: 10px; margin-bottom: 1.5rem; border: 1px solid rgba(255,255,255,0.08); }
    h2 { margin: 0 0 1rem; }
    h3 { margin: 1rem 0 0.5rem; }
    .provider-card { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: #1c1f26; border-radius: 6px; margin-bottom: 0.5rem; border: 1px solid rgba(255,255,255,0.08); }
    .btn-delete { background: transparent; border: none; color: #ef4444; cursor: pointer; }
    .add-provider { margin-top: 1rem; }
    .add-provider select, .add-provider input { width: 100%; padding: 0.5rem; margin-bottom: 0.5rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: #1c1f26; color: #f8f9fa; box-sizing: border-box; transition: border-color 0.15s; }
    .add-provider select:focus, .add-provider input:focus { outline: none; border-color: #3b82f6; }
    .add-provider button { padding: 0.6rem 1.2rem; border: none; border-radius: 6px; background: #3b82f6; color: #fff; cursor: pointer; transition: background 0.15s; }
    .add-provider button:hover { background: #2563eb; }
    .mcp-desc { color: #8b8d98; font-size: 0.85rem; margin: 0 0 0.75rem; }
    .token-row { display: flex; gap: 0.5rem; align-items: center; }
    .token-display { flex: 1; padding: 0.5rem; background: #1c1f26; border-radius: 6px; font-size: 0.85rem; color: #8b8d98; border: 1px solid rgba(255,255,255,0.08); }
    .btn-copy { padding: 0.5rem 1rem; border: none; border-radius: 6px; background: #8b5cf6; color: #fff; cursor: pointer; white-space: nowrap; transition: background 0.15s; }
    .btn-copy:hover { background: #7c3aed; }
  `],
})
export class SettingsComponent implements OnInit {
  configs = signal<AiProviderConfigDto[]>([]);
  tokenCopied = signal(false);
  newProvider = 'openai';
  newApiKey = '';
  newModel = '';

  constructor(private aiService: AiService, private authService: AuthService, private router: Router) {}

  ngOnInit() {
    this.loadConfigs();
  }

  private loadConfigs() {
    this.aiService.getConfigs().subscribe((c) => this.configs.set(c));
  }

  addConfig() {
    if (!this.newApiKey) return;
    this.aiService
      .saveConfig({ providerName: this.newProvider, apiKey: this.newApiKey, model: this.newModel || undefined })
      .subscribe(() => {
        this.newApiKey = '';
        this.newModel = '';
        this.loadConfigs();
      });
  }

  removeConfig(id: string) {
    this.aiService.deleteConfig(id).subscribe(() => this.loadConfigs());
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
