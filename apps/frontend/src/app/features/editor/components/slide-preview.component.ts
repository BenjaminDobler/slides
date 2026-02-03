import {
  Component,
  Input,
  output,
  signal,
  computed,
  inject,
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
import { MermaidService } from '../../../core/services/mermaid.service';

@Component({
  selector: 'app-slide-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './slide-preview.component.html',
  styleUrl: './slide-preview.component.scss',
})
export class SlidePreviewComponent implements OnChanges, AfterViewInit, AfterViewChecked, OnDestroy {
  private sanitizer = inject(DomSanitizer);
  private mermaidService = inject(MermaidService);

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

  // Using @Input setters because they have side effects beyond just storing the value
  @Input() set slidesInput(value: ParsedSlide[]) {
    this.slides.set(value || []);
  }
  @Input() set themeInput(value: string) {
    if (value !== this.theme()) {
      this.theme.set(value);
      this.mermaidService.initializeTheme(value);
      this.needsMermaidRender = true;
    }
  }
  @Input() set selectedIndex(value: number) {
    if (value !== undefined && value !== this.currentIndex()) {
      this.currentIndex.set(value);
      this.needsMermaidRender = true;
    }
  }

  indexChanged = output<number>();
  navigateToLine = output<number>();

  currentSlide = computed(() => this.slides()[this.currentIndex()] || null);
  currentHtml = computed(() => {
    const slide = this.currentSlide();
    return slide ? this.sanitizer.bypassSecurityTrustHtml(slide.html) : '';
  });

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
    const el = this.slideContentEl?.nativeElement;
    if (!el) return;
    await this.mermaidService.renderDiagrams(el);
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
