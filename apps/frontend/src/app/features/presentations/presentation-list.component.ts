import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PresentationService } from '../../core/services/presentation.service';
import { AuthService } from '../../core/services/auth.service';
import type { PresentationDto } from '@slides/shared-types';

@Component({
  selector: 'app-presentation-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './presentation-list.component.html',
  styleUrl: './presentation-list.component.scss',
})
export class PresentationListComponent implements OnInit {
  private presentationService = inject(PresentationService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  presentations = signal<PresentationDto[]>([]);

  ngOnInit() {
    this.presentationService.list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => this.presentations.set(p),
        error: (err) => console.error('Failed to load presentations:', err),
      });
  }

  createNew() {
    this.presentationService
      .create({ title: 'Untitled Presentation', content: '# Welcome\n\nYour first slide\n\n---\n\n# Slide 2\n\nAdd content here' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => this.router.navigate(['/editor', p.id]),
        error: (err) => console.error('Failed to create presentation:', err),
      });
  }

  open(id: string) {
    this.router.navigate(['/editor', id]);
  }

  present(id: string, event: Event) {
    event.stopPropagation();
    this.router.navigate(['/present', id]);
  }

  remove(id: string, event: Event) {
    event.stopPropagation();
    this.presentationService.delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.presentations.update((list) => list.filter((p) => p.id !== id));
      });
  }

  clone(id: string, event: Event) {
    event.stopPropagation();
    this.presentationService.get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (original) => {
          this.presentationService.create({
            title: `Copy of ${original.title}`,
            content: original.content,
            theme: original.theme
          })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (cloned) => {
              this.presentations.update((list) => [cloned, ...list]);
            },
            error: (err) => console.error('Failed to clone presentation:', err),
          });
        },
        error: (err) => console.error('Failed to get presentation for cloning:', err),
      });
  }

  openSettings() {
    this.router.navigate(['/settings']);
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
