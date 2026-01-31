import { Component, Output, EventEmitter, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ThemeService } from '../../../core/services/theme.service';
import { AiService } from '../../../core/services/ai.service';
import type { ThemeDto, AiProviderConfigDto } from '@slides/shared-types';

@Component({
  selector: 'app-theme-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="overlay" (click)="close.emit()"></div>
    <div class="modal">
      <div class="modal-header">
        <h2>{{ editingTheme() ? 'Edit Theme' : 'Create Theme' }}</h2>
        <button class="btn-close" (click)="close.emit()">&times;</button>
      </div>

      <div class="tabs">
        <button [class.active]="tab() === 'manual'" (click)="tab.set('manual')">Manual</button>
        <button [class.active]="tab() === 'ai'" (click)="tab.set('ai')">AI Generate</button>
      </div>

      @if (tab() === 'manual') {
        <div class="tab-content">
          <div class="form-row">
            <label>Theme Name</label>
            <input [(ngModel)]="themeName" placeholder="my-custom-theme" [disabled]="!!editingTheme()" />
          </div>
          <div class="form-row">
            <label>Display Name</label>
            <input [(ngModel)]="displayName" placeholder="My Custom Theme" />
          </div>
          <div class="color-grid">
            <div class="color-field">
              <label>Background</label>
              <input type="color" [(ngModel)]="bgColor" (ngModelChange)="buildCss()" />
            </div>
            <div class="color-field">
              <label>Text</label>
              <input type="color" [(ngModel)]="textColor" (ngModelChange)="buildCss()" />
            </div>
            <div class="color-field">
              <label>Heading</label>
              <input type="color" [(ngModel)]="headingColor" (ngModelChange)="buildCss()" />
            </div>
            <div class="color-field">
              <label>Accent</label>
              <input type="color" [(ngModel)]="accentColor" (ngModelChange)="buildCss()" />
            </div>
          </div>
          <div class="form-row">
            <label>Body Font</label>
            <select [(ngModel)]="bodyFont" (ngModelChange)="buildCss()">
              <option value="'Inter', sans-serif">Inter</option>
              <option value="'Roboto', sans-serif">Roboto</option>
              <option value="'Georgia', serif">Georgia</option>
              <option value="'Courier New', monospace">Courier New</option>
              <option value="system-ui, sans-serif">System UI</option>
            </select>
          </div>
          <div class="form-row">
            <label>Heading Font</label>
            <select [(ngModel)]="headingFont" (ngModelChange)="buildCss()">
              <option value="'Poppins', sans-serif">Poppins</option>
              <option value="'Inter', sans-serif">Inter</option>
              <option value="'Georgia', serif">Georgia</option>
              <option value="'Playfair Display', serif">Playfair Display</option>
              <option value="system-ui, sans-serif">System UI</option>
            </select>
          </div>
          <div class="form-row">
            <label>CSS (editable)</label>
            <textarea [(ngModel)]="cssContent" rows="8"></textarea>
          </div>
        </div>
      }

      @if (tab() === 'ai') {
        <div class="tab-content">
          <div class="form-row">
            <label>AI Provider</label>
            <select [(ngModel)]="selectedProvider">
              @for (c of configs(); track c.id) {
                <option [value]="c.providerName">{{ c.providerName }}</option>
              }
            </select>
          </div>
          <div class="form-row">
            <label>Describe your theme</label>
            <textarea [(ngModel)]="aiDescription" rows="3" placeholder="e.g. retro neon cyberpunk with dark background and glowing pink accents"></textarea>
          </div>
          <button class="btn-generate" (click)="generateWithAi()" [disabled]="aiLoading()">
            {{ aiLoading() ? 'Generating...' : 'Generate Theme' }}
          </button>
          @if (aiError()) {
            <p class="error">{{ aiError() }}</p>
          }
        </div>
      }

      <div class="preview-section">
        <label>Preview</label>
        <div class="preview-frame" [attr.data-theme]="themeName">
          <div class="slide-content" [attr.data-theme]="themeName" [innerHTML]="previewHtml()"></div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" (click)="close.emit()">Cancel</button>
        <button class="btn-save" (click)="save()" [disabled]="!themeName || !displayName || !cssContent">
          {{ editingTheme() ? 'Update' : 'Save Theme' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000; }
    .modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 600px; max-height: 90vh; overflow-y: auto; background: #1a1a2e; border-radius: 12px; z-index: 1001; color: #fff; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid #333; }
    .modal-header h2 { margin: 0; font-size: 1.2rem; }
    .btn-close { background: none; border: none; color: #fff; font-size: 1.5rem; cursor: pointer; }
    .tabs { display: flex; border-bottom: 1px solid #333; }
    .tabs button { flex: 1; padding: 0.75rem; background: transparent; border: none; color: #a8a8b3; cursor: pointer; font-size: 0.9rem; }
    .tabs button.active { color: #fff; border-bottom: 2px solid #e94560; }
    .tab-content { padding: 1rem 1.5rem; }
    .form-row { margin-bottom: 0.75rem; }
    .form-row label { display: block; font-size: 0.8rem; color: #a8a8b3; margin-bottom: 4px; }
    .form-row input, .form-row select, .form-row textarea { width: 100%; padding: 0.5rem; border-radius: 6px; border: 1px solid #333; background: #0f3460; color: #fff; box-sizing: border-box; }
    .form-row textarea { font-family: monospace; font-size: 0.85rem; resize: vertical; }
    .color-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem; }
    .color-field label { display: block; font-size: 0.75rem; color: #a8a8b3; margin-bottom: 4px; }
    .color-field input[type="color"] { width: 100%; height: 36px; border: 1px solid #333; border-radius: 6px; cursor: pointer; background: transparent; }
    .btn-generate { width: 100%; padding: 0.6rem; border: none; border-radius: 6px; background: #e94560; color: #fff; cursor: pointer; }
    .btn-generate:disabled { opacity: 0.5; }
    .error { color: #e94560; font-size: 0.85rem; }
    .preview-section { padding: 0 1.5rem 1rem; }
    .preview-section label { display: block; font-size: 0.8rem; color: #a8a8b3; margin-bottom: 4px; }
    .preview-frame { border-radius: 8px; overflow: hidden; aspect-ratio: 16/10; border: 1px solid #333; }
    .preview-frame .slide-content { padding: 1.5rem; height: 100%; box-sizing: border-box; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 1rem 1.5rem; border-top: 1px solid #333; }
    .btn-cancel { padding: 0.5rem 1rem; border: 1px solid #555; border-radius: 6px; background: transparent; color: #fff; cursor: pointer; }
    .btn-save { padding: 0.5rem 1rem; border: none; border-radius: 6px; background: #2ecc71; color: #fff; cursor: pointer; }
    .btn-save:disabled { opacity: 0.5; }
  `],
})
export class ThemeEditorComponent {
  @Input() set editTheme(value: ThemeDto | null) {
    this.editingTheme.set(value);
    if (value) {
      this.themeName = value.name;
      this.displayName = value.displayName;
      this.cssContent = value.cssContent;
      this.extractColorsFromCss(value.cssContent);
      this.injectPreviewCss();
    }
  }
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  editingTheme = signal<ThemeDto | null>(null);
  tab = signal<'manual' | 'ai'>('manual');

  themeName = '';
  displayName = '';
  cssContent = '';

  bgColor = '#ffffff';
  textColor = '#333333';
  headingColor = '#1a1a1a';
  accentColor = '#0066cc';
  bodyFont = "'Inter', sans-serif";
  headingFont = "'Poppins', sans-serif";

  configs = signal<AiProviderConfigDto[]>([]);
  selectedProvider = '';
  aiDescription = '';
  aiLoading = signal(false);
  aiError = signal('');

  private previewStyleEl: HTMLStyleElement | null = null;

  constructor(
    private themeService: ThemeService,
    private aiService: AiService,
    private sanitizer: DomSanitizer
  ) {
    this.aiService.getConfigs().subscribe((c) => {
      this.configs.set(c);
      if (c.length > 0) this.selectedProvider = c[0].providerName;
    });
    this.buildCss();
  }

  previewHtml() {
    return this.sanitizer.bypassSecurityTrustHtml(
      '<h1>Slide Title</h1><h2>Subtitle</h2><p>This is body text with an <a href="#">accent link</a>.</p><ul><li>Bullet point one</li><li>Bullet point two</li></ul><pre><code>const x = 42;</code></pre>'
    );
  }

  buildCss() {
    const n = this.themeName || 'preview';
    this.cssContent = `.slide-content[data-theme="${n}"], [data-theme="${n}"] .slide-content, [data-theme="${n}"] .slide {
  --slide-bg: ${this.bgColor}; --slide-text: ${this.textColor}; --slide-heading: ${this.headingColor}; --slide-accent: ${this.accentColor};
  background: var(--slide-bg); color: var(--slide-text); font-family: ${this.bodyFont};
}
[data-theme="${n}"] h1, [data-theme="${n}"] h2, [data-theme="${n}"] h3 {
  font-family: ${this.headingFont}; color: var(--slide-heading);
}
[data-theme="${n}"] code { background: ${this.lighten(this.bgColor, 20)}; padding: 0.2em 0.4em; border-radius: 3px; }
[data-theme="${n}"] a { color: var(--slide-accent); }`;
    this.injectPreviewCss();
  }

  private injectPreviewCss() {
    if (!this.previewStyleEl) {
      this.previewStyleEl = document.createElement('style');
      this.previewStyleEl.id = 'theme-editor-preview';
      document.head.appendChild(this.previewStyleEl);
    }
    this.previewStyleEl.textContent = this.cssContent;
  }

  private extractColorsFromCss(css: string) {
    const bgMatch = css.match(/--slide-bg:\s*(#[0-9a-fA-F]{3,8})/);
    const textMatch = css.match(/--slide-text:\s*(#[0-9a-fA-F]{3,8})/);
    const headingMatch = css.match(/--slide-heading:\s*(#[0-9a-fA-F]{3,8})/);
    const accentMatch = css.match(/--slide-accent:\s*(#[0-9a-fA-F]{3,8})/);
    if (bgMatch) this.bgColor = bgMatch[1];
    if (textMatch) this.textColor = textMatch[1];
    if (headingMatch) this.headingColor = headingMatch[1];
    if (accentMatch) this.accentColor = accentMatch[1];
  }

  private lighten(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  generateWithAi() {
    if (!this.selectedProvider || !this.aiDescription) return;
    this.aiLoading.set(true);
    this.aiError.set('');
    this.aiService.generateTheme(this.aiDescription, this.selectedProvider).subscribe({
      next: (res) => {
        this.themeName = res.name;
        this.displayName = res.displayName;
        this.cssContent = res.cssContent;
        this.extractColorsFromCss(res.cssContent);
        this.injectPreviewCss();
        this.tab.set('manual');
        this.aiLoading.set(false);
      },
      error: (err) => {
        this.aiError.set(err?.error?.error || 'Theme generation failed');
        this.aiLoading.set(false);
      },
    });
  }

  save() {
    if (!this.themeName || !this.displayName || !this.cssContent) return;
    const editing = this.editingTheme();
    if (editing) {
      this.themeService.updateTheme(editing.id, {
        displayName: this.displayName,
        cssContent: this.cssContent,
      }).subscribe(() => {
        this.cleanup();
        this.saved.emit();
      });
    } else {
      this.themeService.createTheme({
        name: this.themeName,
        displayName: this.displayName,
        cssContent: this.cssContent,
      }).subscribe(() => {
        this.cleanup();
        this.saved.emit();
      });
    }
  }

  private cleanup() {
    if (this.previewStyleEl) {
      this.previewStyleEl.remove();
      this.previewStyleEl = null;
    }
  }
}
