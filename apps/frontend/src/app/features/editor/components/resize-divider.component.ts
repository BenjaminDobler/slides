import { Component, HostListener, signal, output } from '@angular/core';

@Component({
  selector: 'app-resize-divider',
  standalone: true,
  templateUrl: './resize-divider.component.html',
  styleUrl: './resize-divider.component.scss',
})
export class ResizeDividerComponent {
  resized = output<number>();

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
