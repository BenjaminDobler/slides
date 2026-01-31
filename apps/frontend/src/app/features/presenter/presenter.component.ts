import { Component, OnInit, HostListener, signal, computed } from '@angular/core';
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
      <div class="slide" [innerHTML]="currentHtml()"></div>
      <div class="slide-counter">{{ currentIndex() + 1 }} / {{ slides().length }}</div>
    </div>
  `,
  styles: [`
    .presenter { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; position: relative; background: #fff; }
    .slide { max-width: 80%; max-height: 80%; padding: 3rem; font-size: 1.5rem; }
    .slide-counter { position: absolute; bottom: 1rem; right: 1.5rem; color: #999; font-size: 0.9rem; }
  `],
})
export class PresenterComponent implements OnInit {
  slides = signal<ParsedSlide[]>([]);
  currentIndex = signal(0);
  theme = signal('default');

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
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.themeService.loadThemes();
    this.presentationService.get(id).subscribe((p) => {
      this.theme.set(p.theme);
      const parsed = parsePresentation(p.content);
      this.slides.set(parsed.slides);
      this.renderMermaid();
    });
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
