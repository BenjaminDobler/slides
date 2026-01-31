import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { PresentationDto, CreatePresentationDto, UpdatePresentationDto } from '@slides/shared-types';

@Injectable({ providedIn: 'root' })
export class PresentationService {
  constructor(private http: HttpClient) {}

  list(): Observable<PresentationDto[]> {
    return this.http.get<PresentationDto[]>('/api/presentations');
  }

  get(id: string): Observable<PresentationDto> {
    return this.http.get<PresentationDto>(`/api/presentations/${id}`);
  }

  create(dto: CreatePresentationDto): Observable<PresentationDto> {
    return this.http.post<PresentationDto>('/api/presentations', dto);
  }

  update(id: string, dto: UpdatePresentationDto): Observable<PresentationDto> {
    return this.http.put<PresentationDto>(`/api/presentations/${id}`, dto);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/presentations/${id}`);
  }
}
