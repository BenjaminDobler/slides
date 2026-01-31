import { Component, Input, Output, EventEmitter, signal, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
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
              (contextmenu)="onContextMenu($event, $index)"
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
    @if (contextMenuVisible()) {
      <div class="context-menu" [style.top.px]="contextMenuPos().y" [style.left.px]="contextMenuPos().x">
        <button (click)="ctxAddAbove()">Add slide above</button>
        <button (click)="ctxAddBelow()">Add slide below</button>
        <button (click)="ctxDuplicate()">Duplicate</button>
        <div class="ctx-separator"></div>
        <button class="ctx-danger" (click)="ctxDelete()">Delete</button>
      </div>
    }
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .thumbnails-container {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: #090b11;
    }
    .tab-bar {
      display: flex;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      flex-shrink: 0;
    }
    .tab {
      flex: 1;
      padding: 0.5rem;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: #8b8d98;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab:hover { color: #f8f9fa; }
    .tab.active {
      color: #3b82f6;
      border-bottom-color: #3b82f6;
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
      border: 2px solid rgba(255,255,255,0.06);
      cursor: pointer;
      overflow: hidden;
      background: #fff;
      aspect-ratio: 16 / 10;
      transition: border-color 0.15s;
    }
    .thumbnail:hover {
      border-color: rgba(255,255,255,0.2);
    }
    .thumbnail.active {
      border-color: #3b82f6;
    }
    .thumbnail-number {
      position: absolute;
      top: 4px;
      left: 4px;
      background: rgba(0,0,0,0.7);
      color: #f8f9fa;
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
    .thumbnail.drop-above { border-top: 3px solid #3b82f6; }
    .thumbnail.drop-below { border-bottom: 3px solid #3b82f6; }
    .context-menu {
      position: fixed;
      z-index: 1000;
      background: #1c1f26;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 4px;
      min-width: 160px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    .context-menu button {
      display: block;
      width: 100%;
      padding: 6px 12px;
      background: transparent;
      border: none;
      color: #f8f9fa;
      font-size: 0.8rem;
      text-align: left;
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.1s;
    }
    .context-menu button:hover { background: #23262f; }
    .context-menu .ctx-danger { color: #ef4444; }
    .context-menu .ctx-danger:hover { background: rgba(239,68,68,0.15); }
    .ctx-separator { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0; }
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
  @Output() slideDeleted = new EventEmitter<number>();
  @Output() slideDuplicated = new EventEmitter<number>();
  @Output() slideAdded = new EventEmitter<{ index: number; position: 'above' | 'below' }>();
  @Output() mediaInsert = new EventEmitter<string>();

  slides = signal<ParsedSlide[]>([]);
  currentIndex = signal(0);
  theme = signal('default');
  dragIndex = signal<number | null>(null);
  dropIndex = signal<number | null>(null);
  contextMenuVisible = signal(false);
  contextMenuPos = signal({ x: 0, y: 0 });
  private contextMenuIndex = 0;

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

  // --- Context menu ---

  onContextMenu(event: MouseEvent, index: number) {
    event.preventDefault();
    this.contextMenuIndex = index;
    this.contextMenuPos.set({ x: event.clientX, y: event.clientY });
    this.contextMenuVisible.set(true);
    this.selectSlide(index);
  }

  @HostListener('document:click')
  closeContextMenu() {
    this.contextMenuVisible.set(false);
  }

  ctxAddAbove() {
    this.slideAdded.emit({ index: this.contextMenuIndex, position: 'above' });
    this.contextMenuVisible.set(false);
  }

  ctxAddBelow() {
    this.slideAdded.emit({ index: this.contextMenuIndex, position: 'below' });
    this.contextMenuVisible.set(false);
  }

  ctxDuplicate() {
    this.slideDuplicated.emit(this.contextMenuIndex);
    this.contextMenuVisible.set(false);
  }

  ctxDelete() {
    this.slideDeleted.emit(this.contextMenuIndex);
    this.contextMenuVisible.set(false);
  }
}
