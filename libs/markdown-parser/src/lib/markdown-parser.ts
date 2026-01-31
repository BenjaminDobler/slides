import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

export interface ParsedSlide {
  content: string;
  html: string;
  notes?: string;
}

export interface ParsedPresentation {
  slides: ParsedSlide[];
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str: string, lang: string): string {
    if (lang === 'mermaid') {
      return `<div class="mermaid">${str}</div>`;
    }
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
      } catch {
        // fallthrough
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

function extractNotes(markdown: string): { content: string; notes?: string } {
  const notesRegex = /<!--\s*notes\s*-->([\s\S]*?)<!--\s*\/notes\s*-->/i;
  const match = markdown.match(notesRegex);
  if (match) {
    const notes = match[1].trim();
    const content = markdown.replace(notesRegex, '').trim();
    return { content, notes };
  }
  return { content: markdown };
}

export function parsePresentation(markdown: string): ParsedPresentation {
  const rawSlides = markdown.split(/\n---\n/);

  const slides: ParsedSlide[] = rawSlides.map((raw) => {
    const { content, notes } = extractNotes(raw.trim());
    const html = md.render(content);
    return { content, html, notes };
  });

  return { slides };
}
