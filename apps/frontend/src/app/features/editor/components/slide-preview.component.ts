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
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ParsedSlide } from '@slides/markdown-parser';
import { MermaidService } from '../../../core/services/mermaid.service';
import { ThemeService } from '../../../core/services/theme.service';
import { SlideRendererComponent } from '../../../shared/components/slide-renderer.component';

@Component({
  selector: 'app-slide-preview',
  standalone: true,
  imports: [CommonModule, SlideRendererComponent],
  templateUrl: './slide-preview.component.html',
  styleUrl: './slide-preview.component.scss',
})
export class SlidePreviewComponent implements OnChanges, AfterViewInit, OnDestroy {
  private mermaidService = inject(MermaidService);
  private themeService = inject(ThemeService);

  // Get centerContent from the current theme
  centerContent = computed(() => this.themeService.centerContent());

  @ViewChild('slideRenderer') slideRendererEl!: SlideRendererComponent;
  @ViewChild('slideArea') slideAreaEl!: ElementRef<HTMLDivElement>;

  private static readonly SLIDE_W = 960;
  private static readonly SLIDE_H = 600;

  slides = signal<ParsedSlide[]>([]);
  theme = signal('default');
  currentIndex = signal(0);
  slideScale = signal(1);
  autoScaleEnabled = signal(true);
  private resizeObserver?: ResizeObserver;

  @Input() set slidesInput(value: ParsedSlide[]) {
    this.slides.set(value || []);
  }
  @Input() set themeInput(value: string) {
    if (value !== this.theme()) {
      this.theme.set(value);
      this.mermaidService.initializeTheme(value);
    }
  }
  @Input() set selectedIndex(value: number) {
    if (value !== undefined && value !== this.currentIndex()) {
      this.currentIndex.set(value);
    }
  }
  @Input() set autoScale(value: boolean) {
    if (value !== this.autoScaleEnabled()) {
      this.autoScaleEnabled.set(value);
    }
  }

  indexChanged = output<number>();
  navigateToLine = output<number>();
  autoScaleChanged = output<boolean>();

  currentSlide = computed(() => this.slides()[this.currentIndex()] || null);
  currentHtml = computed(() => this.currentSlide()?.html || '');

  ngAfterViewInit() {
    this.calcScale();
    this.resizeObserver = new ResizeObserver(() => this.calcScale());
    this.resizeObserver.observe(this.slideAreaEl.nativeElement);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }

  private calcScale() {
    const el = this.slideAreaEl?.nativeElement;
    if (!el) return;
    const padding = 32;
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
    }
  }

  onSlideClick(event: MouseEvent) {
    // Double-click on slide content → navigate to source line in editor
    let el = event.target as HTMLElement | null;
    const container = (event.currentTarget as HTMLElement);
    while (el && el !== container) {
      const line = el.getAttribute('data-source-line');
      if (line !== null) {
        const slide = this.currentSlide();
        const offset = slide ? slide.lineOffset : 0;
        this.navigateToLine.emit(offset + parseInt(line, 10) + 1);
        return;
      }
      el = el.parentElement;
    }
  }

  toggleAutoScale() {
    const newValue = !this.autoScaleEnabled();
    this.autoScaleEnabled.set(newValue);
    this.autoScaleChanged.emit(newValue);
  }

  async captureScreenshot(): Promise<string> {
    const el = document.querySelector('.slide-frame');
    if (!el) return '';
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(el as HTMLElement, { scale: 1, useCORS: true, backgroundColor: null });
    return canvas.toDataURL('image/png').split(',')[1];
  }

  prev() {
    if (this.currentIndex() > 0) {
      this.currentIndex.update((i) => i - 1);
      this.indexChanged.emit(this.currentIndex());
    }
  }

  next() {
    if (this.currentIndex() < this.slides().length - 1) {
      this.currentIndex.update((i) => i + 1);
      this.indexChanged.emit(this.currentIndex());
    }
  }
}
