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
import { ExportService } from '../../core/services/export.service';
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
        <button class="btn-export" (click)="exportPdf()" [disabled]="exporting()">
          {{ exporting() ? exportProgress() : 'PDF' }}
        </button>
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
            (slideReordered)="onSlideReordered($event)"
            (slideDeleted)="onSlideDeleted($event)"
            (slideDuplicated)="onSlideDuplicated($event)"
            (slideAdded)="onSlideAdded($event)"
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
              [screenshotProvider]="captureSlideScreenshot"
              (contentGenerated)="onAiContent($event)"
              (slideContentGenerated)="onAiSlideContent($event)"
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
    .editor-layout { display: flex; flex-direction: column; height: 100vh; background: #090b11; }
    .toolbar { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 1rem; background: #111318; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .title-input { flex: 1; padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: #1c1f26; color: #f8f9fa; font-size: 1rem; transition: border-color 0.15s; }
    .title-input:focus { outline: none; border-color: #3b82f6; }
    .btn-back, .btn-present, .btn-ai, .btn-export { padding: 0.4rem 0.8rem; border: none; border-radius: 6px; cursor: pointer; color: #f8f9fa; font-size: 0.85rem; transition: background 0.15s; }
    .btn-export { background: #1c1f26; }
    .btn-export:hover { background: #23262f; }
    .btn-export:disabled { opacity: 0.5; cursor: default; }
    .btn-back { background: #1c1f26; }
    .btn-back:hover { background: #23262f; }
    .btn-present { background: #22c55e; }
    .btn-present:hover { background: #16a34a; }
    .btn-ai { background: #3b82f6; }
    .btn-ai:hover { background: #2563eb; }
    .main-area { display: flex; flex: 1; overflow: hidden; height: 0; }
    .main-area.dragging { user-select: none; }
    .pane { overflow: hidden; flex-shrink: 0; height: 100%; }
    .thumbnails-pane { }
    .editor-pane { display: flex; flex-direction: column; }
    .editor-pane ::ng-deep app-markdown-editor { flex: 1; min-height: 0; }
    .preview-pane { min-width: 200px; }
    .ai-pane { flex: 1; background: #111318; border-left: 1px solid rgba(255,255,255,0.08); overflow-y: auto; min-width: 200px; }
  `],
})
export class EditorPageComponent implements OnInit {
  @ViewChild(MarkdownEditorComponent) editor!: MarkdownEditorComponent;
  @ViewChild(SlidePreviewComponent) slidePreview!: SlidePreviewComponent;

  presentationId = '';
  title = '';
  content = signal('');
  slides = signal<ParsedSlide[]>([]);
  currentTheme = signal('default');
  currentSlideIndex = signal(0);
  currentSlideContent = signal('');
  showAi = signal(false);
  isDragging = signal(false);
  exporting = signal(false);
  exportProgress = signal('');

  thumbnailWidth = signal(200);
  editorWidth = signal(0); // calculated on init
  previewWidth = signal(0);

  private autoSaveTimer: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private presentationService: PresentationService,
    private themeService: ThemeService,
    private exportService: ExportService
  ) {}

  async ngOnInit() {
    this.presentationId = this.route.snapshot.paramMap.get('id') || '';

    // Calculate initial widths based on window size
    const available = window.innerWidth - this.thumbnailWidth() - 15; // 15px for dividers
    this.editorWidth.set(Math.floor(available / 2));
    this.previewWidth.set(Math.floor(available / 2));

    await this.themeService.loadThemes();

    if (this.presentationId) {
      this.presentationService.get(this.presentationId).subscribe((p) => {
        this.title = p.title;
        this.content.set(p.content);
        this.currentTheme.set(p.theme);
        // Apply the saved theme's CSS
        const theme = this.themeService.themes().find((t) => t.name === p.theme);
        if (theme) this.themeService.applyTheme(theme);
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

  onSlideReordered(event: { from: number; to: number }) {
    const markdown = this.content();
    const rawSlides = markdown.split('\n---\n');
    if (event.from < 0 || event.from >= rawSlides.length || event.to < 0 || event.to >= rawSlides.length) return;

    const [moved] = rawSlides.splice(event.from, 1);
    rawSlides.splice(event.to, 0, moved);

    const newContent = rawSlides.join('\n---\n');
    this.editor.replaceAll(newContent);
    this.onContentChange(newContent);
    this.currentSlideIndex.set(event.to);
    this.updateCurrentSlideContent(event.to);
  }

  onSlideDeleted(index: number) {
    const rawSlides = this.content().split('\n---\n');
    if (rawSlides.length <= 1) return; // don't delete the last slide
    rawSlides.splice(index, 1);
    const newContent = rawSlides.join('\n---\n');
    this.editor.replaceAll(newContent);
    this.onContentChange(newContent);
    const newIndex = Math.min(index, rawSlides.length - 1);
    this.currentSlideIndex.set(newIndex);
    this.updateCurrentSlideContent(newIndex);
  }

  onSlideDuplicated(index: number) {
    const rawSlides = this.content().split('\n---\n');
    if (index < 0 || index >= rawSlides.length) return;
    rawSlides.splice(index + 1, 0, rawSlides[index]);
    const newContent = rawSlides.join('\n---\n');
    this.editor.replaceAll(newContent);
    this.onContentChange(newContent);
    this.currentSlideIndex.set(index + 1);
    this.updateCurrentSlideContent(index + 1);
  }

  onSlideAdded(event: { index: number; position: 'above' | 'below' }) {
    const rawSlides = this.content().split('\n---\n');
    const insertAt = event.position === 'above' ? event.index : event.index + 1;
    rawSlides.splice(insertAt, 0, '\n# New Slide\n');
    const newContent = rawSlides.join('\n---\n');
    this.editor.replaceAll(newContent);
    this.onContentChange(newContent);
    this.currentSlideIndex.set(insertAt);
    this.updateCurrentSlideContent(insertAt);
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
    this.editor.replaceAll(content);
    this.onContentChange(content);
  }

  onAiSlideContent(slideMarkdown: string) {
    // Replace only the current slide, preserving the rest of the presentation
    const markdown = this.content();
    const rawSlides = markdown.split('\n---\n');
    const idx = this.currentSlideIndex();
    if (idx < rawSlides.length) {
      rawSlides[idx] = '\n' + slideMarkdown.trim() + '\n';
      const newContent = rawSlides.join('\n---\n');
      this.editor.replaceAll(newContent);
      this.onContentChange(newContent);
    }
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
      this.editor.replaceAll(newContent);
      this.onContentChange(newContent);
    }
  }

  captureSlideScreenshot = (): Promise<string> => {
    return this.slidePreview.captureScreenshot();
  };

  onAiDiagram(mermaid: string) {
    const block = '\n```mermaid\n' + mermaid + '\n```\n';
    this.editor.insertAtCursor(block);
  }

  async exportPdf() {
    this.exporting.set(true);
    this.exportProgress.set('Exporting...');
    try {
      await this.exportService.exportToPdf(
        this.slides(),
        this.currentTheme(),
        this.title || 'presentation',
        (current, total) => this.exportProgress.set(`${current + 1}/${total}`)
      );
    } catch {
      // export failed silently
    } finally {
      this.exporting.set(false);
    }
  }

  present() {
    this.router.navigate(['/present', this.presentationId]);
  }

  goBack() {
    this.router.navigate(['/presentations']);
  }
}
