import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  ElementRef,
  ViewChild,
  AfterViewInit,
  AfterViewChecked,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import type { ParsedSlide } from '@slides/markdown-parser';

declare const mermaid: any;

@Component({
  selector: 'app-slide-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="preview-container">
      <div class="slide-nav">
        <button (click)="prev()" [disabled]="currentIndex() === 0">&lt;</button>
        <span>{{ currentIndex() + 1 }} / {{ slides().length || 1 }}</span>
        <button (click)="next()" [disabled]="currentIndex() >= slides().length - 1">&gt;</button>
      </div>
      <div class="slide-area" #slideArea>
        <div class="slide-scaler" [style.transform]="'scale(' + slideScale() + ')'" >
          <div class="slide-frame" [attr.data-theme]="theme()">
            <div class="slide-content" #slideContent [innerHTML]="currentHtml()"></div>
          </div>
        </div>
      </div>
      @if (currentSlide()?.notes) {
        <div class="notes">
          <strong>Notes:</strong> {{ currentSlide()?.notes }}
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .preview-container { display: flex; flex-direction: column; height: 100%; background: #1a1a2e; }
    .slide-nav { display: flex; align-items: center; justify-content: center; gap: 1rem; padding: 0.5rem; background: #16213e; flex-shrink: 0; }
    .slide-nav button { background: #0f3460; border: none; color: #fff; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; }
    .slide-nav button:disabled { opacity: 0.3; cursor: default; }
    .slide-nav span { color: #a8a8b3; font-size: 0.9rem; }
    .slide-area { flex: 1; display: flex; align-items: center; justify-content: center; padding: 1rem; min-height: 0; overflow: hidden; }
    .slide-scaler { width: 960px; height: 600px; flex-shrink: 0; transform-origin: center center; }
    .slide-frame { width: 960px; height: 600px; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
    .slide-content { width: 960px; height: 600px; padding: 3rem; box-sizing: border-box; overflow: hidden; font-size: 1.5rem; cursor: text; }
    .notes { padding: 0.75rem; background: #16213e; color: #a8a8b3; font-size: 0.85rem; flex-shrink: 0; }
  `],
})
export class SlidePreviewComponent implements OnChanges, AfterViewInit, AfterViewChecked, OnDestroy {
  @Input() set slidesInput(value: ParsedSlide[]) {
    this.slides.set(value || []);
  }
  @Input() set themeInput(value: string) {
    if (value !== this.theme()) {
      this.theme.set(value);
      this.updateMermaidTheme(value);
      this.needsMermaidRender = true;
    }
  }
  @Input() set selectedIndex(value: number) {
    if (value !== undefined && value !== this.currentIndex()) {
      this.currentIndex.set(value);
      this.needsMermaidRender = true;
    }
  }
  @Output() indexChanged = new EventEmitter<number>();
  @Output() navigateToLine = new EventEmitter<number>();

  @ViewChild('slideContent') slideContentEl!: ElementRef;
  @ViewChild('slideArea') slideAreaEl!: ElementRef<HTMLDivElement>;

  private static readonly SLIDE_W = 960;
  private static readonly SLIDE_H = 600;

  slides = signal<ParsedSlide[]>([]);
  theme = signal('default');
  currentIndex = signal(0);
  slideScale = signal(1);
  private needsMermaidRender = false;
  private resizeObserver?: ResizeObserver;

  currentSlide = computed(() => this.slides()[this.currentIndex()] || null);
  currentHtml = computed(() => {
    const slide = this.currentSlide();
    return slide ? this.sanitizer.bypassSecurityTrustHtml(slide.html) : '';
  });

  constructor(private sanitizer: DomSanitizer) {}

  ngAfterViewInit() {
    this.calcScale();
    this.resizeObserver = new ResizeObserver(() => this.calcScale());
    this.resizeObserver.observe(this.slideAreaEl.nativeElement);

    // Double-click on slide content → navigate to source line in editor
    this.slideContentEl.nativeElement.addEventListener('dblclick', (e: MouseEvent) => {
      let el = e.target as HTMLElement | null;
      while (el && el !== this.slideContentEl.nativeElement) {
        const line = el.getAttribute('data-source-line');
        if (line !== null) {
          const slide = this.currentSlide();
          const offset = slide ? slide.lineOffset : 0;
          // data-source-line is 0-based relative to slide, editor lines are 1-based
          this.navigateToLine.emit(offset + parseInt(line, 10) + 1);
          return;
        }
        el = el.parentElement;
      }
    });
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }

  private calcScale() {
    const el = this.slideAreaEl?.nativeElement;
    if (!el) return;
    const padding = 32; // 1rem each side
    const availW = el.clientWidth - padding;
    const availH = el.clientHeight - padding;
    const scale = Math.min(availW / SlidePreviewComponent.SLIDE_W, availH / SlidePreviewComponent.SLIDE_H);
    this.slideScale.set(Math.min(scale, 1));
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['slidesInput']) {
      const newSlides = this.slides();
      if (this.currentIndex() >= newSlides.length && newSlides.length > 0) {
        this.currentIndex.set(newSlides.length - 1);
      }
      this.needsMermaidRender = true;
    }
  }

  ngAfterViewChecked() {
    if (this.needsMermaidRender && this.slideContentEl) {
      this.needsMermaidRender = false;
      this.renderMermaid();
    }
  }

  private async renderMermaid() {
    if (typeof mermaid === 'undefined') return;
    const el = this.slideContentEl?.nativeElement;
    if (!el) return;

    // Reset any previously rendered diagrams so mermaid re-renders them
    const processed = el.querySelectorAll('.mermaid[data-processed]');
    processed.forEach((node: HTMLElement) => {
      node.removeAttribute('data-processed');
      // Restore original source from the data attribute if available
      const src = node.getAttribute('data-mermaid-src');
      if (src) {
        node.textContent = src;
      }
    });

    const diagrams = el.querySelectorAll('.mermaid');
    if (diagrams.length > 0) {
      // Store source before mermaid replaces it
      diagrams.forEach((node: HTMLElement) => {
        if (!node.getAttribute('data-mermaid-src') && node.textContent) {
          node.setAttribute('data-mermaid-src', node.textContent.trim());
        }
      });
      try {
        await mermaid.run({ nodes: Array.from(diagrams) });
      } catch {
        // mermaid parse error - ignore
      }
    }
  }

  private updateMermaidTheme(themeName: string) {
    if (typeof mermaid === 'undefined') return;

    // Map slide themes to mermaid themes, with custom variable overrides
    const darkThemes = ['dark', 'creative'];
    const mermaidTheme = darkThemes.includes(themeName) ? 'dark' : 'default';

    // Read CSS custom properties from the theme to style mermaid
    const tempEl = document.createElement('div');
    tempEl.className = 'slide-content';
    tempEl.setAttribute('data-theme', themeName);
    tempEl.style.display = 'none';
    document.body.appendChild(tempEl);
    const styles = getComputedStyle(tempEl);
    const bg = styles.getPropertyValue('--slide-bg').trim();
    const text = styles.getPropertyValue('--slide-text').trim();
    const accent = styles.getPropertyValue('--slide-accent').trim();
    const heading = styles.getPropertyValue('--slide-heading').trim();
    document.body.removeChild(tempEl);

    mermaid.initialize({
      startOnLoad: false,
      theme: mermaidTheme,
      securityLevel: 'loose',
      themeVariables: {
        ...(bg && { background: bg, mainBkg: bg }),
        ...(text && { primaryTextColor: text, secondaryTextColor: text }),
        ...(accent && { primaryColor: accent, lineColor: accent }),
        ...(heading && { primaryBorderColor: heading }),
      },
    });
  }

  async captureScreenshot(): Promise<string> {
    const el = this.slideContentEl?.nativeElement?.parentElement; // .slide-frame
    if (!el) return '';
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(el, { scale: 1, useCORS: true, backgroundColor: null });
    // Return base64 without the data:image/png;base64, prefix
    return canvas.toDataURL('image/png').split(',')[1];
  }

  prev() {
    if (this.currentIndex() > 0) {
      this.currentIndex.update((i) => i - 1);
      this.needsMermaidRender = true;
      this.indexChanged.emit(this.currentIndex());
    }
  }

  next() {
    if (this.currentIndex() < this.slides().length - 1) {
      this.currentIndex.update((i) => i + 1);
      this.needsMermaidRender = true;
      this.indexChanged.emit(this.currentIndex());
    }
  }
}
