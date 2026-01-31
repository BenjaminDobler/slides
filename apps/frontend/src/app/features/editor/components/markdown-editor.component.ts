import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  Output,
  EventEmitter,
  Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';

declare const monaco: any;

@Component({
  selector: 'app-markdown-editor',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="editor-toolbar">
      <button title="Bold" (click)="wrapSelection('**', '**')"><b>B</b></button>
      <button title="Italic" (click)="wrapSelection('*', '*')"><i>I</i></button>
      <button title="Code" (click)="wrapSelection('\`', '\`')"><code>&lt;/&gt;</code></button>
      <span class="separator"></span>
      <button title="Heading" (click)="insertHeading()">H</button>
      <button title="List" (click)="insertAtLineStart('- ')">☰</button>
      <button title="Link" (click)="insertLink()">🔗</button>
      <button title="Image" (click)="insertImage()">🖼</button>
      <span class="separator"></span>
      <button title="Table" (click)="insertTable()">▦</button>
      <button title="Code Block" (click)="insertCodeBlock()">{{ '{' }} {{ '}' }}</button>
      <button title="Two Columns" (click)="insertColumns()">◫</button>
      <button title="New Slide (---)" (click)="insertSlideSeparator()">―――</button>
    </div>
    <div #editorContainer class="editor-container"></div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; width: 100%; }
    .editor-toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 8px;
      background: #111318;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      flex-shrink: 0;
    }
    .editor-toolbar button {
      background: transparent;
      border: 1px solid transparent;
      color: #8b8d98;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      min-width: 28px;
      text-align: center;
      transition: background 0.15s, color 0.15s;
    }
    .editor-toolbar button:hover {
      background: #23262f;
      border-color: rgba(255,255,255,0.1);
      color: #f8f9fa;
    }
    .separator {
      width: 1px;
      height: 18px;
      background: rgba(255,255,255,0.1);
      margin: 0 4px;
    }
    .editor-container { flex: 1; min-height: 0; overflow: hidden; }
  `],
})
export class MarkdownEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorContainer', { static: true }) editorContainer!: ElementRef<HTMLDivElement>;
  @Output() contentChange = new EventEmitter<string>();
  @Output() cursorSlideChanged = new EventEmitter<number>();
  @Input() set initialContent(value: string) {
    if (value === this._initialContent) return;
    this._initialContent = value;
    if (this.editor) {
      // Only set if the editor doesn't already have this content
      if (this.editor.getValue() !== value) {
        this.editor.setValue(value);
      }
    }
  }

  private editor: any;
  private _initialContent = '';
  private debounceTimer: any;

  ngAfterViewInit() {
    this.loadMonaco();
  }

  private loadMonaco() {
    const baseUrl = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min';
    if ((window as any).monaco) {
      this.initEditor();
      return;
    }

    const script = document.createElement('script');
    script.src = `${baseUrl}/vs/loader.js`;
    script.onload = () => {
      (window as any).require.config({ paths: { vs: `${baseUrl}/vs` } });
      (window as any).require(['vs/editor/editor.main'], () => this.initEditor());
    };
    document.head.appendChild(script);
  }

  private initEditor() {
    this.editor = (window as any).monaco.editor.create(this.editorContainer.nativeElement, {
      value: this._initialContent,
      language: 'markdown',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      wordWrap: 'on',
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      fontSize: 14,
    });

    this.editor.onDidChangeModelContent(() => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.contentChange.emit(this.editor.getValue());
      }, 300);
    });

    this.editor.onDidChangeCursorPosition((e: any) => {
      const lineNumber = e.position.lineNumber;
      const slideIndex = this.getSlideIndexAtLine(lineNumber);
      if (slideIndex !== this._lastCursorSlide) {
        this._lastCursorSlide = slideIndex;
        this.cursorSlideChanged.emit(slideIndex);
      }
    });

    // Handle drag-and-drop of media items
    const editorDom = this.editor.getDomNode();
    editorDom.addEventListener('dragover', (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('application/x-media-insert')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        // Move cursor to drop position
        const target = this.editor.getTargetAtClientPoint(e.clientX, e.clientY);
        if (target?.position) {
          this.editor.setPosition(target.position);
        }
      }
    });
    editorDom.addEventListener('drop', (e: DragEvent) => {
      const markdown = e.dataTransfer?.getData('application/x-media-insert');
      if (markdown) {
        e.preventDefault();
        e.stopPropagation();
        const target = this.editor.getTargetAtClientPoint(e.clientX, e.clientY);
        if (target?.position) {
          this.editor.executeEdits('media-drop', [{
            range: {
              startLineNumber: target.position.lineNumber,
              startColumn: target.position.column,
              endLineNumber: target.position.lineNumber,
              endColumn: target.position.column,
            },
            text: markdown + '\n',
          }]);
        }
        this.editor.focus();
      }
    });
  }

  private _lastCursorSlide = 0;
  private _revealingSlide = false;

  private getSlideIndexAtLine(lineNumber: number): number {
    if (!this.editor) return 0;
    const model = this.editor.getModel();
    const content = model.getValue();
    const lines = content.split('\n');
    let slideIndex = 0;
    for (let i = 0; i < Math.min(lineNumber - 1, lines.length); i++) {
      if (lines[i].trim() === '---') {
        // Check it's a slide separator (standalone --- on its own line)
        slideIndex++;
      }
    }
    return slideIndex;
  }

  revealSlide(index: number) {
    if (!this.editor) return;
    const model = this.editor.getModel();
    const content = model.getValue();
    const lines = content.split('\n');
    let slideIndex = 0;
    let targetLine = 1;
    for (let i = 0; i < lines.length; i++) {
      if (slideIndex === index) {
        targetLine = i + 1;
        break;
      }
      if (lines[i].trim() === '---') {
        slideIndex++;
      }
    }
    this._lastCursorSlide = index; // Prevent echo
    this.editor.setPosition({ lineNumber: targetLine, column: 1 });
    this.editor.revealLineInCenter(targetLine);
  }

  // --- Toolbar actions ---

  wrapSelection(before: string, after: string) {
    if (!this.editor) return;
    const selection = this.editor.getSelection();
    const model = this.editor.getModel();
    const selectedText = model.getValueInRange(selection);

    if (selectedText) {
      this.editor.executeEdits('toolbar', [{
        range: selection,
        text: `${before}${selectedText}${after}`,
      }]);
    } else {
      const pos = this.editor.getPosition();
      const text = `${before}text${after}`;
      this.editor.executeEdits('toolbar', [{
        range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column },
        text,
      }]);
      // Place cursor inside the wrapper
      this.editor.setPosition({ lineNumber: pos.lineNumber, column: pos.column + before.length });
      this.editor.setSelection({
        startLineNumber: pos.lineNumber,
        startColumn: pos.column + before.length,
        endLineNumber: pos.lineNumber,
        endColumn: pos.column + before.length + 4, // select "text"
      });
    }
    this.editor.focus();
  }

  insertHeading() {
    if (!this.editor) return;
    const pos = this.editor.getPosition();
    const model = this.editor.getModel();
    const line = model.getLineContent(pos.lineNumber);

    const match = line.match(/^(#{1,6})\s/);
    if (match) {
      const level = match[1].length;
      if (level < 6) {
        // Add one more #
        this.editor.executeEdits('toolbar', [{
          range: { startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: level + 1 },
          text: '#'.repeat(level + 1),
        }]);
      } else {
        // Remove all headings
        this.editor.executeEdits('toolbar', [{
          range: { startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: level + 2 },
          text: '',
        }]);
      }
    } else {
      this.editor.executeEdits('toolbar', [{
        range: { startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: 1 },
        text: '## ',
      }]);
    }
    this.editor.focus();
  }

  insertAtLineStart(prefix: string) {
    if (!this.editor) return;
    const pos = this.editor.getPosition();
    this.editor.executeEdits('toolbar', [{
      range: { startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: 1 },
      text: prefix,
    }]);
    this.editor.focus();
  }

  insertLink() {
    if (!this.editor) return;
    const selection = this.editor.getSelection();
    const model = this.editor.getModel();
    const selectedText = model.getValueInRange(selection);
    const text = selectedText ? `[${selectedText}](url)` : '[link text](url)';

    this.editor.executeEdits('toolbar', [{
      range: selection,
      text,
    }]);
    this.editor.focus();
  }

  insertImage() {
    if (!this.editor) return;
    const pos = this.editor.getPosition();
    const text = '![alt text](image-url)';
    this.editor.executeEdits('toolbar', [{
      range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column },
      text,
    }]);
    this.editor.focus();
  }

  insertTable() {
    if (!this.editor) return;
    const pos = this.editor.getPosition();
    const table = '\n| Header 1 | Header 2 | Header 3 |\n| -------- | -------- | -------- |\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |\n';
    this.editor.executeEdits('toolbar', [{
      range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column },
      text: table,
    }]);
    this.editor.focus();
  }

  insertCodeBlock() {
    if (!this.editor) return;
    const selection = this.editor.getSelection();
    const model = this.editor.getModel();
    const selectedText = model.getValueInRange(selection);
    const code = selectedText || 'code here';
    const text = `\n\`\`\`\n${code}\n\`\`\`\n`;

    this.editor.executeEdits('toolbar', [{
      range: selection,
      text,
    }]);
    this.editor.focus();
  }

  insertColumns() {
    if (!this.editor) return;
    const pos = this.editor.getPosition();
    const text = '\n<!-- columns -->\nLeft content\n\n<!-- split -->\nRight content\n\n';
    this.editor.executeEdits('toolbar', [{
      range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column },
      text,
    }]);
    this.editor.focus();
  }

  insertSlideSeparator() {
    if (!this.editor) return;
    const pos = this.editor.getPosition();
    this.editor.executeEdits('toolbar', [{
      range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column },
      text: '\n\n---\n\n',
    }]);
    this.editor.focus();
  }

  // --- Public API ---

  getValue(): string {
    return this.editor?.getValue() || '';
  }

  setValue(content: string): void {
    this.editor?.setValue(content);
  }

  /** Replace all content but keep undo stack (Ctrl+Z works) */
  replaceAll(content: string): void {
    if (!this.editor) return;
    const model = this.editor.getModel();
    const fullRange = model.getFullModelRange();
    this.editor.executeEdits('ai', [{
      range: fullRange,
      text: content,
    }]);
  }

  revealLine(lineNumber: number): void {
    if (!this.editor) return;
    this.editor.setPosition({ lineNumber, column: 1 });
    this.editor.revealLineInCenter(lineNumber);
    this.editor.focus();
  }

  insertAtCursor(text: string): void {
    if (!this.editor) return;
    const pos = this.editor.getPosition();
    this.editor.executeEdits('media', [{
      range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column },
      text: text + '\n',
    }]);
    this.editor.focus();
  }

  ngOnDestroy() {
    clearTimeout(this.debounceTimer);
    this.editor?.dispose();
  }
}
