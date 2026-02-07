import { Component, OnInit, OnDestroy, AfterViewInit, HostListener, inject, signal, computed, ViewChild, ElementRef, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PresentationService } from '../../core/services/presentation.service';
import { ThemeService } from '../../core/services/theme.service';
import { MermaidService } from '../../core/services/mermaid.service';
import { LayoutRuleService } from '../../core/services/layout-rule.service';
import { parsePresentation } from '@slides/markdown-parser';
import type { ParsedSlide } from '@slides/markdown-parser';

type TransitionType = 'fade' | 'slide' | 'zoom' | 'flip' | 'cube' | 'swap' | 'fall' | 'glitch' | 'none';

@Component({
  selector: 'app-presenter',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './presenter.component.html',
  styleUrl: './presenter.component.scss',
})
export class PresenterComponent implements OnInit, OnDestroy, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private presentationService = inject(PresentationService);
  private themeService = inject(ThemeService);
  private mermaidService = inject(MermaidService);
  private layoutRuleService = inject(LayoutRuleService);
  private destroyRef = inject(DestroyRef);

  @ViewChild('currentSlideEl') currentSlideEl!: ElementRef<HTMLDivElement>;

  private static readonly SLIDE_H = 600;
  private static readonly MIN_CONTENT_SCALE = 0.5;
  private static readonly SCALE_BOTTOM_PADDING = 48;

  slides = signal<ParsedSlide[]>([]);
  currentIndex = signal(0);
  theme = signal('default');
  slideScale = signal(1);
  contentScale = signal(1);
  transition = signal<TransitionType>('fade');
  animating = signal(false);
  incomingClass = signal('');
  outgoingClass = signal('');
  outgoingHtml = signal<SafeHtml>('');
  outgoingScale = signal(1);
  outgoingTransformOrigin = signal('top center');
  private pendingRender = false;

  private animationTimeout: any;

  currentSlide = computed(() => this.slides()[this.currentIndex()] || null);
  currentHtml: () => SafeHtml;

  // Hero layouts use vertical centering, so scale from center; others scale from top
  contentTransformOrigin = computed(() => {
    const layout = this.currentSlide()?.appliedLayout?.toLowerCase() || '';
    return layout.includes('hero') ? 'center center' : 'top center';
  });

  constructor() {
    this.currentHtml = () => {
      const slide = this.currentSlide();
      return slide ? this.sanitizer.bypassSecurityTrustHtml(slide.html) : '';
    };
  }

  ngOnInit() {
    this.calcScale();
    window.addEventListener('resize', this.onResize);
    const id = this.route.snapshot.paramMap.get('id') || '';

    // Load themes and layout rules first, then load presentation
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
          // Apply the theme CSS
          const themeData = this.themeService.themes().find(t => t.name === p.theme);
          if (themeData) {
            this.themeService.applyTheme(themeData);
          }
          const parsed = parsePresentation(p.content, this.layoutRuleService.rules());
          this.slides.set(parsed.slides);
          // Use setTimeout to ensure DOM has updated with new slide data
          setTimeout(() => this.applySlideContent(), 0);
        },
        error: (err) => {
          console.error('Failed to load presentation:', err);
          // Redirect to login if unauthorized
          if (err.status === 401) {
            this.router.navigate(['/login']);
          }
        }
      });
    });
  }

  ngAfterViewInit() {
    // If slides were already loaded before view was ready, render now
    if (this.pendingRender) {
      this.pendingRender = false;
      this.applySlideContent();
    }
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
    clearTimeout(this.animationTimeout);
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

  private navigate(direction: 'forward' | 'back') {
    const t = this.transition();
    if (t === 'none') {
      // No animation
      if (direction === 'forward') this.currentIndex.update((i) => i + 1);
      else this.currentIndex.update((i) => i - 1);
      this.applySlideContent();
      return;
    }

    // Capture outgoing slide content and scale (from DOM, includes rendered mermaid)
    const el = this.currentSlideEl?.nativeElement;
    this.outgoingHtml.set(this.sanitizer.bypassSecurityTrustHtml(el ? el.innerHTML : ''));
    this.outgoingScale.set(this.contentScale());
    this.outgoingTransformOrigin.set(this.contentTransformOrigin());

    // Determine CSS classes
    const dir = direction === 'forward' ? 'left' : 'right';
    if (t === 'fade' || t === 'zoom') {
      this.outgoingClass.set(`${t}-exit`);
      this.incomingClass.set(`${t}-enter`);
    } else {
      this.outgoingClass.set(`${t}-exit-${dir}`);
      this.incomingClass.set(`${t}-enter-${dir}`);
    }

    this.animating.set(true);

    // Change slide index and immediately apply new content
    if (direction === 'forward') this.currentIndex.update((i) => i + 1);
    else this.currentIndex.update((i) => i - 1);

    // Apply new slide content immediately so it animates in with the correct content
    this.applySlideContent();

    const durations: Record<TransitionType, number> = {
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
    const duration = durations[t] || 400;
    this.animationTimeout = setTimeout(() => {
      this.animating.set(false);
      this.incomingClass.set('');
      this.outgoingClass.set('');
    }, duration);
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

  private async applySlideContent() {
    const el = this.currentSlideEl?.nativeElement;
    if (!el) return;
    const slide = this.currentSlide();
    el.innerHTML = slide ? slide.html : '';

    await this.mermaidService.renderDiagrams(el);
    this.calcContentScale();
  }

  private calcContentScale() {
    const el = this.currentSlideEl?.nativeElement;
    if (!el) return;

    const contentHeight = el.scrollHeight;
    const targetHeight = PresenterComponent.SLIDE_H - PresenterComponent.SCALE_BOTTOM_PADDING;

    let newScale = 1;
    if (contentHeight > targetHeight) {
      newScale = Math.max(
        PresenterComponent.MIN_CONTENT_SCALE,
        targetHeight / contentHeight
      );
    }

    this.contentScale.set(newScale);
  }
}
