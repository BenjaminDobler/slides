import { Component, DestroyRef, inject, output, signal, Input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiService } from '../../../core/services/ai.service';
import { ThemeService } from '../../../core/services/theme.service';
import type { AiProviderConfigDto } from '@slides/shared-types';

@Component({
  selector: 'app-ai-assistant-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-assistant-panel.component.html',
  styleUrl: './ai-assistant-panel.component.scss',
})
export class AiAssistantPanelComponent {
  private aiService = inject(AiService);
  private themeService = inject(ThemeService);
  private destroyRef = inject(DestroyRef);

  @Input() set currentSlideContentInput(value: string) {
    this._currentSlideContent.set(value || '');
  }
  @Input() screenshotProvider: (() => Promise<string>) | null = null;

  _currentSlideContent = signal('');

  contentGenerated = output<string>();
  slideContentGenerated = output<string>();
  themeGenerated = output<string>();
  notesGenerated = output<{ slideIndex: number; notes: string }>();
  diagramGenerated = output<string>();

  configs = signal<AiProviderConfigDto[]>([]);
  selectedProvider = '';
  mode = signal<'generate' | 'enhance' | 'style'>('generate');
  generateMode = signal<'prompt' | 'outline'>('prompt');

  // Generate mode
  prompt = '';
  outlineText = '';
  result = signal('');

  // Enhance mode
  diagramPrompt = '';
  rewriteAudience = 'technical';
  visualInstruction = '';
  enhanceResult = signal('');
  enhanceResultLabel = signal('');
  private enhanceType = '';

  // Style mode
  stylePrompt = '';
  styleResult = signal<{ name: string; displayName: string; cssContent: string } | null>(null);

  // Shared
  loading = signal(false);
  error = signal('');

  constructor() {
    this.aiService.getConfigs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => {
        this.configs.set(c);
        if (c.length > 0) this.selectedProvider = c[0].providerName;
      });
  }

  generate() {
    if (!this.selectedProvider || !this.prompt) return;
    this.loading.set(true);
    this.error.set('');
    this.result.set('');
    this.aiService.generate(this.prompt, this.selectedProvider)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => { this.result.set(res.content); this.loading.set(false); },
        error: (err) => { this.error.set(err?.error?.error || 'Generation failed'); this.loading.set(false); },
      });
  }

  outlineToSlides() {
    if (!this.selectedProvider || !this.outlineText) return;
    this.loading.set(true);
    this.error.set('');
    this.result.set('');
    this.aiService.outlineToSlides(this.outlineText, this.selectedProvider)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => { this.result.set(res.content); this.loading.set(false); },
        error: (err) => { this.error.set(err?.error?.error || 'Generation failed'); this.loading.set(false); },
      });
  }

  applyResult() {
    if (this.result()) {
      this.contentGenerated.emit(this.result());
      this.result.set('');
    }
  }

  generateSpeakerNotes() {
    if (!this.selectedProvider) return;
    this.loading.set(true);
    this.error.set('');
    this.enhanceResult.set('');
    this.aiService.speakerNotes(this._currentSlideContent(), this.selectedProvider)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.enhanceResult.set(res.notes);
          this.enhanceResultLabel.set('Speaker notes generated:');
          this.enhanceType = 'notes';
          this.loading.set(false);
        },
        error: (err) => { this.error.set(err?.error?.error || 'Failed'); this.loading.set(false); },
      });
  }

  generateDiagram() {
    if (!this.selectedProvider || !this.diagramPrompt) return;
    this.loading.set(true);
    this.error.set('');
    this.enhanceResult.set('');
    this.aiService.generateDiagram(this.diagramPrompt, this.selectedProvider)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.enhanceResult.set(res.mermaid);
          this.enhanceResultLabel.set('Mermaid diagram generated:');
          this.enhanceType = 'diagram';
          this.loading.set(false);
        },
        error: (err) => { this.error.set(err?.error?.error || 'Failed'); this.loading.set(false); },
      });
  }

  rewriteSlide() {
    if (!this.selectedProvider) return;
    this.loading.set(true);
    this.error.set('');
    this.enhanceResult.set('');
    this.aiService.rewrite(this._currentSlideContent(), this.selectedProvider, this.rewriteAudience)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.enhanceResult.set(res.content);
          this.enhanceResultLabel.set(`Rewritten for ${this.rewriteAudience} audience:`);
          this.enhanceType = 'rewrite';
          this.loading.set(false);
        },
        error: (err) => { this.error.set(err?.error?.error || 'Failed'); this.loading.set(false); },
      });
  }

  async visualReview() {
    if (!this.selectedProvider || !this.screenshotProvider) return;
    this.loading.set(true);
    this.error.set('');
    this.enhanceResult.set('');
    try {
      const screenshot = await this.screenshotProvider();
      this.aiService.visualReview(this._currentSlideContent(), screenshot, this.selectedProvider)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (res) => {
            this.enhanceResult.set(res.review);
            this.enhanceResultLabel.set('Visual review:');
            this.enhanceType = 'review';
            this.loading.set(false);
          },
          error: (err) => { this.error.set(err?.error?.error || 'Review failed'); this.loading.set(false); },
        });
    } catch {
      this.error.set('Failed to capture screenshot');
      this.loading.set(false);
    }
  }

  async visualImprove() {
    if (!this.selectedProvider || !this.screenshotProvider) return;
    this.loading.set(true);
    this.error.set('');
    this.enhanceResult.set('');
    try {
      const screenshot = await this.screenshotProvider();
      this.aiService.visualImprove(this._currentSlideContent(), screenshot, this.selectedProvider, this.visualInstruction || undefined)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (res) => {
            this.enhanceResult.set(res.content);
            this.enhanceResultLabel.set('Improved slide content:');
            this.enhanceType = 'rewrite';
            this.loading.set(false);
          },
          error: (err) => { this.error.set(err?.error?.error || 'Improve failed'); this.loading.set(false); },
        });
    } catch {
      this.error.set('Failed to capture screenshot');
      this.loading.set(false);
    }
  }

  applyEnhanceResult() {
    const result = this.enhanceResult();
    if (!result) return;
    if (this.enhanceType === 'notes') {
      this.notesGenerated.emit({ slideIndex: -1, notes: result });
    } else if (this.enhanceType === 'diagram') {
      this.diagramGenerated.emit(result);
    } else if (this.enhanceType === 'rewrite') {
      this.slideContentGenerated.emit(result);
    } else if (this.enhanceType === 'review') {
      // Review is just text feedback, nothing to apply
    }
    this.enhanceResult.set('');
  }

  generateStyle() {
    if (!this.selectedProvider || !this.stylePrompt) return;
    this.loading.set(true);
    this.error.set('');
    this.styleResult.set(null);
    this.aiService.generateTheme(this.stylePrompt, this.selectedProvider)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => { this.styleResult.set(res); this.loading.set(false); },
        error: (err) => { this.error.set(err?.error?.error || 'Theme generation failed'); this.loading.set(false); },
      });
  }

  saveAndApplyStyle() {
    const style = this.styleResult();
    if (!style) return;
    this.themeService.createTheme({
      name: style.name,
      displayName: style.displayName,
      cssContent: style.cssContent,
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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
