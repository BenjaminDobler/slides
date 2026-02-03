import { inject, Injectable } from '@angular/core';
import type { ParsedSlide } from '@slides/markdown-parser';
import { MermaidService } from './mermaid.service';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private mermaidService = inject(MermaidService);
  private static readonly SLIDE_W = 960;
  private static readonly SLIDE_H = 600;

  async exportToPdf(
    slides: ParsedSlide[],
    theme: string,
    title: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    const { default: html2canvas } = await import('html2canvas');
    const { jsPDF } = await import('jspdf');

    // Create off-screen container matching slide dimensions
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed; left: -9999px; top: 0;
      width: ${ExportService.SLIDE_W}px; height: ${ExportService.SLIDE_H}px;
      overflow: hidden;
    `;
    const frame = document.createElement('div');
    frame.className = 'slide-content';
    frame.setAttribute('data-theme', theme);
    frame.style.cssText = `
      width: ${ExportService.SLIDE_W}px; height: ${ExportService.SLIDE_H}px;
      padding: 3rem; box-sizing: border-box; font-size: 1.5rem; overflow: hidden;
    `;
    container.appendChild(frame);
    document.body.appendChild(container);

    // PDF in landscape, custom size matching slide aspect ratio
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [ExportService.SLIDE_W, ExportService.SLIDE_H],
      hotfixes: ['px_scaling'],
    });

    try {
      // Initialize mermaid theme before rendering
      this.mermaidService.initializeTheme(theme);

      for (let i = 0; i < slides.length; i++) {
        if (onProgress) onProgress(i, slides.length);

        frame.innerHTML = slides[i].html;

        // Render mermaid diagrams with styled theme
        await this.mermaidService.renderDiagrams(frame);

        const canvas = await html2canvas(frame, {
          scale: 2,
          useCORS: true,
          backgroundColor: null,
          width: ExportService.SLIDE_W,
          height: ExportService.SLIDE_H,
        });

        const imgData = canvas.toDataURL('image/png');

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, ExportService.SLIDE_W, ExportService.SLIDE_H);
      }

      if (onProgress) onProgress(slides.length, slides.length);
      pdf.save(`${title || 'presentation'}.pdf`);
    } finally {
      document.body.removeChild(container);
    }
  }
}
