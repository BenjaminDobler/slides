import { Component, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../../core/services/theme.service';
import { ThemeEditorComponent } from './theme-editor.component';
import type { ThemeDto } from '@slides/shared-types';

@Component({
  selector: 'app-theme-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, ThemeEditorComponent],
  template: `
    <div class="theme-selector">
      <select [ngModel]="themeService.currentTheme()?.name" (ngModelChange)="onThemeChange($event)">
        @for (t of themeService.themes(); track t.name) {
          <option [value]="t.name">{{ t.displayName }}</option>
        }
      </select>
      @if (canEditCurrent()) {
        <button class="btn-icon" title="Edit theme" (click)="editCurrent()">&#9998;</button>
        <button class="btn-icon btn-delete" title="Delete theme" (click)="deleteCurrent()">&#10005;</button>
      }
      <button class="btn-icon btn-add" title="New theme" (click)="showEditor.set(true)">+</button>
    </div>
    @if (showEditor()) {
      <app-theme-editor
        [editTheme]="editingTheme()"
        (close)="closeEditor()"
        (saved)="onThemeSaved()"
      />
    }
  `,
  styles: [`
    .theme-selector { display: flex; align-items: center; gap: 4px; }
    select { padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: #1c1f26; color: #f8f9fa; transition: border-color 0.15s; }
    select:focus { outline: none; border-color: #3b82f6; }
    .btn-icon { background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #8b8d98; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; padding: 0; transition: all 0.15s; }
    .btn-icon:hover { background: #23262f; color: #f8f9fa; }
    .btn-delete:hover { color: #ef4444; border-color: #ef4444; }
    .btn-add { color: #22c55e; border-color: #22c55e; }
    .btn-add:hover { background: #22c55e; color: #fff; }
  `],
})
export class ThemeSelectorComponent {
  @Output() themeChanged = new EventEmitter<string>();

  showEditor = signal(false);
  editingTheme = signal<ThemeDto | null>(null);

  constructor(public themeService: ThemeService) {}

  canEditCurrent(): boolean {
    const current = this.themeService.currentTheme();
    return !!current && !current.isDefault && !!current.userId;
  }

  onThemeChange(themeName: string) {
    const theme = this.themeService.themes().find((t) => t.name === themeName);
    if (theme) {
      this.themeService.applyTheme(theme);
      this.themeChanged.emit(themeName);
    }
  }

  editCurrent() {
    this.editingTheme.set(this.themeService.currentTheme());
    this.showEditor.set(true);
  }

  deleteCurrent() {
    const current = this.themeService.currentTheme();
    if (!current || current.isDefault) return;
    this.themeService.deleteTheme(current.id).subscribe(() => {
      const themes = this.themeService.themes();
      if (themes.length > 0) {
        this.themeService.applyTheme(themes[0]);
        this.themeChanged.emit(themes[0].name);
      }
    });
  }

  closeEditor() {
    this.showEditor.set(false);
    this.editingTheme.set(null);
  }

  onThemeSaved() {
    this.showEditor.set(false);
    this.editingTheme.set(null);
    // Reload themes and apply the latest
    this.themeService.loadThemes();
  }
}
