import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { AiProviderConfigDto, CreateAiProviderConfigDto, UpdateAiProviderConfigDto, ModelInfoDto } from '@slides/shared-types';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AiService {
  constructor(private http: HttpClient) {}

  getConfigs(): Observable<AiProviderConfigDto[]> {
    return this.http.get<AiProviderConfigDto[]>('/api/ai-config');
  }

  saveConfig(dto: CreateAiProviderConfigDto): Observable<AiProviderConfigDto> {
    return this.http.post<AiProviderConfigDto>('/api/ai-config', dto);
  }

  updateConfig(id: string, dto: UpdateAiProviderConfigDto): Observable<AiProviderConfigDto> {
    return this.http.put<AiProviderConfigDto>(`/api/ai-config/${id}`, dto);
  }

  deleteConfig(id: string): Observable<void> {
    return this.http.delete<void>(`/api/ai-config/${id}`);
  }

  getModels(provider: string): Observable<ModelInfoDto[]> {
    return this.http.get<ModelInfoDto[]>(`/api/ai-config/${provider}/models`);
  }

  generate(prompt: string, provider: string, context?: string): Observable<{ content: string }> {
    return this.http.post<{ content: string }>('/api/ai/generate', { prompt, provider, context });
  }

  improve(slideContent: string, provider: string, instruction?: string): Observable<{ content: string }> {
    return this.http.post<{ content: string }>('/api/ai/improve', { slideContent, provider, instruction });
  }

  suggestStyle(content: string, provider: string): Observable<{ suggestion: string }> {
    return this.http.post<{ suggestion: string }>('/api/ai/suggest-style', { content, provider });
  }

  generateTheme(description: string, provider: string, existingCss?: string): Observable<{ name: string; displayName: string; cssContent: string }> {
    return this.http.post<{ name: string; displayName: string; cssContent: string }>('/api/ai/generate-theme', { description, provider, existingCss });
  }

  speakerNotes(slideContent: string, provider: string): Observable<{ notes: string }> {
    return this.http.post<{ notes: string }>('/api/ai/speaker-notes', { slideContent, provider });
  }

  generateDiagram(description: string, provider: string): Observable<{ mermaid: string }> {
    return this.http.post<{ mermaid: string }>('/api/ai/generate-diagram', { description, provider });
  }

  rewrite(slideContent: string, provider: string, audience: string): Observable<{ content: string }> {
    return this.http.post<{ content: string }>('/api/ai/rewrite', { slideContent, provider, audience });
  }

  outlineToSlides(outline: string, provider: string): Observable<{ content: string }> {
    return this.http.post<{ content: string }>('/api/ai/outline-to-slides', { outline, provider });
  }

  visualReview(slideContent: string, screenshot: string, provider: string): Observable<{ review: string }> {
    return this.http.post<{ review: string }>('/api/ai/visual-review', { slideContent, screenshot, provider });
  }

  visualImprove(slideContent: string, screenshot: string, provider: string, instruction?: string): Observable<{ content: string }> {
    return this.http.post<{ content: string }>('/api/ai/visual-improve', { slideContent, screenshot, provider, instruction });
  }
}
