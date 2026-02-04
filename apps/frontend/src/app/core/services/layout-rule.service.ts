import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import type { LayoutRuleDto, CreateLayoutRuleDto, UpdateLayoutRuleDto } from '@slides/shared-types';

@Injectable({ providedIn: 'root' })
export class LayoutRuleService {
  rules = signal<LayoutRuleDto[]>([]);

  private styleEl: HTMLStyleElement | null = null;

  constructor(private http: HttpClient) {}

  async loadRules(): Promise<void> {
    const rules = await this.http.get<LayoutRuleDto[]>('/api/layout-rules').toPromise();
    if (rules) {
      this.rules.set(rules);
      this.injectCss(rules);
    }
  }

  private injectCss(rules: LayoutRuleDto[]): void {
    if (!this.styleEl) {
      this.styleEl = document.createElement('style');
      this.styleEl.id = 'slide-layout-rules';
      document.head.appendChild(this.styleEl);
    }
    const css = rules
      .filter(r => r.enabled)
      .map(r => r.cssContent)
      .join('\n');
    this.styleEl.textContent = css;
  }

  createRule(dto: CreateLayoutRuleDto): Observable<LayoutRuleDto> {
    return this.http.post<LayoutRuleDto>('/api/layout-rules', dto).pipe(
      tap(() => this.loadRules())
    );
  }

  updateRule(id: string, dto: UpdateLayoutRuleDto): Observable<LayoutRuleDto> {
    return this.http.put<LayoutRuleDto>(`/api/layout-rules/${id}`, dto).pipe(
      tap(() => this.loadRules())
    );
  }

  deleteRule(id: string): Observable<void> {
    return this.http.delete<void>(`/api/layout-rules/${id}`).pipe(
      tap(() => this.loadRules())
    );
  }
}
