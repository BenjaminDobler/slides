import { Component, DestroyRef, HostListener, OnInit, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MarkdownEditorComponent } from './components/markdown-editor.component';
import { SlidePreviewComponent } from './components/slide-preview.component';
import { SlideThumbnailsComponent } from './components/slide-thumbnails.component';
import { ThemeSelectorComponent } from './components/theme-selector.component';
import { AiAssistantPanelComponent } from './components/ai-assistant-panel.component';
import { ResizeDividerComponent } from './components/resize-divider.component';
import { LayoutRulesEditorComponent } from './components/layout-rules-editor.component';
import { PresentationService } from '../../core/services/presentation.service';
import { ThemeService } from '../../core/services/theme.service';
import { ExportService } from '../../core/services/export.service';
import { LayoutRuleService } from '../../core/services/layout-rule.service';
import { parsePresentation } from '@slides/markdown-parser';
import type { ParsedSlide } from '@slides/markdown-parser';

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
    LayoutRulesEditorComponent,
  ],
  templateUrl: './editor-page.component.html',
  styleUrl: './editor-page.component.scss',
})
export class EditorPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private presentationService = inject(PresentationService);
  private themeService = inject(ThemeService);
  private exportService = inject(ExportService);
  private layoutRuleService = inject(LayoutRuleService);
  private destroyRef = inject(DestroyRef);

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
  showLayoutRules = signal(false);
  isDragging = signal(false);
  exporting = signal(false);
  exportProgress = signal('');
  autoScaleEnabled = signal(true);

  thumbnailWidth = signal(200);
  editorWidth = signal(0); // calculated on init
  previewWidth = signal(0);

  private autoSaveTimer: any;

  async ngOnInit() {
    this.presentationId = this.route.snapshot.paramMap.get('id') || '';

    // Calculate initial widths based on window size
    const available = window.innerWidth - this.thumbnailWidth() - 15; // 15px for dividers
    this.editorWidth.set(Math.floor(available / 2));
    this.previewWidth.set(Math.floor(available / 2));

    await Promise.all([
      this.themeService.loadThemes(),
      this.layoutRuleService.loadRules(),
    ]);

    if (this.presentationId) {
      this.presentationService.get(this.presentationId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((p) => {
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
    const parsed = parsePresentation(markdown, this.layoutRuleService.rules());
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
  }

  onResizeEditor(delta: number) {
    this.isDragging.set(true);
    const newEditor = Math.max(150, this.editorWidth() + delta);
    const diff = newEditor - this.editorWidth();
    this.editorWidth.set(newEditor);
    this.previewWidth.update((w) => Math.max(200, w - diff));
  }

  onResizePreview(delta: number) {
    this.isDragging.set(true);
    const newPreview = Math.max(200, this.previewWidth() + delta);
    this.previewWidth.set(newPreview);
  }

  @HostListener('document:mouseup')
  onResizeEnd() {
    if (this.isDragging()) {
      this.isDragging.set(false);
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    // Recalculate pane widths to fit the new window size
    const dividers = 15; // approximate width for dividers
    const aiPaneWidth = this.showAi() ? 320 : 0;
    const available = window.innerWidth - this.thumbnailWidth() - aiPaneWidth - dividers;

    // Keep the same ratio between editor and preview
    const totalEditorPreview = this.editorWidth() + this.previewWidth();
    if (totalEditorPreview > 0) {
      const editorRatio = this.editorWidth() / totalEditorPreview;
      this.editorWidth.set(Math.max(150, Math.floor(available * editorRatio)));
      this.previewWidth.set(Math.max(200, Math.floor(available * (1 - editorRatio))));
    } else {
      this.editorWidth.set(Math.floor(available / 2));
      this.previewWidth.set(Math.floor(available / 2));
    }
  }

  // --- Other ---

  private scheduleAutoSave() {
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      if (this.presentationId) {
        this.presentationService
          .update(this.presentationId, { content: this.content(), theme: this.currentTheme() })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe();
      }
    }, 2000);
  }

  saveTitle() {
    if (this.presentationId) {
      this.presentationService.update(this.presentationId, { title: this.title })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe();
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
    this.router.navigate(['/present', this.presentationId], {
      queryParams: { slide: this.currentSlideIndex() }
    });
  }

  onLayoutRulesChanged() {
    this.updateSlides(this.content());
  }

  goBack() {
    this.router.navigate(['/presentations']);
  }
}
