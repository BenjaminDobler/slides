import { Component, OnInit, OnDestroy, HostListener, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PresentationService } from '../../core/services/presentation.service';
import { ThemeService } from '../../core/services/theme.service';
import { parsePresentation } from '@slides/markdown-parser';
import type { ParsedSlide } from '@slides/markdown-parser';

declare const mermaid: any;

@Component({
  selector: 'app-presenter',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="presenter" [attr.data-theme]="theme()">
      <div class="slide-scaler" [style.transform]="'scale(' + slideScale() + ')'">
        <div class="slide slide-content" [innerHTML]="currentHtml()"></div>
      </div>
      <div class="slide-counter">{{ currentIndex() + 1 }} / {{ slides().length }}</div>
    </div>
  `,
  styles: [`
    .presenter { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; position: relative; background: #000; overflow: hidden; }
    .slide-scaler { width: 960px; height: 600px; flex-shrink: 0; transform-origin: center center; }
    .slide { width: 960px; height: 600px; padding: 3rem; font-size: 1.5rem; box-sizing: border-box; overflow: hidden; }
    .slide-counter { position: absolute; bottom: 1rem; right: 1.5rem; color: #999; font-size: 0.9rem; z-index: 1; }
  `],
})
export class PresenterComponent implements OnInit, OnDestroy {
  slides = signal<ParsedSlide[]>([]);
  currentIndex = signal(0);
  theme = signal('default');
  slideScale = signal(1);

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
      this.renderMermaid();
    });
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
  }

  private onResize = () => this.calcScale();

  private calcScale() {
    const padding = 64;
    const availW = window.innerWidth - padding;
    const availH = window.innerHeight - padding;
    this.slideScale.set(Math.min(availW / 960, availH / 600));
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
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

  private next() {
    if (this.currentIndex() < this.slides().length - 1) {
      this.currentIndex.update((i) => i + 1);
      setTimeout(() => this.renderMermaid(), 50);
    }
  }

  private prev() {
    if (this.currentIndex() > 0) {
      this.currentIndex.update((i) => i - 1);
      setTimeout(() => this.renderMermaid(), 50);
    }
  }

  private async renderMermaid() {
    if (typeof mermaid === 'undefined') return;
    try {
      await mermaid.run({ querySelector: '.slide .mermaid:not([data-processed])' });
    } catch { /* ignore */ }
  }
}
