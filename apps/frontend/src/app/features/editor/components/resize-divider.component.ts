import { Component, Output, EventEmitter, HostListener, signal } from '@angular/core';

@Component({
  selector: 'app-resize-divider',
  standalone: true,
  template: `<div class="divider" [class.active]="dragging()" (mousedown)="onMouseDown($event)"></div>`,
  styles: [`
    .divider {
      width: 5px;
      cursor: col-resize;
      background: #0f3460;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    .divider:hover, .divider.active {
      background: #e94560;
    }
  `],
})
export class ResizeDividerComponent {
  @Output() resized = new EventEmitter<number>();

  dragging = signal(false);
  private startX = 0;

  onMouseDown(event: MouseEvent) {
    event.preventDefault();
    this.dragging.set(true);
    this.startX = event.clientX;
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.dragging()) return;
    const delta = event.clientX - this.startX;
    this.startX = event.clientX;
    this.resized.emit(delta);
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    this.dragging.set(false);
  }
}
