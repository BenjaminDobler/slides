import { Component, OnInit, OnDestroy, AfterViewChecked, HostListener, signal, computed, ViewChild, ElementRef } from '@angular/core';
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
  template: `
    <div class="presenter" [attr.data-theme]="theme()">
      <div class="slide-scaler" [style.transform]="'scale(' + slideScale() + ')'">
        <!-- Outgoing slide (behind) -->
        @if (animating()) {
          <div class="slide-layer" [class]="'slide-layer ' + outgoingClass()">
            <div class="slide slide-content" [innerHTML]="outgoingHtml()"></div>
          </div>
        }
        <!-- Current slide -->
        <div class="slide-layer" [class]="'slide-layer ' + incomingClass()">
          <div class="slide slide-content" #currentSlideEl></div>
        </div>
      </div>
      <div class="controls">
        <div class="slide-counter">{{ currentIndex() + 1 }} / {{ slides().length }}</div>
        <div class="transition-picker">
          <select [value]="transition()" (change)="onTransitionChange($event)">
            <option value="fade">Fade</option>
            <option value="slide">Slide</option>
            <option value="zoom">Zoom</option>
            <option value="flip">Flip</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .presenter { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; position: relative; background: #000; overflow: hidden; perspective: 1200px; }
    .slide-scaler { width: 960px; height: 600px; flex-shrink: 0; transform-origin: center center; position: relative; }
    .slide-layer { position: absolute; top: 0; left: 0; width: 960px; height: 600px; }
    .slide { width: 960px; height: 600px; padding: 3rem; font-size: 1.5rem; box-sizing: border-box; overflow: hidden; }
    .controls { position: absolute; bottom: 1rem; right: 1.5rem; display: flex; align-items: center; gap: 1rem; z-index: 10; }
    .slide-counter { color: #8b8d98; font-size: 0.9rem; }
    .transition-picker select { background: rgba(0,0,0,0.5); color: #8b8d98; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 2px 6px; font-size: 0.8rem; cursor: pointer; opacity: 0; transition: opacity 0.3s; }
    .controls:hover .transition-picker select { opacity: 1; }

    /* Fade */
    .fade-enter { animation: fadeIn 0.4s ease forwards; }
    .fade-exit { animation: fadeOut 0.4s ease forwards; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }

    /* Slide left/right */
    .slide-enter-left { animation: slideInLeft 0.4s ease forwards; }
    .slide-exit-left { animation: slideOutLeft 0.4s ease forwards; }
    .slide-enter-right { animation: slideInRight 0.4s ease forwards; }
    .slide-exit-right { animation: slideOutRight 0.4s ease forwards; }
    @keyframes slideInLeft { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @keyframes slideOutLeft { from { transform: translateX(0); } to { transform: translateX(-100%); } }
    @keyframes slideInRight { from { transform: translateX(-100%); } to { transform: translateX(0); } }
    @keyframes slideOutRight { from { transform: translateX(0); } to { transform: translateX(100%); } }

    /* Zoom */
    .zoom-enter { animation: zoomIn 0.4s ease forwards; }
    .zoom-exit { animation: zoomOut 0.4s ease forwards; }
    @keyframes zoomIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
    @keyframes zoomOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(1.2); } }

    /* Flip */
    .flip-enter-left { animation: flipInLeft 0.5s ease forwards; }
    .flip-exit-left { animation: flipOutLeft 0.5s ease forwards; }
    .flip-enter-right { animation: flipInRight 0.5s ease forwards; }
    .flip-exit-right { animation: flipOutRight 0.5s ease forwards; }
    @keyframes flipInLeft { from { transform: rotateY(-90deg); opacity: 0; } to { transform: rotateY(0); opacity: 1; } }
    @keyframes flipOutLeft { from { transform: rotateY(0); opacity: 1; } to { transform: rotateY(90deg); opacity: 0; } }
    @keyframes flipInRight { from { transform: rotateY(90deg); opacity: 0; } to { transform: rotateY(0); opacity: 1; } }
    @keyframes flipOutRight { from { transform: rotateY(0); opacity: 1; } to { transform: rotateY(-90deg); opacity: 0; } }
  `],
})
export class PresenterComponent implements OnInit, OnDestroy, AfterViewChecked {
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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sanitizer: DomSanitizer,
    private presentationService: PresentationService,
    private themeService: ThemeService
  ) {
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
