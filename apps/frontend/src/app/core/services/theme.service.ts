import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import type { ThemeDto, CreateThemeDto, UpdateThemeDto } from '@slides/shared-types';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  themes = signal<ThemeDto[]>([]);
  currentTheme = signal<ThemeDto | null>(null);

  // Whether the current theme centers content vertically when it fits (no scaling)
  centerContent = computed(() => this.currentTheme()?.centerContent ?? true);

  private styleEl: HTMLStyleElement | null = null;

  constructor(private http: HttpClient) {}

  async loadThemes(): Promise<void> {
    const themes = await this.http.get<ThemeDto[]>('/api/themes').toPromise();
    if (themes) {
      this.themes.set(themes);
      if (!this.currentTheme() && themes.length > 0) {
        this.applyTheme(themes[0]);
      }
    }
  }

  applyTheme(theme: ThemeDto): void {
    this.currentTheme.set(theme);
    if (!this.styleEl) {
      this.styleEl = document.createElement('style');
      this.styleEl.id = 'slide-theme';
      document.head.appendChild(this.styleEl);
    }
    this.styleEl.textContent = theme.cssContent;
  }

  createTheme(dto: CreateThemeDto): Observable<ThemeDto> {
    return this.http.post<ThemeDto>('/api/themes', dto).pipe(
      tap(() => this.loadThemes())
    );
  }

  updateTheme(id: string, dto: UpdateThemeDto): Observable<ThemeDto> {
    return this.http.put<ThemeDto>(`/api/themes/${id}`, dto).pipe(
      tap(() => this.loadThemes())
    );
  }

  deleteTheme(id: string): Observable<void> {
    return this.http.delete<void>(`/api/themes/${id}`).pipe(
      tap(() => this.loadThemes())
    );
  }
}
