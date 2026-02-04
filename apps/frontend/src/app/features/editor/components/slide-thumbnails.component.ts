import { Component, inject, output, signal, Input, ElementRef, ViewChild, ViewChildren, QueryList, AfterViewInit, AfterViewChecked, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ParsedSlide } from '@slides/markdown-parser';
import { MediaLibraryComponent } from './media-library.component';
import { MermaidService } from '../../../core/services/mermaid.service';

@Component({
  selector: 'app-slide-thumbnails',
  standalone: true,
  imports: [CommonModule, MediaLibraryComponent],
  templateUrl: './slide-thumbnails.component.html',
  styleUrl: './slide-thumbnails.component.scss',
})
export class SlideThumbnailsComponent implements AfterViewInit, AfterViewChecked, OnDestroy {
  private mermaidService = inject(MermaidService);

  @ViewChild('thumbList') thumbListEl!: ElementRef<HTMLDivElement>;
  @ViewChildren('thumbContent') thumbContentEls!: QueryList<ElementRef<HTMLDivElement>>;
  thumbScale = signal(0.19);
  activeTab = signal<'slides' | 'library'>('slides');
  private resizeObserver?: ResizeObserver;
  private needsContentUpdate = false;
  private needsReobserve = false;
  private lastSlidesJson = '';

  ngAfterViewInit() {
    this.observeThumbList();
  }

  ngAfterViewChecked() {
    if (this.needsReobserve && this.thumbListEl?.nativeElement) {
      this.needsReobserve = false;
      this.observeThumbList();
    }
    if (this.needsContentUpdate && this.thumbContentEls) {
      this.needsContentUpdate = false;
      this.applySlideContent();
    }
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
  }

  private async applySlideContent() {
    const slides = this.slides();
    const els = this.thumbContentEls.toArray();

    // Set innerHTML for each thumbnail
    els.forEach((elRef, i) => {
      if (slides[i]) {
        elRef.nativeElement.innerHTML = slides[i].html;
      }
    });

    // Render Mermaid diagrams in all thumbnails
    const container = this.thumbListEl?.nativeElement;
    if (container) {
      await this.mermaidService.renderDiagrams(container);
    }
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
    const newSlides = value || [];
    // Check if content actually changed to avoid unnecessary re-renders
    const newJson = JSON.stringify(newSlides.map(s => s.html));
    if (newJson !== this.lastSlidesJson) {
      this.lastSlidesJson = newJson;
      this.slides.set(newSlides);
      this.needsContentUpdate = true;
    }
  }
  @Input() set selectedIndex(value: number) {
    this.currentIndex.set(value);
  }
  @Input() set themeInput(value: string) {
    if (value !== this.theme()) {
      this.theme.set(value);
      this.mermaidService.initializeTheme(value);
      this.needsContentUpdate = true;
    }
  }

  slideSelected = output<number>();
  slideReordered = output<{ from: number; to: number }>();
  slideDeleted = output<number>();
  slideDuplicated = output<number>();
  slideAdded = output<{ index: number; position: 'above' | 'below' }>();
  mediaInsert = output<string>();

  slides = signal<ParsedSlide[]>([]);
  currentIndex = signal(0);
  theme = signal('default');
  dragIndex = signal<number | null>(null);
  dropIndex = signal<number | null>(null);
  contextMenuVisible = signal(false);
  contextMenuPos = signal({ x: 0, y: 0 });
  private contextMenuIndex = 0;

  switchTab(tab: 'slides' | 'library') {
    this.activeTab.set(tab);
    if (tab === 'slides') {
      this.needsContentUpdate = true;
      this.needsReobserve = true;
    }
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
