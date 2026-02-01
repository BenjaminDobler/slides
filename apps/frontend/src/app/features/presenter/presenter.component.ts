import { Component, OnInit, OnDestroy, AfterViewChecked, HostListener, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PresentationService } from '../../core/services/presentation.service';
import { ThemeService } from '../../core/services/theme.service';
import { parsePresentation } from '@slides/markdown-parser';
import type { ParsedSlide } from '@slides/markdown-parser';

declare const mermaid: any;

type TransitionType = 'fade' | 'slide' | 'zoom' | 'flip' | 'none';

@Component({
  selector: 'app-presenter',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './presenter.component.html',
  styleUrl: './presenter.component.scss',
})
export class PresenterComponent implements OnInit, OnDestroy, AfterViewChecked {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private presentationService = inject(PresentationService);
  private themeService = inject(ThemeService);

  @ViewChild('currentSlideEl') currentSlideEl!: ElementRef<HTMLDivElement>;

  slides = signal<ParsedSlide[]>([]);
  currentIndex = signal(0);
  theme = signal('default');
  slideScale = signal(1);
  transition = signal<TransitionType>('fade');
  animating = signal(false);
  incomingClass = signal('');
  outgoingClass = signal('');
  outgoingHtml = signal<SafeHtml>('');
  private needsMermaidRender = false;
  private mermaidRenderedIndex = -1;

  private animationTimeout: any;

  currentSlide = computed(() => this.slides()[this.currentIndex()] || null);
  currentHtml: () => SafeHtml;

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
    this.themeService.loadThemes();
    this.presentationService.get(id).subscribe((p) => {
      this.theme.set(p.theme);
      const parsed = parsePresentation(p.content);
      this.slides.set(parsed.slides);
      this.needsMermaidRender = true;
    });
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
      this.needsMermaidRender = true;
      return;
    }

    // Capture outgoing slide content (from DOM, includes rendered mermaid)
    const el = this.currentSlideEl?.nativeElement;
    this.outgoingHtml.set(this.sanitizer.bypassSecurityTrustHtml(el ? el.innerHTML : ''));

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

    // Change slide
    if (direction === 'forward') this.currentIndex.update((i) => i + 1);
    else this.currentIndex.update((i) => i - 1);

    const duration = t === 'flip' ? 500 : 400;
    this.animationTimeout = setTimeout(() => {
      this.animating.set(false);
      this.incomingClass.set('');
      this.outgoingClass.set('');
      this.needsMermaidRender = true;
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

  ngAfterViewChecked() {
    if (this.needsMermaidRender && this.currentSlideEl) {
      this.needsMermaidRender = false;
      this.applySlideContent();
    }
  }

  private async applySlideContent() {
    const el = this.currentSlideEl?.nativeElement;
    if (!el) return;
    const slide = this.currentSlide();
    el.innerHTML = slide ? slide.html : '';
    this.mermaidRenderedIndex = this.currentIndex();

    if (typeof mermaid === 'undefined') return;
    const diagrams = el.querySelectorAll('.mermaid');
    if (diagrams.length === 0) return;

    diagrams.forEach((node: Element) => {
      if (!node.getAttribute('data-mermaid-src') && node.textContent) {
        node.setAttribute('data-mermaid-src', node.textContent.trim());
      }
    });

    try {
      await mermaid.run({ nodes: Array.from(diagrams) });
    } catch { /* ignore parse errors */ }
  }
}
