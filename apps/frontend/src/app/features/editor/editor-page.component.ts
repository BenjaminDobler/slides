import { Component, OnInit, ViewChild, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MarkdownEditorComponent } from './components/markdown-editor.component';
import { SlidePreviewComponent } from './components/slide-preview.component';
import { SlideThumbnailsComponent } from './components/slide-thumbnails.component';
import { ThemeSelectorComponent } from './components/theme-selector.component';
import { AiAssistantPanelComponent } from './components/ai-assistant-panel.component';
import { ResizeDividerComponent } from './components/resize-divider.component';
import { PresentationService } from '../../core/services/presentation.service';
import { ThemeService } from '../../core/services/theme.service';
import { parsePresentation } from '@slides/markdown-parser';
import type { ParsedSlide } from '@slides/markdown-parser';
import type { PresentationDto } from '@slides/shared-types';

@Component({
  selector: 'app-editor-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MarkdownEditorComponent,
    SlidePreviewComponent,
    SlideThumbnailsComponent,
    ThemeSelectorComponent,
    AiAssistantPanelComponent,
    ResizeDividerComponent,
  ],
  template: `
    <div class="editor-layout">
      <div class="toolbar">
        <button class="btn-back" (click)="goBack()">&larr; Back</button>
        <input class="title-input" [(ngModel)]="title" (blur)="saveTitle()" placeholder="Presentation Title" />
        <app-theme-selector (themeChanged)="onThemeChanged($event)" />
        <button class="btn-present" (click)="present()">Present</button>
        <button class="btn-ai" (click)="showAi.set(!showAi())">
          {{ showAi() ? 'Hide AI' : 'AI Assistant' }}
        </button>
      </div>
      <div class="main-area" [class.dragging]="isDragging()">
        <div class="pane thumbnails-pane" [style.width.px]="thumbnailWidth()">
          <app-slide-thumbnails
            [slidesInput]="slides()"
            [selectedIndex]="currentSlideIndex()"
            [themeInput]="currentTheme()"
            (slideSelected)="onSlideSelected($event)"
            (mediaInsert)="onMediaInsert($event)"
          />
        </div>
        <app-resize-divider (resized)="onResizeThumbnails($event)" />
        <div class="pane editor-pane" [style.width.px]="editorWidth()">
          <app-markdown-editor
            [initialContent]="content()"
            (contentChange)="onContentChange($event)"
            (cursorSlideChanged)="onCursorSlideChanged($event)"
          />
        </div>
        <app-resize-divider (resized)="onResizeEditor($event)" />
        <div class="pane preview-pane" [style.flex]="showAi() ? 'none' : '1'" [style.width.px]="showAi() ? previewWidth() : null">
          <app-slide-preview
            [slidesInput]="slides()"
            [themeInput]="currentTheme()"
            [selectedIndex]="currentSlideIndex()"
            (indexChanged)="onSlideSelected($event)"
            (navigateToLine)="onNavigateToLine($event)"
          />
        </div>
        @if (showAi()) {
          <app-resize-divider (resized)="onResizePreview($event)" />
          <div class="pane ai-pane">
            <app-ai-assistant-panel
              [currentSlideContentInput]="currentSlideContent()"
              (contentGenerated)="onAiContent($event)"
              (themeGenerated)="onThemeChanged($event)"
              (notesGenerated)="onAiNotes($event)"
              (diagramGenerated)="onAiDiagram($event)"
            />
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .editor-layout { display: flex; flex-direction: column; height: 100vh; background: #1a1a2e; }
    .toolbar { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 1rem; background: #16213e; border-bottom: 1px solid #0f3460; }
    .title-input { flex: 1; padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid #333; background: #0f3460; color: #fff; font-size: 1rem; }
    .btn-back, .btn-present, .btn-ai { padding: 0.4rem 0.8rem; border: none; border-radius: 6px; cursor: pointer; color: #fff; }
    .btn-back { background: #333; }
    .btn-present { background: #2ecc71; }
    .btn-ai { background: #e94560; }
    .main-area { display: flex; flex: 1; overflow: hidden; height: 0; }
    .main-area.dragging { user-select: none; }
    .pane { overflow: hidden; flex-shrink: 0; height: 100%; }
    .thumbnails-pane { }
    .editor-pane { display: flex; flex-direction: column; }
    .editor-pane ::ng-deep app-markdown-editor { flex: 1; min-height: 0; }
    .preview-pane { min-width: 200px; }
    .ai-pane { flex: 1; background: #16213e; border-left: 1px solid #0f3460; overflow-y: auto; min-width: 200px; }
  `],
})
export class EditorPageComponent implements OnInit {
  @ViewChild(MarkdownEditorComponent) editor!: MarkdownEditorComponent;

  presentationId = '';
  title = '';
  content = signal('');
  slides = signal<ParsedSlide[]>([]);
  currentTheme = signal('default');
  currentSlideIndex = signal(0);
  currentSlideContent = signal('');
  showAi = signal(false);
  isDragging = signal(false);

  thumbnailWidth = signal(200);
  editorWidth = signal(0); // calculated on init
  previewWidth = signal(0);

  private autoSaveTimer: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private presentationService: PresentationService,
    private themeService: ThemeService
  ) {}

  ngOnInit() {
    this.themeService.loadThemes();
    this.presentationId = this.route.snapshot.paramMap.get('id') || '';

    // Calculate initial widths based on window size
    const available = window.innerWidth - this.thumbnailWidth() - 15; // 15px for dividers
    this.editorWidth.set(Math.floor(available / 2));
    this.previewWidth.set(Math.floor(available / 2));

    if (this.presentationId) {
      this.presentationService.get(this.presentationId).subscribe((p) => {
        this.title = p.title;
        this.content.set(p.content);
        this.currentTheme.set(p.theme);
        this.updateSlides(p.content);
      });
    }
  }

  onContentChange(markdown: string) {
    this.content.set(markdown);
    this.updateSlides(markdown);
    this.scheduleAutoSave();
  }

  private updateSlides(markdown: string) {
    const parsed = parsePresentation(markdown);
    this.slides.set(parsed.slides);
    this.updateCurrentSlideContent(this.currentSlideIndex());
  }

  onSlideSelected(index: number) {
    this.currentSlideIndex.set(index);
    this.updateCurrentSlideContent(index);
    this.editor.revealSlide(index);
  }

  onCursorSlideChanged(index: number) {
    this.currentSlideIndex.set(index);
    this.updateCurrentSlideContent(index);
  }

  private updateCurrentSlideContent(index: number) {
    const slide = this.slides()[index];
    this.currentSlideContent.set(slide?.content || '');
  }

  // --- Resize handlers ---

  onResizeThumbnails(delta: number) {
    this.isDragging.set(true);
    const newThumb = Math.max(120, this.thumbnailWidth() + delta);
    const diff = newThumb - this.thumbnailWidth();
    this.thumbnailWidth.set(newThumb);
    this.editorWidth.update((w) => Math.max(150, w - diff));
    setTimeout(() => this.isDragging.set(false), 50);
  }

  onResizeEditor(delta: number) {
    this.isDragging.set(true);
    const newEditor = Math.max(150, this.editorWidth() + delta);
    const diff = newEditor - this.editorWidth();
    this.editorWidth.set(newEditor);
    if (this.showAi()) {
      this.previewWidth.update((w) => Math.max(200, w - diff));
    }
    setTimeout(() => this.isDragging.set(false), 50);
  }

  onResizePreview(delta: number) {
    this.isDragging.set(true);
    const newPreview = Math.max(200, this.previewWidth() + delta);
    this.previewWidth.set(newPreview);
    setTimeout(() => this.isDragging.set(false), 50);
  }

  // --- Other ---

  private scheduleAutoSave() {
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      if (this.presentationId) {
        this.presentationService
          .update(this.presentationId, { content: this.content(), theme: this.currentTheme() })
          .subscribe();
      }
    }, 2000);
  }

  saveTitle() {
    if (this.presentationId) {
      this.presentationService.update(this.presentationId, { title: this.title }).subscribe();
    }
  }

  onThemeChanged(themeName: string) {
    this.currentTheme.set(themeName);
    this.scheduleAutoSave();
  }

  onNavigateToLine(line: number) {
    this.editor.revealLine(line);
  }

  onMediaInsert(markdown: string) {
    this.editor.insertAtCursor(markdown);
  }

  onAiContent(content: string) {
    this.editor.setValue(content);
    this.onContentChange(content);
  }

  onAiNotes(event: { slideIndex: number; notes: string }) {
    // Insert speaker notes into the current slide's markdown
    const idx = event.slideIndex === -1 ? this.currentSlideIndex() : event.slideIndex;
    const markdown = this.content();
    const rawSlides = markdown.split('\n---\n');
    if (idx < rawSlides.length) {
      const notesBlock = `\n\n<!-- notes -->\n${event.notes}\n<!-- /notes -->`;
      // Remove existing notes block if present
      rawSlides[idx] = rawSlides[idx].replace(/\n*<!--\s*notes\s*-->[\s\S]*?<!--\s*\/notes\s*-->/i, '');
      rawSlides[idx] = rawSlides[idx].trimEnd() + notesBlock;
      const newContent = rawSlides.join('\n---\n');
      this.editor.setValue(newContent);
      this.onContentChange(newContent);
    }
  }

  onAiDiagram(mermaid: string) {
    const block = '\n```mermaid\n' + mermaid + '\n```\n';
    this.editor.insertAtCursor(block);
  }

  present() {
    this.router.navigate(['/present', this.presentationId]);
  }

  goBack() {
    this.router.navigate(['/presentations']);
  }
}
