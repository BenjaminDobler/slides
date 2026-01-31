import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { MediaDto } from '@slides/shared-types';

@Injectable({ providedIn: 'root' })
export class MediaService {
  constructor(private http: HttpClient) {}

  list(): Observable<MediaDto[]> {
    return this.http.get<MediaDto[]>('/api/media');
  }

  upload(file: File): Observable<MediaDto> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<MediaDto>('/api/media', formData);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/media/${id}`);
  }
}
