import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../../core/services/theme.service';
import { ThemeEditorComponent } from './theme-editor.component';
import type { ThemeDto } from '@slides/shared-types';

@Component({
  selector: 'app-theme-selector',
  standalone: true,
  imports: [CommonModule, FormsModule, ThemeEditorComponent],
  templateUrl: './theme-selector.component.html',
  styleUrl: './theme-selector.component.scss',
})
export class ThemeSelectorComponent {
  themeService = inject(ThemeService);
  private destroyRef = inject(DestroyRef);

  themeChanged = output<string>();
  showEditor = signal(false);
  editingTheme = signal<ThemeDto | null>(null);

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
    this.themeService.deleteTheme(current.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
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
