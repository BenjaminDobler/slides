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
  slideScale = signal(1);
  transition = signal<TransitionType>('fade');
  animating = signal(false);
  incomingClass = signal('');
  outgoingClass = signal('');
  outgoingHtml = signal<SafeHtml>('');
  outgoingScale = signal(1);
  outgoingTransformOrigin = signal('top center');

  private animationTimeout: any;

  currentSlide = computed(() => this.slides()[this.currentIndex()] || null);

  ngOnInit() {
    this.calcScale();
    window.addEventListener('resize', this.onResize);
    const id = this.route.snapshot.paramMap.get('id') || '';

    Promise.all([
      this.themeService.loadThemes(),
      this.layoutRuleService.loadRules(),
    ]).then(() => {
      this.presentationService.get(id)
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
      case 'Escape':
        this.router.navigate(['/presentations']);
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
}
