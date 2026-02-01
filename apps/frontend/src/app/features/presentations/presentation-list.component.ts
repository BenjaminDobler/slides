import { Component, OnInit, inject, signal } from '@angular/core';
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

  presentations = signal<PresentationDto[]>([]);

  ngOnInit() {
    this.presentationService.list().subscribe((p) => this.presentations.set(p));
  }

  createNew() {
    this.presentationService
      .create({ title: 'Untitled Presentation', content: '# Welcome\n\nYour first slide\n\n---\n\n# Slide 2\n\nAdd content here' })
      .subscribe((p) => this.router.navigate(['/editor', p.id]));
  }

  open(id: string) {
    this.router.navigate(['/editor', id]);
  }

  remove(id: string, event: Event) {
    event.stopPropagation();
    this.presentationService.delete(id).subscribe(() => {
      this.presentations.update((list) => list.filter((p) => p.id !== id));
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
