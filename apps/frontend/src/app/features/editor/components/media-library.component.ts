import { Component, OnInit, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MediaService } from '../../../core/services/media.service';
import type { MediaDto } from '@slides/shared-types';

@Component({
  selector: 'app-media-library',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="media-library">
      <div
        class="drop-zone"
        [class.drag-over]="isDragOver()"
        (dragover)="onDragOver($event)"
        (dragleave)="isDragOver.set(false)"
        (drop)="onDrop($event)"
        (click)="fileInput.click()"
      >
        <input #fileInput type="file" accept="image/*,video/*,audio/*" multiple hidden (change)="onFileSelected($event)" />
        @if (uploading()) {
          <span>Uploading...</span>
        } @else {
          <span>Drop files here or click to upload</span>
        }
      </div>
      <div class="media-grid">
        @for (item of items(); track item.id) {
          <div class="media-item" (click)="insertMedia(item)" draggable="true" (dragstart)="onDragStart($event, item)">
            @if (item.mimeType.startsWith('image/')) {
              <img [src]="item.url" [alt]="item.originalName" />
            } @else if (item.mimeType.startsWith('video/')) {
              <div class="media-icon">&#9654;</div>
            } @else {
              <div class="media-icon">&#9835;</div>
            }
            <div class="media-name" [title]="item.originalName">{{ item.originalName }}</div>
            <button class="delete-btn" (click)="deleteMedia($event, item)" title="Delete">&times;</button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .media-library { display: flex; flex-direction: column; height: 100%; padding: 0.5rem; gap: 0.5rem; }
    .drop-zone {
      border: 2px dashed #0f3460;
      border-radius: 6px;
      padding: 1rem;
      text-align: center;
      color: #a8a8b3;
      font-size: 0.75rem;
      cursor: pointer;
      flex-shrink: 0;
      transition: border-color 0.15s, background 0.15s;
    }
    .drop-zone:hover, .drop-zone.drag-over {
      border-color: #e94560;
      background: rgba(233, 69, 96, 0.05);
    }
    .media-grid {
      flex: 1;
      overflow-y: auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem;
      align-content: start;
    }
    .media-item {
      position: relative;
      border-radius: 4px;
      overflow: hidden;
      background: #1e1e2e;
      cursor: pointer;
      border: 1px solid #333;
      aspect-ratio: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .media-item:hover { border-color: #e94560; cursor: grab; }
    .media-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .media-icon {
      font-size: 1.5rem;
      color: #a8a8b3;
    }
    .media-name {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 2px 4px;
      background: rgba(0,0,0,0.7);
      color: #ccc;
      font-size: 0.55rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .delete-btn {
      position: absolute;
      top: 2px;
      right: 2px;
      background: rgba(0,0,0,0.6);
      border: none;
      color: #e94560;
      font-size: 0.8rem;
      cursor: pointer;
      border-radius: 3px;
      padding: 0 4px;
      line-height: 1.2;
      display: none;
    }
    .media-item:hover .delete-btn { display: block; }
  `],
})
export class MediaLibraryComponent implements OnInit {
  @Output() mediaInsert = new EventEmitter<string>();

  items = signal<MediaDto[]>([]);
  uploading = signal(false);
  isDragOver = signal(false);

  constructor(private mediaService: MediaService) {}

  ngOnInit() {
    this.loadMedia();
  }

  private loadMedia() {
    this.mediaService.list().subscribe({
      next: (items) => this.items.set(items),
      error: (err) => console.error('Failed to load media:', err),
    });
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files) this.uploadFiles(files);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) this.uploadFiles(input.files);
    input.value = '';
  }

  private uploadFiles(files: FileList) {
    this.uploading.set(true);
    let remaining = files.length;
    for (let i = 0; i < files.length; i++) {
      this.mediaService.upload(files[i]).subscribe({
        next: () => {
          remaining--;
          if (remaining === 0) {
            this.uploading.set(false);
            this.loadMedia();
          }
        },
        error: (err) => {
          console.error('Upload failed:', err);
          remaining--;
          if (remaining === 0) {
            this.uploading.set(false);
            this.loadMedia();
          }
        },
      });
    }
  }

  onDragStart(event: DragEvent, item: MediaDto) {
    const markdown = this.getMarkdown(item);
    event.dataTransfer?.setData('text/plain', markdown);
    event.dataTransfer?.setData('application/x-media-insert', markdown);
  }

  private getMarkdown(item: MediaDto): string {
    if (item.mimeType.startsWith('image/')) {
      return `![${item.originalName}](${item.url})`;
    } else if (item.mimeType.startsWith('video/')) {
      return `<video src="${item.url}" controls></video>`;
    } else {
      return `<audio src="${item.url}" controls></audio>`;
    }
  }

  insertMedia(item: MediaDto) {
    this.mediaInsert.emit(this.getMarkdown(item));
  }

  deleteMedia(event: Event, item: MediaDto) {
    event.stopPropagation();
    this.mediaService.delete(item.id).subscribe(() => this.loadMedia());
  }
}
