import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PresentationService } from '../../core/services/presentation.service';
import { AuthService } from '../../core/services/auth.service';
import type { PresentationDto } from '@slides/shared-types';

@Component({
  selector: 'app-presentation-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container">
      <div class="header">
        <h1>My Presentations</h1>
        <div>
          <button class="btn-primary" (click)="createNew()">+ New Presentation</button>
          <button class="btn-secondary" (click)="openSettings()">Settings</button>
          <button class="btn-secondary" (click)="logout()">Logout</button>
        </div>
      </div>
      <div class="grid">
        @for (p of presentations(); track p.id) {
          <div class="card" (click)="open(p.id)">
            <h3>{{ p.title }}</h3>
            <span class="meta">{{ p.updatedAt | date:'medium' }}</span>
            <button class="btn-delete" (click)="remove(p.id, $event)">Delete</button>
          </div>
        } @empty {
          <p class="empty">No presentations yet. Create one!</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .container { max-width: 900px; margin: 0 auto; padding: 2rem; color: #f8f9fa; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
    .card { background: #111318; padding: 1.5rem; border-radius: 10px; cursor: pointer; position: relative; border: 1px solid rgba(255,255,255,0.08); transition: background 0.15s, border-color 0.15s; }
    .card:hover { background: #23262f; border-color: rgba(255,255,255,0.15); }
    .card h3 { margin: 0 0 0.5rem; }
    .meta { color: #8b8d98; font-size: 0.85rem; }
    .btn-primary { padding: 0.6rem 1.2rem; border: none; border-radius: 6px; background: #3b82f6; color: #fff; cursor: pointer; margin-right: 0.5rem; transition: background 0.15s; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { padding: 0.6rem 1.2rem; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; background: transparent; color: #f8f9fa; cursor: pointer; margin-right: 0.5rem; transition: background 0.15s; }
    .btn-secondary:hover { background: #23262f; }
    .btn-delete { position: absolute; top: 0.5rem; right: 0.5rem; background: transparent; border: none; color: #ef4444; cursor: pointer; transition: color 0.15s; }
    .btn-delete:hover { color: #dc2626; }
    .empty { color: #8b8d98; text-align: center; grid-column: 1 / -1; }
  `],
})
export class PresentationListComponent implements OnInit {
  presentations = signal<PresentationDto[]>([]);

  constructor(
    private presentationService: PresentationService,
    private auth: AuthService,
    private router: Router
  ) {}

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
