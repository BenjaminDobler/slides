import { Component, Input, Output, EventEmitter, signal, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import type { ParsedSlide } from '@slides/markdown-parser';

@Component({
  selector: 'app-slide-thumbnails',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="thumbnails-container">
      <div class="thumbnails-header">Slides</div>
      <div class="thumbnails-list" #thumbList>
        @for (slide of slides(); track $index) {
          <div
            class="thumbnail"
            [class.active]="$index === currentIndex()"
            (click)="selectSlide($index)"
          >
            <div class="thumbnail-number">{{ $index + 1 }}</div>
            <div class="thumbnail-inner">
              <div class="thumbnail-content slide-content" [attr.data-theme]="theme()" [innerHTML]="getHtml(slide)" [style.transform]="'scale(' + thumbScale() + ')'"></div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .thumbnails-container {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: #121a2e;
    }
    .thumbnails-header {
      padding: 0.5rem 0.75rem;
      font-size: 0.8rem;
      color: #a8a8b3;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid #0f3460;
      flex-shrink: 0;
    }
    .thumbnails-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem;
    }
    .thumbnail {
      position: relative;
      margin-bottom: 0.5rem;
      border-radius: 6px;
      border: 2px solid transparent;
      cursor: pointer;
      overflow: hidden;
      background: #fff;
      aspect-ratio: 16 / 10;
    }
    .thumbnail:hover {
      border-color: #0f3460;
    }
    .thumbnail.active {
      border-color: #e94560;
    }
    .thumbnail-number {
      position: absolute;
      top: 4px;
      left: 4px;
      background: rgba(0,0,0,0.6);
      color: #fff;
      font-size: 0.65rem;
      padding: 1px 5px;
      border-radius: 3px;
      z-index: 1;
    }
    .thumbnail-inner {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
    }
    .thumbnail-content {
      width: 960px;
      height: 600px;
      transform-origin: top left;
      pointer-events: none;
      padding: 3rem;
      box-sizing: border-box;
      font-size: 1.5rem;
      overflow: hidden;
    }
  `],
})
export class SlideThumbnailsComponent implements AfterViewInit, OnDestroy {
  @ViewChild('thumbList') thumbListEl!: ElementRef<HTMLDivElement>;
  thumbScale = signal(0.19);
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit() {
    this.calcScale();
    this.resizeObserver = new ResizeObserver(() => this.calcScale());
    this.resizeObserver.observe(this.thumbListEl.nativeElement);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }

  private calcScale() {
    const el = this.thumbListEl?.nativeElement;
    if (!el) return;
    const availW = el.clientWidth - 16; // padding
    this.thumbScale.set(availW / 960);
  }

  @Input() set slidesInput(value: ParsedSlide[]) {
    this.slides.set(value || []);
  }
  @Input() set selectedIndex(value: number) {
    this.currentIndex.set(value);
  }
  @Input() set themeInput(value: string) {
    this.theme.set(value);
  }
  @Output() slideSelected = new EventEmitter<number>();

  slides = signal<ParsedSlide[]>([]);
  currentIndex = signal(0);
  theme = signal('default');

  constructor(private sanitizer: DomSanitizer) {}

  getHtml(slide: ParsedSlide): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(slide.html);
  }

  selectSlide(index: number) {
    this.currentIndex.set(index);
    this.slideSelected.emit(index);
  }
}
