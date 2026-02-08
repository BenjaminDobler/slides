import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  AfterViewInit,
  AfterViewChecked,
  OnChanges,
  SimpleChanges,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MermaidService } from '../../core/services/mermaid.service';

@Component({
  selector: 'app-slide-renderer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="slide-content">
      <div
        class="slide-content-inner"
        [class.single-card-centered]="isSingleCardCentered()"
        #slideContent
        [style.top]="contentTop()"
        [style.transform]="contentTransform()"
        [style.transform-origin]="transformOrigin()"
        [style.--image-top]="imageTopPosition()"
      ></div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 960px;
      height: 600px;
      overflow: hidden;
    }

    .slide-content {
      width: 960px;
      height: 600px;
      position: relative;
      overflow: hidden;
    }

    .slide-content-inner {
      position: absolute;
      top: 0;
      left: 0;
      width: 960px;
      margin: 0;
      padding: 1.5rem 2.5rem;
      box-sizing: border-box;
      font-size: 1.5rem;
    }

    /* Center content when there's only a single card (like Deckless) */
    .slide-content-inner.single-card-centered {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      text-align: center;
    }
  `],
})
export class SlideRendererComponent implements OnChanges, AfterViewInit, AfterViewChecked {
  private mermaidService = inject(MermaidService);

  private static readonly SLIDE_W = 960;
  private static readonly SLIDE_H = 600;
  private static readonly MIN_CONTENT_SCALE = 0.35; // Allow more scaling like Deckless (they use 0.4)

  @ViewChild('slideContent') slideContentEl!: ElementRef<HTMLDivElement>;

  @Input() html: string = '';
  @Input() set autoScale(value: boolean) {
    this._autoScale.set(value);
  }
  get autoScale(): boolean {
    return this._autoScale();
  }
  @Input() set centerContent(value: boolean) {
    this._centerContent.set(value);
  }
  get centerContent(): boolean {
    return this._centerContent();
  }

  private _autoScale = signal(true);
  private _centerContent = signal(true); // Center content vertically when it fits (no scaling)
  contentScale = signal(1);
  isSingleCardCentered = signal(false);
  private needsMermaidRender = false;
  private needsContentScale = false;
  private viewInitialized = false;

  // Combined transform: scale when needed, optionally center when not scaling
  contentTransform = computed(() => {
    const scale = this.contentScale();
    const autoScale = this._autoScale();
    const centerContent = this._centerContent();

    if (autoScale && scale < 1) {
      return `scale(${scale})`; // Scale from top
    }
    if (centerContent) {
      return 'translateY(-50%)'; // Center vertically when no scaling
    }
    return 'none'; // Top-aligned, no transform
  });

  transformOrigin = computed(() => {
    const autoScale = this._autoScale();
    const centerContent = this._centerContent();

    if (autoScale && this.contentScale() < 1) {
      return 'top center'; // Scale from top-center to keep content horizontally centered
    }
    if (centerContent) {
      return 'center center';
    }
    return 'top left';
  });

  // Position content: centered when no scaling (and centerContent=true), otherwise top-aligned
  contentTop = computed(() => {
    const scale = this.contentScale();
    const autoScale = this._autoScale();
    const centerContent = this._centerContent();

    if (autoScale && scale < 1) {
      return '0'; // Top-aligned when scaling
    }
    if (centerContent) {
      return '50%'; // Centered when no scaling
    }
    return '0'; // Top-aligned
  });

  // Calculate image top position to appear centered in the 600px viewport after scaling
  // Formula: To appear at 300px after scaling with scale S from top origin,
  // original position must be 300/S
  imageTopPosition = computed(() => {
    const scale = this.contentScale();
    const autoScale = this._autoScale();
    if (!autoScale || scale >= 1) return '50%';
    // Calculate position so image appears at 300px (center of 600px slide) after scaling
    const targetPosition = 300; // Center of 600px slide
    const originalPosition = targetPosition / scale;
    return `${originalPosition}px`;
  });

  ngOnChanges(changes: SimpleChanges) {
    if (changes['html']) {
      this.needsMermaidRender = true;
      // If view is already initialized, apply content immediately
      if (this.viewInitialized && this.slideContentEl) {
        this.applyContent();
      }
    }
    if (changes['autoScale'] && this.viewInitialized) {
      // Recalculate scale when autoScale setting changes
      this.calcContentScale();
    }
  }

  ngAfterViewInit() {
    this.viewInitialized = true;
    // Apply initial content now that view is ready
    if (this.html) {
      this.applyContent();
    }
  }

  ngAfterViewChecked() {
    if (this.needsMermaidRender && this.slideContentEl && this.viewInitialized) {
      this.needsMermaidRender = false;
      this.needsContentScale = true;
      this.applyContent();
    }
    if (this.needsContentScale && this.slideContentEl) {
      this.needsContentScale = false;
      this.calcContentScale();
    }
  }

  private async applyContent() {
    const el = this.slideContentEl?.nativeElement;
    if (!el) return;
    el.innerHTML = this.html;
    await this.mermaidService.renderDiagrams(el);

    // Detect single card layout (no images) for centering
    this.detectSingleCardLayout(el);

    // Wait for images to load before calculating scale
    await this.waitForImages(el);
    this.calcContentScale();
  }

  private detectSingleCardLayout(el: HTMLElement) {
    const cardGrid = el.querySelector('.slide-card-grid');
    const cards = cardGrid?.querySelectorAll('.slide-card');
    const hasImage = el.querySelector(':scope > p img') || el.querySelector(':scope > figure');

    // Center if: has card grid, exactly one card, and no image
    const shouldCenter = cardGrid && cards?.length === 1 && !hasImage;
    this.isSingleCardCentered.set(!!shouldCenter);
  }

  private waitForImages(container: HTMLElement): Promise<void> {
    const images = container.querySelectorAll('img');
    if (images.length === 0) return Promise.resolve();

    const promises = Array.from(images).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>(resolve => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    });

    return Promise.all(promises).then(() => {});
  }

  private calcContentScale() {
    if (!this._autoScale()) {
      this.contentScale.set(1);
      return;
    }

    const el = this.slideContentEl?.nativeElement;
    if (!el) {
      this.contentScale.set(1);
      return;
    }

    // Temporarily remove transform to measure true content height
    const currentTransform = el.style.transform;
    el.style.transform = 'none';

    // Use scrollHeight for content measurement (with absolute positioning this is accurate)
    const contentHeight = el.scrollHeight;
    const slideH = SlideRendererComponent.SLIDE_H;

    // Calculate scale needed to fit content
    if (contentHeight > slideH) {
      const scale = slideH / contentHeight;
      const finalScale = Math.max(scale, SlideRendererComponent.MIN_CONTENT_SCALE);
      this.contentScale.set(finalScale);
    } else {
      this.contentScale.set(1);
    }

    // Restore transform (will be updated by Angular binding)
    el.style.transform = currentTransform;
  }

  /** Public method to trigger re-render (useful after theme changes) */
  refresh() {
    this.needsMermaidRender = true;
  }

  /** Get the content element (for capturing innerHTML in transitions) */
  getContentElement(): HTMLDivElement | null {
    return this.slideContentEl?.nativeElement || null;
  }

  /** Get the current content scale */
  getContentScale(): number {
    return this.contentScale();
  }

  /** Get the current transform origin */
  getTransformOrigin(): string | null {
    return this.transformOrigin();
  }
}
