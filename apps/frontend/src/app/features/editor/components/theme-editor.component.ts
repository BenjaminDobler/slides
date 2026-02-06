import { Component, DestroyRef, inject, output, signal, Input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  templateUrl: './theme-editor.component.html',
  styleUrl: './theme-editor.component.scss',
})
export class ThemeEditorComponent {
  private themeService = inject(ThemeService);
  private aiService = inject(AiService);
  private sanitizer = inject(DomSanitizer);
  private destroyRef = inject(DestroyRef);

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

  close = output<void>();
  saved = output<void>();

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

  constructor() {
    this.aiService.getConfigs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => {
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
    this.aiService.generateTheme(this.aiDescription, this.selectedProvider)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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
      })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.cleanup();
          this.saved.emit();
        });
    } else {
      this.themeService.createTheme({
        name: this.themeName,
        displayName: this.displayName,
        cssContent: this.cssContent,
      })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
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
