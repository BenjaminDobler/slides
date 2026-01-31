import { Injectable } from '@angular/core';
import type { ParsedSlide } from '@slides/markdown-parser';

declare const mermaid: any;

@Injectable({ providedIn: 'root' })
export class ExportService {
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
      for (let i = 0; i < slides.length; i++) {
        if (onProgress) onProgress(i, slides.length);

        frame.innerHTML = slides[i].html;

        // Render mermaid diagrams if present
        if (typeof mermaid !== 'undefined') {
          const diagrams = frame.querySelectorAll('.mermaid');
          if (diagrams.length > 0) {
            diagrams.forEach((node: Element) => {
              node.removeAttribute('data-processed');
              const src = node.getAttribute('data-mermaid-src');
              if (src) node.textContent = src;
              if (!node.getAttribute('data-mermaid-src') && node.textContent) {
                node.setAttribute('data-mermaid-src', node.textContent.trim());
              }
            });
            try {
              await mermaid.run({ nodes: Array.from(diagrams) });
            } catch { /* ignore */ }
          }
        }

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
