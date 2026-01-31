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

/**
 * Transforms `<ul>` lists where every `<li>` matches "**Title:** description"
 * into a horizontal card grid layout.
 */
function transformCardLists(html: string): string {
  // Match <ul> blocks where ALL <li> items have the pattern <strong>Title:</strong> desc
  return html.replace(/<ul>\n?((?:<li>[\s\S]*?<\/li>\n?)+)<\/ul>/g, (match, inner: string) => {
    const items = [...inner.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());
    // Check if every item starts with <strong>...<\/strong> followed by text
    const allCards = items.every((item) => /^<strong>.+?<\/strong>/.test(item));
    if (!allCards) return match;

    const cards = items.map((item) => {
      const titleMatch = item.match(/^<strong>(.+?)<\/strong>\s*([\s\S]*)/);
      if (!titleMatch) return `<div class="slide-card">${item}</div>`;
      const title = titleMatch[1].replace(/:$/, '');
      const desc = titleMatch[2];
      return `<div class="slide-card"><div class="slide-card-title">${title}</div><div class="slide-card-body">${desc}</div></div>`;
    });

    return `<div class="slide-card-grid">${cards.join('\n')}</div>`;
  });
}

/**
 * Renders slide markdown to HTML, processing <!-- columns --> / <!-- split -->
 * directives into a two-column flex layout.
 */
function renderSlideMarkdown(content: string): string {
  const colRegex = /<!--\s*columns\s*-->([\s\S]*?)<!--\s*split\s*-->([\s\S]*?)(?:<!--\s*\/columns\s*-->|$)/i;
  const match = content.match(colRegex);

  if (!match) {
    return md.render(content);
  }

  const before = content.slice(0, match.index).trim();
  const left = match[1].trim();
  const right = match[2].trim();
  const afterIdx = match.index! + match[0].length;
  const after = content.slice(afterIdx).trim();

  let html = '';
  if (before) html += md.render(before);
  html += `<div class="slide-columns"><div class="slide-col">${md.render(left)}</div><div class="slide-col">${md.render(right)}</div></div>`;
  if (after) html += md.render(after);

  return html;
}

export function parsePresentation(markdown: string): ParsedPresentation {
  const rawSlides = markdown.split(/\n---\n/);

  const slides: ParsedSlide[] = rawSlides.map((raw) => {
    const { content, notes } = extractNotes(raw.trim());
    let html = renderSlideMarkdown(content);
    html = transformCardLists(html);
    return { content, html, notes };
  });

  return { slides };
}
