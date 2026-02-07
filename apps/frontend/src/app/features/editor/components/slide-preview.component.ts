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
  private static readonly SLIDE_PADDING = 48; // 3rem padding on slide-content
  private static readonly MIN_CONTENT_SCALE = 0.5; // Don't scale below 50%
  private static readonly SCALE_BOTTOM_PADDING = 48; // Extra padding when scaling content

  slides = signal<ParsedSlide[]>([]);
  theme = signal('default');
  currentIndex = signal(0);
  slideScale = signal(1);
  contentScale = signal(1);
  autoScaleEnabled = signal(true);
  animateScale = signal(false); // Only animate when editing, not on slide change
  private needsMermaidRender = false;
  private needsContentScale = false;
  private isSlideChange = false;
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
      this.isSlideChange = true;
      this.animateScale.set(false); // Disable animation immediately for slide changes
      this.currentIndex.set(value);
      this.needsMermaidRender = true;
    }
  }
  @Input() set autoScale(value: boolean) {
    if (value !== this.autoScaleEnabled()) {
      this.autoScaleEnabled.set(value);
      this.calcContentScale();
    }
  }

  indexChanged = output<number>();
  navigateToLine = output<number>();
  autoScaleChanged = output<boolean>();

  currentSlide = computed(() => this.slides()[this.currentIndex()] || null);
  currentHtml = computed(() => {
    const slide = this.currentSlide();
    return slide ? this.sanitizer.bypassSecurityTrustHtml(slide.html) : '';
  });

  // Hero layouts use vertical centering, so scale from center; others scale from top
  // Return null when scaling is disabled to remove the style entirely
  contentTransformOrigin = computed(() => {
    if (!this.autoScaleEnabled()) return null;
    const layout = this.currentSlide()?.appliedLayout?.toLowerCase() || '';
    const centeredLayouts = ['hero'];
    return centeredLayouts.some(l => layout.includes(l)) ? 'center center' : 'top center';
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
      this.needsContentScale = true;
      this.renderMermaid();
    }
    if (this.needsContentScale && this.slideContentEl) {
      this.needsContentScale = false;
      this.calcContentScale();
    }
  }

  private async renderMermaid() {
    const el = this.slideContentEl?.nativeElement;
    if (!el) return;
    await this.mermaidService.renderDiagrams(el);
    // After mermaid renders, recalculate content scale
    this.calcContentScale();
  }

  private calcContentScale() {
    const el = this.slideContentEl?.nativeElement;
    if (!el) return;

    // If auto-scale is disabled, always use scale 1
    if (!this.autoScaleEnabled()) {
      if (this.contentScale() !== 1) {
        this.animateScale.set(!this.isSlideChange);
        this.contentScale.set(1);
      }
      this.isSlideChange = false;
      return;
    }

    // scrollHeight returns the actual content height (unaffected by CSS transform)
    const contentHeight = el.scrollHeight;
    const slideHeight = SlidePreviewComponent.SLIDE_H;
    const targetHeight = slideHeight - SlidePreviewComponent.SCALE_BOTTOM_PADDING;
    const currentScale = this.contentScale();

    let newScale = 1;
    if (contentHeight > targetHeight) {
      // Content overflows - scale down to fit with bottom padding
      newScale = Math.max(
        SlidePreviewComponent.MIN_CONTENT_SCALE,
        targetHeight / contentHeight
      );
    }

    // Only update if scale changed significantly (avoid micro-adjustments)
    if (Math.abs(newScale - currentScale) > 0.01) {
      // Only animate when editing content, not when changing slides
      this.animateScale.set(!this.isSlideChange);
      this.contentScale.set(newScale);
    }

    this.isSlideChange = false;
  }

  toggleAutoScale() {
    const newValue = !this.autoScaleEnabled();
    this.autoScaleEnabled.set(newValue);
    this.autoScaleChanged.emit(newValue);
    this.calcContentScale();
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
