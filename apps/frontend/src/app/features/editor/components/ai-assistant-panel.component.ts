import { Component, signal, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../../core/services/ai.service';
import { ThemeService } from '../../../core/services/theme.service';
import type { AiProviderConfigDto } from '@slides/shared-types';

@Component({
  selector: 'app-ai-assistant-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ai-panel">
      <h3>AI Assistant</h3>

      <div class="mode-tabs">
        <button [class.active]="mode() === 'content'" (click)="mode.set('content')">Content</button>
        <button [class.active]="mode() === 'style'" (click)="mode.set('style')">Style</button>
      </div>

      <select [(ngModel)]="selectedProvider">
        @for (c of configs(); track c.id) {
          <option [value]="c.providerName">{{ c.providerName }}</option>
        }
      </select>

      @if (mode() === 'content') {
        <textarea [(ngModel)]="prompt" placeholder="Describe the slides you want to generate..." rows="4"></textarea>
        <button class="btn-action" (click)="generate()" [disabled]="loading()">
          {{ loading() ? 'Generating...' : 'Generate Slides' }}
        </button>
        @if (result()) {
          <div class="result">
            <p>Generated content ready.</p>
            <button class="btn-apply" (click)="applyResult()">Apply to Editor</button>
          </div>
        }
      }

      @if (mode() === 'style') {
        <textarea [(ngModel)]="stylePrompt" placeholder="Describe the style you want, e.g. 'retro neon cyberpunk with dark background and glowing accents'" rows="4"></textarea>
        <button class="btn-action" (click)="generateStyle()" [disabled]="loading()">
          {{ loading() ? 'Generating...' : 'Generate Theme' }}
        </button>
        @if (styleResult()) {
          <div class="result">
            <p><strong>{{ styleResult()!.displayName }}</strong></p>
            <p class="small">Theme "{{ styleResult()!.name }}" generated.</p>
            <button class="btn-apply" (click)="saveAndApplyStyle()">Save &amp; Apply Theme</button>
          </div>
        }
      }

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </div>
  `,
  styles: [`
    .ai-panel { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
    h3 { margin: 0; color: #fff; }
    .mode-tabs { display: flex; gap: 0; border-radius: 6px; overflow: hidden; border: 1px solid #333; }
    .mode-tabs button { flex: 1; padding: 0.5rem; background: transparent; border: none; color: #a8a8b3; cursor: pointer; font-size: 0.85rem; }
    .mode-tabs button.active { background: #0f3460; color: #fff; }
    select, textarea { width: 100%; padding: 0.5rem; border-radius: 6px; border: 1px solid #333; background: #0f3460; color: #fff; box-sizing: border-box; }
    textarea { resize: vertical; }
    .btn-action { padding: 0.6rem; border: none; border-radius: 6px; background: #e94560; color: #fff; cursor: pointer; }
    .btn-action:disabled { opacity: 0.5; }
    .result { background: #0f3460; padding: 0.75rem; border-radius: 6px; }
    .result p { margin: 0 0 0.25rem; color: #fff; }
    .result .small { font-size: 0.8rem; color: #a8a8b3; }
    .btn-apply { background: #2ecc71; border: none; border-radius: 6px; padding: 0.5rem 1rem; color: #fff; cursor: pointer; margin-top: 0.5rem; }
    .error { color: #e94560; font-size: 0.85rem; }
  `],
})
export class AiAssistantPanelComponent {
  @Output() contentGenerated = new EventEmitter<string>();
  @Output() themeGenerated = new EventEmitter<string>();

  configs = signal<AiProviderConfigDto[]>([]);
  selectedProvider = '';
  mode = signal<'content' | 'style'>('content');

  // Content mode
  prompt = '';
  result = signal('');

  // Style mode
  stylePrompt = '';
  styleResult = signal<{ name: string; displayName: string; cssContent: string } | null>(null);

  // Shared
  loading = signal(false);
  error = signal('');

  constructor(
    private aiService: AiService,
    private themeService: ThemeService,
  ) {
    this.aiService.getConfigs().subscribe((c) => {
      this.configs.set(c);
      if (c.length > 0) this.selectedProvider = c[0].providerName;
    });
  }

  generate() {
    if (!this.selectedProvider || !this.prompt) return;
    this.loading.set(true);
    this.error.set('');
    this.result.set('');
    this.aiService.generate(this.prompt, this.selectedProvider).subscribe({
      next: (res) => {
        this.result.set(res.content);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error || 'Generation failed');
        this.loading.set(false);
      },
    });
  }

  applyResult() {
    if (this.result()) {
      this.contentGenerated.emit(this.result());
      this.result.set('');
    }
  }

  generateStyle() {
    if (!this.selectedProvider || !this.stylePrompt) return;
    this.loading.set(true);
    this.error.set('');
    this.styleResult.set(null);
    this.aiService.generateTheme(this.stylePrompt, this.selectedProvider).subscribe({
      next: (res) => {
        this.styleResult.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error || 'Theme generation failed');
        this.loading.set(false);
      },
    });
  }

  saveAndApplyStyle() {
    const style = this.styleResult();
    if (!style) return;
    this.themeService.createTheme({
      name: style.name,
      displayName: style.displayName,
      cssContent: style.cssContent,
    }).subscribe({
      next: (saved) => {
        this.themeService.applyTheme(saved);
        this.themeGenerated.emit(saved.name);
        this.styleResult.set(null);
      },
      error: (err) => {
        this.error.set(err?.error?.error || 'Failed to save theme');
      },
    });
  }
}
