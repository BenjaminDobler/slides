import { Component, OnInit, OnDestroy, HostListener, inject, signal, computed, ViewChild, ElementRef, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PresentationService } from '../../core/services/presentation.service';
import { ThemeService } from '../../core/services/theme.service';
import { MermaidService } from '../../core/services/mermaid.service';
import { LayoutRuleService } from '../../core/services/layout-rule.service';
import { WebGLTransitionService, WebGLTransitionType } from '../../core/services/webgl-transition.service';
import { SlideRendererComponent } from '../../shared/components/slide-renderer.component';
import { parsePresentation } from '@slides/markdown-parser';
import type { ParsedSlide } from '@slides/markdown-parser';

type CSSTransitionType = 'fade' | 'slide' | 'zoom' | 'flip' | 'cube' | 'swap' | 'fall' | 'glitch' | 'none';
type TransitionType = CSSTransitionType | 'dissolve' | 'morph' | 'waveGL' | 'pixelate' | 'wipe' | 'noise' | 'circle' | 'debug';

@Component({
  selector: 'app-presenter',
  standalone: true,
  imports: [CommonModule, SlideRendererComponent],
  templateUrl: './presenter.component.html',
  styleUrl: './presenter.component.scss',
})
export class PresenterComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private presentationService = inject(PresentationService);
  private themeService = inject(ThemeService);
  private mermaidService = inject(MermaidService);
  private layoutRuleService = inject(LayoutRuleService);
  private webglTransition = inject(WebGLTransitionService);
  private destroyRef = inject(DestroyRef);

  @ViewChild('slideLayer') slideLayerEl!: ElementRef<HTMLDivElement>;
  @ViewChild('slideRenderer') slideRenderer!: SlideRendererComponent;

  slides = signal<ParsedSlide[]>([]);
  currentIndex = signal(0);
  theme = signal('default');
  private presentationId = '';
  slideScale = signal(1);
  transition = signal<TransitionType>('fade');
  animating = signal(false);
  incomingClass = signal('');
  outgoingClass = signal('');
  outgoingHtml = signal<SafeHtml>('');
  outgoingScale = signal(1);
  outgoingTransformOrigin = signal('top center');

  // Zoom state - using translate + scale for smooth zooming to any point
  private readonly ZOOM_SCALES = [1, 1.5, 2.5, 4];
  private readonly CLICK_DELAY = 250; // ms to wait to distinguish click from double-click
  private clickTimeout: any = null;
  zoomLevel = signal(0); // Index into ZOOM_SCALES
  panX = signal(0); // Translation X in pixels
  panY = signal(0); // Translation Y in pixels

  // Drag state for panning
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;
  private hasDragged = false; // Track if actual dragging occurred (to distinguish from click)

  zoomScale = computed(() => this.ZOOM_SCALES[this.zoomLevel()]);
  zoomTransform = computed(() => {
    const scale = this.zoomScale();
    const x = this.panX();
    const y = this.panY();
    if (scale === 1 && x === 0 && y === 0) return 'none';
    return `translate(${x}px, ${y}px) scale(${scale})`;
  });
  isZoomed = computed(() => this.zoomLevel() > 0);
  isDraggingSignal = signal(false);

  // Get centerContent from the current theme
  centerContent = computed(() => this.themeService.centerContent());

  private animationTimeout: any;

  currentSlide = computed(() => this.slides()[this.currentIndex()] || null);

  ngOnInit() {
    this.calcScale();
    window.addEventListener('resize', this.onResize);
    this.presentationId = this.route.snapshot.paramMap.get('id') || '';

    Promise.all([
      this.themeService.loadThemes(),
      this.layoutRuleService.loadRules(),
    ]).then(() => {
      this.presentationService.get(this.presentationId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
        next: (p) => {
          this.theme.set(p.theme);
          this.mermaidService.initializeTheme(p.theme);
          const themeData = this.themeService.themes().find(t => t.name === p.theme);
          if (themeData) {
            this.themeService.applyTheme(themeData);
          }
          const parsed = parsePresentation(p.content, this.layoutRuleService.rules());
          this.slides.set(parsed.slides);

          // Start from specified slide if provided in query params
          const slideParam = this.route.snapshot.queryParamMap.get('slide');
          if (slideParam) {
            const slideIndex = parseInt(slideParam, 10);
            if (!isNaN(slideIndex) && slideIndex >= 0 && slideIndex < parsed.slides.length) {
              this.currentIndex.set(slideIndex);
            }
          }
        },
        error: (err) => {
          console.error('Failed to load presentation:', err);
          if (err.status === 401) {
            this.router.navigate(['/login']);
          }
        }
      });
    });
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
    clearTimeout(this.animationTimeout);
    this.webglTransition.cleanup();
  }

  private onResize = () => this.calcScale();

  private calcScale() {
    const padding = 64;
    const availW = window.innerWidth - padding;
    const availH = window.innerHeight - padding;
    this.slideScale.set(Math.min(availW / 960, availH / 600));
  }

  onTransitionChange(event: Event) {
    this.transition.set((event.target as HTMLSelectElement).value as TransitionType);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (this.animating()) return;

    // If zoomed, Escape resets zoom instead of exiting
    if (event.key === 'Escape') {
      if (this.isZoomed()) {
        this.resetZoom();
      } else {
        this.router.navigate(['/editor', this.presentationId]);
      }
      return;
    }

    // Don't allow navigation while zoomed
    if (this.isZoomed()) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case ' ':
        this.next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        this.prev();
        break;
    }
  }

  private isWebGLTransition(t: TransitionType): boolean {
    return ['dissolve', 'morph', 'waveGL', 'pixelate', 'wipe', 'noise', 'circle'].includes(t);
  }

  private getWebGLType(t: TransitionType): WebGLTransitionType {
    switch (t) {
      case 'dissolve': return 'disintegrate';
      case 'morph': return 'morph';
      case 'waveGL': return 'wave';
      case 'pixelate': return 'pixelate';
      case 'wipe': return 'directionalWipe';
      case 'noise': return 'noise';
      case 'circle': return 'circle';
      default: return 'disintegrate';
    }
  }

  private async navigateWithDebug(direction: 'forward' | 'back') {
    const slideLayer = this.slideLayerEl?.nativeElement;
    const slideEl = slideLayer?.querySelector('.slide') as HTMLElement;
    if (!slideLayer || !slideEl) return;

    this.animating.set(true);

    let imgSrc: string;
    try {
      const { toPng } = await import('html-to-image');
      imgSrc = await toPng(slideEl, {
        width: 960,
        height: 600,
        pixelRatio: 1,
      });
    } catch (e) {
      console.warn('html-to-image failed, falling back to html2canvas', e);
      const { default: html2canvas } = await import('html2canvas');
      const sourceCanvas = await html2canvas(slideEl, {
        scale: 1,
        useCORS: true,
        backgroundColor: null,
      });
      imgSrc = sourceCanvas.toDataURL();
    }

    const debugImg = document.createElement('img');
    debugImg.src = imgSrc;
    debugImg.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 960px;
      height: 600px;
      z-index: 200;
      pointer-events: none;
      border: 3px solid red;
      box-sizing: border-box;
    `;
    slideLayer.appendChild(debugImg);

    const label = document.createElement('div');
    label.textContent = 'DEBUG: html-to-image capture (5 sec)';
    label.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 201;
      background: red;
      color: white;
      padding: 5px 10px;
      font-size: 14px;
      font-weight: bold;
    `;
    slideLayer.appendChild(label);

    await new Promise(resolve => setTimeout(resolve, 5000));

    debugImg.remove();
    label.remove();

    // Change slide - slide-renderer updates automatically
    if (direction === 'forward') this.currentIndex.update((i) => i + 1);
    else this.currentIndex.update((i) => i - 1);

    this.animating.set(false);
  }

  private async navigate(direction: 'forward' | 'back') {
    // Reset zoom before navigating
    this.resetZoom();

    const t = this.transition();
    if (t === 'none') {
      // No animation - slide-renderer updates automatically via input binding
      if (direction === 'forward') this.currentIndex.update((i) => i + 1);
      else this.currentIndex.update((i) => i - 1);
      return;
    }

    if (t === 'debug') {
      await this.navigateWithDebug(direction);
      return;
    }

    if (this.isWebGLTransition(t)) {
      await this.navigateWithWebGL(direction, t);
      return;
    }

    const el = this.slideRenderer?.getContentElement();
    this.outgoingHtml.set(this.sanitizer.bypassSecurityTrustHtml(el ? el.innerHTML : ''));
    this.outgoingScale.set(this.slideRenderer?.getContentScale() ?? 1);
    this.outgoingTransformOrigin.set(this.slideRenderer?.getTransformOrigin() ?? 'top center');

    const dir = direction === 'forward' ? 'left' : 'right';
    if (t === 'fade' || t === 'zoom') {
      this.outgoingClass.set(`${t}-exit`);
      this.incomingClass.set(`${t}-enter`);
    } else {
      this.outgoingClass.set(`${t}-exit-${dir}`);
      this.incomingClass.set(`${t}-enter-${dir}`);
    }

    this.animating.set(true);

    // Change slide index - slide-renderer updates automatically via input binding
    if (direction === 'forward') this.currentIndex.update((i) => i + 1);
    else this.currentIndex.update((i) => i - 1);

    const durations: Record<CSSTransitionType, number> = {
      fade: 400,
      slide: 400,
      zoom: 400,
      flip: 600,
      cube: 800,
      swap: 600,
      fall: 700,
      glitch: 500,
      none: 0
    };
    const duration = durations[t as CSSTransitionType] || 400;
    this.animationTimeout = setTimeout(() => {
      this.animating.set(false);
      this.incomingClass.set('');
      this.outgoingClass.set('');
    }, duration);
  }

  private async navigateWithWebGL(direction: 'forward' | 'back', transition: TransitionType) {
    const slideLayer = this.slideLayerEl?.nativeElement;
    const slideEl = slideLayer?.querySelector('.slide') as HTMLElement;
    const presenter = slideLayer?.closest('.presenter') as HTMLElement;
    if (!slideLayer || !slideEl || !presenter) return;

    this.animating.set(true);

    const nextIndex = direction === 'forward'
      ? this.currentIndex() + 1
      : this.currentIndex() - 1;
    const nextSlide = this.slides()[nextIndex];
    if (!nextSlide) {
      this.animating.set(false);
      return;
    }

    const tempSlide = slideEl.cloneNode(true) as HTMLElement;
    const tempInner = tempSlide.querySelector('.slide-content-inner') as HTMLElement;
    if (tempInner) {
      tempInner.innerHTML = nextSlide.html;
    }

    tempSlide.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 960px;
      height: 600px;
      z-index: -1;
    `;

    slideEl.parentElement?.appendChild(tempSlide);

    if (tempInner) {
      await this.mermaidService.renderDiagrams(tempInner);
    }

    await new Promise(resolve => setTimeout(resolve, 50));

    const webglType = this.getWebGLType(transition);
    await this.webglTransition.initTransition(slideLayer, slideEl, tempSlide, webglType);

    tempSlide.remove();

    await this.webglTransition.animate(1200);

    // Update to the new slide - slide-renderer updates automatically
    this.currentIndex.set(nextIndex);

    this.animating.set(false);
  }

  private next() {
    if (this.currentIndex() < this.slides().length - 1) {
      this.navigate('forward');
    }
  }

  private prev() {
    if (this.currentIndex() > 0) {
      this.navigate('back');
    }
  }

  // Zoom handlers
  onSlideDoubleClick(event: MouseEvent) {
    if (this.animating()) return;

    // Prevent text selection on double-click
    event.preventDefault();

    // Cancel any pending single-click action
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }

    const currentLevel = this.zoomLevel();
    if (currentLevel >= this.ZOOM_SCALES.length - 1) return; // Already at max zoom

    const slideEl = event.currentTarget as HTMLElement;
    const rect = slideEl.getBoundingClientRect();

    // Click position as proportion of visual element (0-1)
    const clickPropX = (event.clientX - rect.left) / rect.width;
    const clickPropY = (event.clientY - rect.top) / rect.height;

    // Convert to slide coordinates (0-960, 0-600)
    const currentScale = this.zoomScale();
    // The visual width = 960 * currentScale, so slide coord = proportion * 960 * currentScale / currentScale = proportion * 960
    // But we also need to account for current pan offset
    const currentPanX = this.panX();
    const currentPanY = this.panY();

    // Visual element shows slide from (-panX/currentScale) to (-panX/currentScale + 960)
    // Click at proportion P shows slide coordinate: -panX/currentScale + P * (960)
    // Wait, that's not right either...

    // Let's think step by step:
    // The slide is 960x600. With transform translate(panX, panY) scale(scale):
    // - Slide point (0,0) appears at visual position (panX, panY) relative to element origin
    // - Slide point (sx, sy) appears at (panX + sx*scale, panY + sy*scale)
    // The bounding rect has width = 960*scale (the scaled slide size)
    // So clickX relative to rect.left = panX + slideX*scale (if the element origin equals rect.left when no transform)
    // Therefore: slideX = (clickX - panX) / scale where clickX = event.clientX - rect.left + offset...

    // Actually the rect.left IS the visual left edge of the transformed content.
    // With transform-origin: 0 0, the (0,0) of the slide maps to (panX, panY) relative to where the element would be without transform.
    // The rect reflects where the content actually appears.

    // Get the slide-layer's position (parent of zoom-container)
    const slideLayer = slideEl.parentElement;
    if (!slideLayer) return;
    const layerRect = slideLayer.getBoundingClientRect();

    // Click position relative to slide-layer in screen pixels
    const screenX = event.clientX - layerRect.left;
    const screenY = event.clientY - layerRect.top;

    // Convert to internal coordinates (960x600 space) by dividing by slideScale
    const scale = this.slideScale();
    const internalX = screenX / scale;
    const internalY = screenY / scale;

    // With current zoom transform, what slide point is at this internal position?
    // internalPos = panX + slideX * zoomScale
    // slideX = (internalPos - panX) / zoomScale
    const slideX = (internalX - currentPanX) / currentScale;
    const slideY = (internalY - currentPanY) / currentScale;

    // New zoom scale
    const newLevel = currentLevel + 1;
    const newScale = this.ZOOM_SCALES[newLevel];

    // Calculate new pan so slide point stays at same internal position
    // internalX = newPanX + slideX * newScale
    const newPanX = internalX - slideX * newScale;
    const newPanY = internalY - slideY * newScale;

    // Apply new transform
    this.panX.set(newPanX);
    this.panY.set(newPanY);
    this.zoomLevel.set(newLevel);
  }

  onSlideClick(event: MouseEvent) {
    if (this.animating()) return;

    // Don't zoom out if we were dragging
    if (this.hasDragged) {
      this.hasDragged = false;
      return;
    }

    // Only handle click to zoom out when already zoomed
    if (this.isZoomed()) {
      event.stopPropagation();

      // Delay the zoom-out to see if this is part of a double-click
      if (this.clickTimeout) {
        clearTimeout(this.clickTimeout);
      }
      this.clickTimeout = setTimeout(() => {
        this.clickTimeout = null;
        // Reset zoom completely with one click
        this.resetZoom();
      }, this.CLICK_DELAY);
    }
  }

  // Drag handlers for panning when zoomed
  onSlideMouseDown(event: MouseEvent) {
    if (!this.isZoomed() || this.animating()) return;

    this.isDragging = true;
    this.isDraggingSignal.set(true);
    this.hasDragged = false;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.panStartX = this.panX();
    this.panStartY = this.panY();

    event.preventDefault(); // Prevent text selection while dragging
  }

  onSlideMouseMove(event: MouseEvent) {
    if (!this.isDragging) return;

    const deltaX = event.clientX - this.dragStartX;
    const deltaY = event.clientY - this.dragStartY;

    // Consider it a drag if moved more than 5 pixels
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      this.hasDragged = true;
    }

    // Convert screen delta to internal coordinates
    const scale = this.slideScale();
    const internalDeltaX = deltaX / scale;
    const internalDeltaY = deltaY / scale;

    // Calculate new pan with bounds checking
    const zoomScale = this.zoomScale();
    const newPanX = this.clampPan(this.panStartX + internalDeltaX, 960, zoomScale);
    const newPanY = this.clampPan(this.panStartY + internalDeltaY, 600, zoomScale);

    this.panX.set(newPanX);
    this.panY.set(newPanY);
  }

  onSlideMouseUp() {
    this.isDragging = false;
    this.isDraggingSignal.set(false);
  }

  onSlideMouseLeave() {
    this.isDragging = false;
    this.isDraggingSignal.set(false);
  }

  private clampPan(pan: number, size: number, zoomScale: number): number {
    // The slide content ranges from 0 to size (960 or 600)
    // After zoom, the visible area is size/zoomScale
    // Pan should keep the visible area within bounds

    // Maximum pan (showing the left/top edge of content)
    const maxPan = 0;
    // Minimum pan (showing the right/bottom edge of content)
    const minPan = size - size * zoomScale;

    return Math.max(minPan, Math.min(maxPan, pan));
  }

  private resetZoom() {
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = null;
    }
    this.isDragging = false;
    this.hasDragged = false;
    this.zoomLevel.set(0);
    this.panX.set(0);
    this.panY.set(0);
  }
}
