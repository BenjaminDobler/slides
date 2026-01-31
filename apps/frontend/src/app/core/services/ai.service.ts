import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { AiProviderConfigDto, CreateAiProviderConfigDto } from '@slides/shared-types';
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

  deleteConfig(id: string): Observable<void> {
    return this.http.delete<void>(`/api/ai-config/${id}`);
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
}
