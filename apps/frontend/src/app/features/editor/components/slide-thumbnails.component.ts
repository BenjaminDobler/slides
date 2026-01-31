import { Component, Input, Output, EventEmitter, signal, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import type { ParsedSlide } from '@slides/markdown-parser';
import { MediaLibraryComponent } from './media-library.component';

@Component({
  selector: 'app-slide-thumbnails',
  standalone: true,
  imports: [CommonModule, MediaLibraryComponent],
  template: `
    <div class="thumbnails-container">
      <div class="tab-bar">
        <button class="tab" [class.active]="activeTab() === 'slides'" (click)="activeTab.set('slides')">Slides</button>
        <button class="tab" [class.active]="activeTab() === 'library'" (click)="activeTab.set('library')">Library</button>
      </div>
      @if (activeTab() === 'slides') {
        <div class="thumbnails-list" #thumbList>
          @for (slide of slides(); track $index) {
            <div
              class="thumbnail"
              [class.active]="$index === currentIndex()"
              [class.dragging]="dragIndex() === $index"
              [class.drop-above]="dropIndex() === $index && dragIndex() !== null && dragIndex()! > $index"
              [class.drop-below]="dropIndex() === $index && dragIndex() !== null && dragIndex()! < $index"
              draggable="true"
              (click)="selectSlide($index)"
              (dragstart)="onDragStart($event, $index)"
              (dragover)="onDragOver($event, $index)"
              (dragleave)="onDragLeave()"
              (drop)="onDrop($event, $index)"
              (dragend)="onDragEnd()"
            >
              <div class="thumbnail-number">{{ $index + 1 }}</div>
              <div class="thumbnail-inner">
                <div class="thumbnail-content slide-content" [attr.data-theme]="theme()" [innerHTML]="getHtml(slide)" [style.transform]="'scale(' + thumbScale() + ')'"></div>
              </div>
            </div>
          }
        </div>
      } @else {
        <app-media-library (mediaInsert)="onMediaInsert($event)" />
      }
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
    .tab-bar {
      display: flex;
      border-bottom: 1px solid #0f3460;
      flex-shrink: 0;
    }
    .tab {
      flex: 1;
      padding: 0.5rem;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: #a8a8b3;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab:hover { color: #fff; }
    .tab.active {
      color: #e94560;
      border-bottom-color: #e94560;
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
    .thumbnail.dragging { opacity: 0.4; }
    .thumbnail.drop-above { border-top: 3px solid #e94560; }
    .thumbnail.drop-below { border-bottom: 3px solid #e94560; }
  `],
})
export class SlideThumbnailsComponent implements AfterViewInit, OnDestroy {
  @ViewChild('thumbList') thumbListEl!: ElementRef<HTMLDivElement>;
  thumbScale = signal(0.19);
  activeTab = signal<'slides' | 'library'>('slides');
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit() {
    this.observeThumbList();
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }

  private observeThumbList() {
    if (!this.thumbListEl?.nativeElement) return;
    this.calcScale();
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.calcScale());
    this.resizeObserver.observe(this.thumbListEl.nativeElement);
  }

  private calcScale() {
    const el = this.thumbListEl?.nativeElement;
    if (!el) return;
    const availW = el.clientWidth - 16;
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
  @Output() slideReordered = new EventEmitter<{ from: number; to: number }>();
  @Output() mediaInsert = new EventEmitter<string>();

  slides = signal<ParsedSlide[]>([]);
  currentIndex = signal(0);
  theme = signal('default');
  dragIndex = signal<number | null>(null);
  dropIndex = signal<number | null>(null);

  constructor(private sanitizer: DomSanitizer) {}

  getHtml(slide: ParsedSlide): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(slide.html);
  }

  selectSlide(index: number) {
    this.currentIndex.set(index);
    this.slideSelected.emit(index);
  }

  onMediaInsert(markdown: string) {
    this.mediaInsert.emit(markdown);
  }

  // --- Drag-and-drop reorder ---

  onDragStart(event: DragEvent, index: number) {
    this.dragIndex.set(index);
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', String(index));
  }

  onDragOver(event: DragEvent, index: number) {
    if (this.dragIndex() === null || this.dragIndex() === index) {
      this.dropIndex.set(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    this.dropIndex.set(index);
  }

  onDragLeave() {
    this.dropIndex.set(null);
  }

  onDrop(event: DragEvent, toIndex: number) {
    event.preventDefault();
    const fromIndex = this.dragIndex();
    if (fromIndex !== null && fromIndex !== toIndex) {
      this.slideReordered.emit({ from: fromIndex, to: toIndex });
    }
    this.dragIndex.set(null);
    this.dropIndex.set(null);
  }

  onDragEnd() {
    this.dragIndex.set(null);
    this.dropIndex.set(null);
  }
}
