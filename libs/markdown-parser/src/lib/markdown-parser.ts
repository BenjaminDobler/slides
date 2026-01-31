import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

export interface ParsedSlide {
  content: string;
  html: string;
  notes?: string;
  /** Line offset of this slide in the full document (0-based) */
  lineOffset: number;
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

// Plugin: inject data-source-line attributes on block-level opening tags
function sourceLinePlugin(mdInstance: MarkdownIt) {
  const defaultOpen =
    mdInstance.renderer.renderToken.bind(mdInstance.renderer);
  mdInstance.renderer.renderToken = function (tokens, idx, options) {
    const token = tokens[idx];
    if (token.map && token.nesting === 1) {
      token.attrSet('data-source-line', String(token.map[0]));
    }
    return defaultOpen(tokens, idx, options);
  };
}
md.use(sourceLinePlugin);

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
  return html.replace(/<ul([^>]*)>\n?((?:<li[^>]*>[\s\S]*?<\/li>\n?)+)<\/ul>/g, (match, ulAttrs: string, inner: string) => {
    const items = [...inner.matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/g)];
    // Strip optional <p> wrappers inside <li> (loose lists)
    const itemContents = items.map((m) => m[2].trim().replace(/^<p>([\s\S]*)<\/p>$/g, '$1').trim());
    // Check if every item starts with <strong>...<\/strong> followed by text
    const allCards = itemContents.every((item) => /^<strong>.+?<\/strong>/.test(item));
    if (!allCards) return match;

    const cards = items.map((m, i) => {
      const liAttrs = m[1];
      const item = itemContents[i];
      const titleMatch = item.match(/^<strong>(.+?)<\/strong>\s*([\s\S]*)/);
      if (!titleMatch) return `<div class="slide-card"${liAttrs}>${item}</div>`;
      const title = titleMatch[1].replace(/:$/, '');
      const desc = titleMatch[2];
      return `<div class="slide-card"${liAttrs}><div class="slide-card-title">${title}</div><div class="slide-card-body">${desc}</div></div>`;
    });

    return `<div class="slide-card-grid"${ulAttrs}>${cards.join('\n')}</div>`;
  });
}

/**
 * Pre-process markdown to split adjacent lists separated by blank lines
 * into distinct lists. Markdown-it merges them into one loose list otherwise.
 */
function separateAdjacentLists(markdown: string): string {
  // Insert a zero-width HTML break between two list blocks separated by blank lines.
  // Run repeatedly until no more replacements are made (handles 3+ consecutive lists).
  let prev = '';
  let result = markdown;
  while (result !== prev) {
    prev = result;
    result = result.replace(/(^- .+)\n(\n+)(- )/gm, '$1\n$2<!-- -->\n\n$3');
  }
  return result;
}

/**
 * Renders slide markdown to HTML, processing <!-- columns --> / <!-- split -->
 * directives into a two-column flex layout.
 */
function render(content: string): string {
  return md.render(separateAdjacentLists(content));
}

function renderSlideMarkdown(content: string): string {
  const colRegex = /<!--\s*columns\s*-->([\s\S]*?)<!--\s*split\s*-->([\s\S]*?)(?:<!--\s*\/columns\s*-->|$)/i;
  const match = content.match(colRegex);

  if (!match) {
    return render(content);
  }

  const before = content.slice(0, match.index).trim();
  const left = match[1].trim();
  const right = match[2].trim();
  const afterIdx = match.index! + match[0].length;
  const after = content.slice(afterIdx).trim();

  let html = '';
  if (before) html += render(before);
  html += `<div class="slide-columns"><div class="slide-col">${render(left)}</div><div class="slide-col">${render(right)}</div></div>`;
  if (after) html += render(after);

  return html;
}

export function parsePresentation(markdown: string): ParsedPresentation {
  const rawSlides = markdown.split(/\n---\n/);

  let lineOffset = 0;
  const slides: ParsedSlide[] = rawSlides.map((raw) => {
    // Count leading whitespace lines that were trimmed
    const trimmedStart = raw.length - raw.trimStart().length;
    const leadingLines = raw.slice(0, trimmedStart).split('\n').length - 1;
    const slideLineOffset = lineOffset + leadingLines;

    const { content, notes } = extractNotes(raw.trim());
    let html = renderSlideMarkdown(content);
    html = transformCardLists(html);

    // Advance line offset: raw content lines + 1 for the --- separator
    lineOffset += raw.split('\n').length + 1;

    return { content, html, notes, lineOffset: slideLineOffset };
  });

  return { slides };
}
