import { Component, signal, Output, EventEmitter, Input } from '@angular/core';
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
        <button [class.active]="mode() === 'generate'" (click)="mode.set('generate')">Generate</button>
        <button [class.active]="mode() === 'enhance'" (click)="mode.set('enhance')">Enhance</button>
        <button [class.active]="mode() === 'style'" (click)="mode.set('style')">Style</button>
      </div>

      <select [(ngModel)]="selectedProvider">
        @for (c of configs(); track c.id) {
          <option [value]="c.providerName">{{ c.providerName }}</option>
        }
      </select>

      @if (mode() === 'generate') {
        <div class="sub-tabs">
          <button [class.active]="generateMode() === 'prompt'" (click)="generateMode.set('prompt')">From Prompt</button>
          <button [class.active]="generateMode() === 'outline'" (click)="generateMode.set('outline')">From Outline</button>
        </div>
        @if (generateMode() === 'prompt') {
          <textarea [(ngModel)]="prompt" placeholder="Describe the slides you want to generate..." rows="4"></textarea>
          <button class="btn-action" (click)="generate()" [disabled]="loading()">
            {{ loading() ? 'Generating...' : 'Generate Slides' }}
          </button>
        } @else {
          <textarea [(ngModel)]="outlineText" placeholder="Paste an outline (e.g. bullet points, topics)..." rows="6"></textarea>
          <button class="btn-action" (click)="outlineToSlides()" [disabled]="loading()">
            {{ loading() ? 'Generating...' : 'Outline → Slides' }}
          </button>
        }
        @if (result()) {
          <div class="result">
            <p>Generated content ready.</p>
            <button class="btn-apply" (click)="applyResult()">Apply to Editor</button>
          </div>
        }
      }

      @if (mode() === 'enhance') {
        @if (!_currentSlideContent()) {
          <p class="hint">Select a slide to use enhance features.</p>
        } @else {
          <div class="enhance-actions">
            <button class="btn-enhance" (click)="generateSpeakerNotes()" [disabled]="loading()">
              {{ loading() ? 'Working...' : 'Generate Speaker Notes' }}
            </button>
            <button class="btn-enhance" (click)="generateDiagram()" [disabled]="loading() || !diagramPrompt">
              Generate Diagram
            </button>
            <textarea [(ngModel)]="diagramPrompt" placeholder="Describe the diagram..." rows="2"></textarea>
            <div class="rewrite-row">
              <select [(ngModel)]="rewriteAudience">
                <option value="technical">Technical</option>
                <option value="executive">Executive</option>
                <option value="casual">Casual</option>
              </select>
              <button class="btn-enhance" (click)="rewriteSlide()" [disabled]="loading()">
                {{ loading() ? 'Rewriting...' : 'Rewrite' }}
              </button>
            </div>
            @if (screenshotProvider) {
              <div class="visual-section">
                <span class="section-label">Visual AI (uses screenshot)</span>
                <button class="btn-visual" (click)="visualReview()" [disabled]="loading()">
                  {{ loading() ? 'Reviewing...' : 'Review Slide' }}
                </button>
                <textarea [(ngModel)]="visualInstruction" placeholder="Optional: specific instruction for improvement..." rows="2"></textarea>
                <button class="btn-visual" (click)="visualImprove()" [disabled]="loading()">
                  {{ loading() ? 'Improving...' : 'Improve Slide (Visual)' }}
                </button>
              </div>
            }
          </div>
          @if (enhanceResult()) {
            <div class="result">
              <p>{{ enhanceResultLabel() }}</p>
              <pre class="result-preview">{{ enhanceResult() }}</pre>
              <button class="btn-apply" (click)="applyEnhanceResult()">Apply</button>
            </div>
          }
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
    h3 { margin: 0; color: #f8f9fa; font-size: 0.95rem; font-weight: 600; }
    .mode-tabs, .sub-tabs { display: flex; gap: 0; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }
    .mode-tabs button, .sub-tabs button { flex: 1; padding: 0.5rem; background: transparent; border: none; color: #8b8d98; cursor: pointer; font-size: 0.85rem; transition: background 0.15s, color 0.15s; }
    .mode-tabs button.active, .sub-tabs button.active { background: rgba(59,130,246,0.15); color: #3b82f6; }
    .mode-tabs button:hover, .sub-tabs button:hover { color: #f8f9fa; }
    .sub-tabs { border-color: rgba(255,255,255,0.08); margin-top: -0.25rem; }
    .sub-tabs button { font-size: 0.8rem; padding: 0.35rem; }
    select, textarea { width: 100%; padding: 0.5rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: #1c1f26; color: #f8f9fa; box-sizing: border-box; transition: border-color 0.15s; }
    select:focus, textarea:focus { outline: none; border-color: #3b82f6; }
    textarea { resize: vertical; }
    .btn-action { padding: 0.6rem; border: none; border-radius: 6px; background: #3b82f6; color: #fff; cursor: pointer; transition: background 0.15s; }
    .btn-action:hover { background: #2563eb; }
    .btn-action:disabled { opacity: 0.5; }
    .result { background: #1c1f26; padding: 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); }
    .result p { margin: 0 0 0.25rem; color: #f8f9fa; }
    .result .small { font-size: 0.8rem; color: #8b8d98; }
    .result-preview { font-size: 0.75rem; color: #8b8d98; max-height: 120px; overflow-y: auto; white-space: pre-wrap; margin: 0.5rem 0; background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 4px; }
    .btn-apply { background: #22c55e; border: none; border-radius: 6px; padding: 0.5rem 1rem; color: #fff; cursor: pointer; margin-top: 0.5rem; transition: background 0.15s; }
    .btn-apply:hover { background: #16a34a; }
    .error { color: #ef4444; font-size: 0.85rem; }
    .hint { color: #8b8d98; font-size: 0.85rem; font-style: italic; }
    .enhance-actions { display: flex; flex-direction: column; gap: 0.5rem; }
    .btn-enhance { padding: 0.5rem; border: none; border-radius: 6px; background: #8b5cf6; color: #fff; cursor: pointer; font-size: 0.85rem; transition: background 0.15s; }
    .btn-enhance:hover { background: #7c3aed; }
    .btn-enhance:disabled { opacity: 0.5; }
    .rewrite-row { display: flex; gap: 0.5rem; }
    .rewrite-row select { flex: 1; }
    .rewrite-row button { flex-shrink: 0; }
    .visual-section { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.08); }
    .section-label { font-size: 0.75rem; color: #5c5e6a; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn-visual { padding: 0.5rem; border: none; border-radius: 6px; background: #14b8a6; color: #fff; cursor: pointer; font-size: 0.85rem; transition: background 0.15s; }
    .btn-visual:hover { background: #0d9488; }
    .btn-visual:disabled { opacity: 0.5; }
  `],
})
export class AiAssistantPanelComponent {
  @Input() set currentSlideContentInput(value: string) {
    this._currentSlideContent.set(value || '');
  }
  @Input() screenshotProvider: (() => Promise<string>) | null = null;
  _currentSlideContent = signal('');
  @Output() contentGenerated = new EventEmitter<string>();
  @Output() slideContentGenerated = new EventEmitter<string>();
  @Output() themeGenerated = new EventEmitter<string>();
  @Output() notesGenerated = new EventEmitter<{ slideIndex: number; notes: string }>();
  @Output() diagramGenerated = new EventEmitter<string>();

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
      next: (res) => { this.result.set(res.content); this.loading.set(false); },
      error: (err) => { this.error.set(err?.error?.error || 'Generation failed'); this.loading.set(false); },
    });
  }

  outlineToSlides() {
    if (!this.selectedProvider || !this.outlineText) return;
    this.loading.set(true);
    this.error.set('');
    this.result.set('');
    this.aiService.outlineToSlides(this.outlineText, this.selectedProvider).subscribe({
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
    this.aiService.speakerNotes(this._currentSlideContent(), this.selectedProvider).subscribe({
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
    this.aiService.generateDiagram(this.diagramPrompt, this.selectedProvider).subscribe({
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
    this.aiService.rewrite(this._currentSlideContent(), this.selectedProvider, this.rewriteAudience).subscribe({
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
      this.aiService.visualReview(this._currentSlideContent(), screenshot, this.selectedProvider).subscribe({
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
      this.aiService.visualImprove(this._currentSlideContent(), screenshot, this.selectedProvider, this.visualInstruction || undefined).subscribe({
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
    this.aiService.generateTheme(this.stylePrompt, this.selectedProvider).subscribe({
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
