import { Component, OnInit, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MediaService } from '../../../core/services/media.service';
import type { MediaDto } from '@slides/shared-types';

@Component({
  selector: 'app-media-library',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './media-library.component.html',
  styleUrl: './media-library.component.scss',
})
export class MediaLibraryComponent implements OnInit {
  private mediaService = inject(MediaService);

  mediaInsert = output<string>();

  items = signal<MediaDto[]>([]);
  uploading = signal(false);
  isDragOver = signal(false);

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
