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
    select { padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid #333; background: #0f3460; color: #fff; }
    .btn-icon { background: transparent; border: 1px solid #444; color: #ccc; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; padding: 0; }
    .btn-icon:hover { background: #333; color: #fff; }
    .btn-delete:hover { color: #e94560; border-color: #e94560; }
    .btn-add { color: #2ecc71; border-color: #2ecc71; }
    .btn-add:hover { background: #2ecc71; color: #fff; }
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
