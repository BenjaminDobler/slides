import { Injectable } from '@angular/core';

declare const mermaid: any;

@Injectable({ providedIn: 'root' })
export class MermaidService {
  private currentTheme = '';

  initializeTheme(themeName: string): void {
    if (typeof mermaid === 'undefined' || themeName === this.currentTheme) return;
    this.currentTheme = themeName;

    const darkThemes = ['dark', 'creative', 'ocean', 'sunset', 'forest', 'noir', 'cyberpunk'];
    const isDark = darkThemes.includes(themeName);
    const mermaidTheme = isDark ? 'dark' : 'default';

    // Default colors based on light/dark mode
    const defaultBg = isDark ? '#1a1a2e' : '#ffffff';
    const defaultText = isDark ? '#f8f9fa' : '#1a1a1a';
    const defaultAccent = isDark ? '#6366f1' : '#4f46e5';
    const defaultHeading = isDark ? '#ffffff' : '#111111';

    // Read CSS custom properties from the theme
    const tempEl = document.createElement('div');
    tempEl.className = 'slide-content';
    tempEl.setAttribute('data-theme', themeName);
    tempEl.style.display = 'none';
    document.body.appendChild(tempEl);
    const styles = getComputedStyle(tempEl);
    const bg = styles.getPropertyValue('--slide-bg').trim() || defaultBg;
    const text = styles.getPropertyValue('--slide-text').trim() || defaultText;
    const accent = styles.getPropertyValue('--slide-accent').trim() || defaultAccent;
    const heading = styles.getPropertyValue('--slide-heading').trim() || defaultHeading;
    document.body.removeChild(tempEl);

    // Generate complementary colors (only if we have valid hex colors)
    const isValidHex = (c: string) => /^#[0-9A-Fa-f]{6}$/.test(c);
    const accentLight = isValidHex(accent)
      ? (isDark ? this.lightenColor(accent, 20) : this.darkenColor(accent, 10))
      : accent;
    const accentDark = isValidHex(accent)
      ? (isDark ? this.darkenColor(accent, 20) : this.lightenColor(accent, 30))
      : accent;
    const nodeBg = isValidHex(bg)
      ? (isDark ? this.lightenColor(bg, 8) : this.darkenColor(bg, 5))
      : bg;
    const clusterBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
    const edgeLabelBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)';

    mermaid.initialize({
      startOnLoad: false,
      theme: mermaidTheme,
      securityLevel: 'loose',
      suppressErrorRendering: true,
      flowchart: {
        curve: 'basis',
        padding: 20,
        nodeSpacing: 50,
        rankSpacing: 60,
        htmlLabels: true,
        useMaxWidth: true,
        wrappingWidth: 200,
        defaultRenderer: 'dagre-wrapper',
      },
      sequence: {
        diagramMarginX: 20,
        diagramMarginY: 20,
        actorMargin: 80,
        boxMargin: 10,
        boxTextMargin: 5,
        noteMargin: 10,
        messageMargin: 40,
        mirrorActors: true,
        useMaxWidth: true,
      },
      themeVariables: {
        // Base colors
        background: 'transparent',
        mainBkg: nodeBg || bg,
        primaryColor: accent,
        primaryTextColor: text,
        primaryBorderColor: accentLight,
        secondaryColor: accentDark,
        secondaryTextColor: text,
        secondaryBorderColor: accentLight,
        tertiaryColor: clusterBg,
        tertiaryTextColor: text,
        tertiaryBorderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',

        // Typography
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        fontSize: '14px',

        // Lines and edges
        lineColor: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)',
        textColor: text,

        // Nodes
        nodeBorder: accentLight,
        nodeTextColor: text,

        // Clusters
        clusterBkg: clusterBg,
        clusterBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
        titleColor: heading || text,

        // Edge labels
        edgeLabelBackground: edgeLabelBg,

        // Sequence diagram actors
        actorBkg: nodeBg || bg,
        actorBorder: accent,
        actorTextColor: text,
        actorLineColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',

        // Sequence diagram signals
        signalColor: text,
        signalTextColor: text,

        // Sequence diagram notes
        noteBkgColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
        noteTextColor: text,
        noteBorderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',

        // Sequence diagram loops/boxes
        labelBoxBkgColor: clusterBg,
        labelBoxBorderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
        labelTextColor: text,
        loopTextColor: text,

        // Pie chart
        pie1: accent,
        pie2: accentLight,
        pie3: accentDark,
        pie4: isDark ? '#6366f1' : '#818cf8',
        pie5: isDark ? '#ec4899' : '#f472b6',
        pie6: isDark ? '#14b8a6' : '#2dd4bf',
        pie7: isDark ? '#f59e0b' : '#fbbf24',
        pieTextColor: text,
        pieLegendTextColor: text,
        pieSectionTextColor: isDark ? '#ffffff' : '#1a1a1a',
        pieStrokeColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',

        // Git graph
        git0: accent,
        git1: accentLight,
        git2: isDark ? '#6366f1' : '#818cf8',
        git3: isDark ? '#ec4899' : '#f472b6',
        gitBranchLabel0: text,
        gitBranchLabel1: text,
        gitBranchLabel2: text,
        gitBranchLabel3: text,

        // State diagram
        labelColor: text,
        altBackground: clusterBg,

        // Class diagram
        classText: text,

        // Requirement diagram
        requirementBackground: nodeBg || bg,
        requirementBorderColor: accent,
        requirementTextColor: text,
        relationColor: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)',
        relationLabelBackground: edgeLabelBg,
        relationLabelColor: text,
      },
    });
  }

  async renderDiagrams(container: HTMLElement): Promise<void> {
    if (typeof mermaid === 'undefined') return;

    // Reset any previously rendered diagrams
    const processed = container.querySelectorAll('.mermaid[data-processed]');
    processed.forEach((node: Element) => {
      node.removeAttribute('data-processed');
      const src = node.getAttribute('data-mermaid-src');
      if (src) {
        node.textContent = src;
      }
    });

    const diagrams = container.querySelectorAll('.mermaid');
    if (diagrams.length === 0) return;

    // Store source before mermaid replaces it
    diagrams.forEach((node: Element) => {
      if (!node.getAttribute('data-mermaid-src') && node.textContent) {
        node.setAttribute('data-mermaid-src', node.textContent.trim());
      }
    });

    try {
      await mermaid.run({ nodes: Array.from(diagrams) });
    } catch {
      // mermaid parse error - ignore
    }
  }

  private lightenColor(color: string, percent: number): string {
    if (!color) return color;
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
    const B = Math.min(255, (num & 0x0000ff) + amt);
    return `#${((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1)}`;
  }

  private darkenColor(color: string, percent: number): string {
    if (!color) return color;
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00ff) - amt);
    const B = Math.max(0, (num & 0x0000ff) - amt);
    return `#${((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1)}`;
  }
}
