import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

// Layout rule types (mirrored from @slides/shared-types to avoid cross-lib build dependency)

interface NumericCondition {
  eq?: number;
  gte?: number;
  lte?: number;
  gt?: number;
}

interface LayoutConditions {
  hasHeading?: boolean;
  imageCount?: NumericCondition;
  figureCount?: NumericCondition;
  h3Count?: NumericCondition;
  textParagraphCount?: NumericCondition;
  hasCards?: boolean;
  hasList?: boolean;
  hasCodeBlock?: boolean;
  hasBlockquote?: boolean;
}

interface WrapOptions {
  className: string;
}

interface SplitTwoOptions {
  className: string;
  leftSelector: 'text' | 'cards';
  rightSelector: 'media';
  leftClassName: string;
  rightClassName: string;
}

interface SplitTopBottomOptions {
  className: string;
  bottomSelector: 'media';
}

interface GroupByHeadingOptions {
  headingLevel: number;
  containerClassName: string;
  columnClassName: string;
}

interface LayoutTransform {
  type: 'wrap' | 'split-two' | 'split-top-bottom' | 'group-by-heading';
  options: WrapOptions | SplitTwoOptions | SplitTopBottomOptions | GroupByHeadingOptions;
}

export interface LayoutRuleInput {
  enabled: boolean;
  displayName: string;
  conditions: LayoutConditions;
  transform: LayoutTransform;
}

export interface ParsedSlide {
  content: string;
  html: string;
  notes?: string;
  /** Line offset of this slide in the full document (0-based) */
  lineOffset: number;
  /** Display name of the auto-layout rule applied to this slide, if any */
  appliedLayout?: string;
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
        return `<pre class="hljs" data-lang="${md.utils.escapeHtml(lang)}"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
      } catch {
        // fallthrough
      }
    }
    const langAttr = lang ? ` data-lang="${md.utils.escapeHtml(lang)}"` : '';
    return `<pre class="hljs"${langAttr}><code>${md.utils.escapeHtml(str)}</code></pre>`;
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
 * Transforms <p><img ...></p> followed by <p><em>caption</em></p> into
 * <figure><img ...><figcaption>caption</figcaption></figure>
 */
function transformImageCaptions(html: string): string {
  // Case 1: <p><img></p> followed by <p><em>caption</em></p> (blank line between)
  let result = html.replace(
    /<p([^>]*)>(<img [^>]+>)<\/p>\s*<p([^>]*)><em>([^<]+)<\/em><\/p>/g,
    (_match, pAttrs, img, _p2Attrs, caption) => {
      return `<figure${pAttrs}>${img}<figcaption>${caption}</figcaption></figure>`;
    }
  );
  // Case 2: <p><img>\n<em>caption</em></p> (no blank line, same paragraph)
  result = result.replace(
    /<p([^>]*)>(<img [^>]+>)\s*\n\s*<em>([^<]+)<\/em><\/p>/g,
    (_match, pAttrs, img, caption) => {
      return `<figure${pAttrs}>${img}<figcaption>${caption}</figcaption></figure>`;
    }
  );
  return result;
}

// === Content analysis ===

export interface ContentFeatures {
  hasHeading: boolean;
  imageCount: number;
  figureCount: number;
  h3Count: number;
  textParagraphCount: number;
  hasCards: boolean;
  hasList: boolean;
  hasCodeBlock: boolean;
  hasBlockquote: boolean;
}

export function analyzeContent(html: string): ContentFeatures {
  const hasHeading = /<h[1-3][^>]*>/.test(html);
  const images = html.match(/<img [^>]+>/g) || [];
  const figures = html.match(/<figure[^>]*>/g) || [];
  const imageCount = images.length;
  const figureCount = figures.length;
  const hasCards = html.includes('slide-card-grid');
  const hasBlockquote = /<blockquote/.test(html);
  const hasList = /<[uo]l[^>]*>/.test(html) && !hasCards;
  const hasCodeBlock = /<pre[^>]*>/.test(html);
  const paragraphs = html.match(/<p[^>]*>[\s\S]*?<\/p>/g) || [];
  const textParagraphs = paragraphs.filter(
    (p) => !/<p[^>]*>\s*<img /.test(p) && !/<p[^>]*>\s*<em>[^<]+<\/em>\s*<\/p>/.test(p)
  );
  const h3Count = (html.match(/<h3[^>]*>/g) || []).length;

  return {
    hasHeading,
    imageCount,
    figureCount,
    h3Count,
    textParagraphCount: textParagraphs.length,
    hasCards,
    hasList,
    hasCodeBlock,
    hasBlockquote,
  };
}

// === Condition matching ===

function matchNumeric(value: number, cond: NumericCondition): boolean {
  if (cond.eq !== undefined && value !== cond.eq) return false;
  if (cond.gte !== undefined && value < cond.gte) return false;
  if (cond.lte !== undefined && value > cond.lte) return false;
  if (cond.gt !== undefined && value <= cond.gt) return false;
  return true;
}

export function matchesConditions(features: ContentFeatures, conditions: LayoutConditions): boolean {
  if (conditions.hasHeading !== undefined && features.hasHeading !== conditions.hasHeading) return false;
  if (conditions.hasCards !== undefined && features.hasCards !== conditions.hasCards) return false;
  if (conditions.hasList !== undefined && features.hasList !== conditions.hasList) return false;
  if (conditions.hasCodeBlock !== undefined && features.hasCodeBlock !== conditions.hasCodeBlock) return false;
  if (conditions.hasBlockquote !== undefined && features.hasBlockquote !== conditions.hasBlockquote) return false;
  if (conditions.imageCount && !matchNumeric(features.imageCount, conditions.imageCount)) return false;
  if (conditions.figureCount && !matchNumeric(features.figureCount, conditions.figureCount)) return false;
  if (conditions.h3Count && !matchNumeric(features.h3Count, conditions.h3Count)) return false;
  if (conditions.textParagraphCount && !matchNumeric(features.textParagraphCount, conditions.textParagraphCount)) return false;
  return true;
}

// === Transform application ===

export function applyTransform(html: string, transform: LayoutTransform, features: ContentFeatures): string {
  switch (transform.type) {
    case 'wrap': {
      const opts = transform.options as WrapOptions;
      return `<div class="${opts.className}">${html}</div>`;
    }

    case 'split-two': {
      const opts = transform.options as SplitTwoOptions;
      const leftParts: string[] = [];
      const rightParts: string[] = [];
      const parts = splitTopLevel(html);

      if (opts.leftSelector === 'cards') {
        // Cards + media split
        for (const part of parts) {
          if (/<img [^>]+>/.test(part) && !part.includes('slide-card')) {
            rightParts.push(part);
          } else if (/<figure[^>]*>/.test(part)) {
            rightParts.push(part);
          } else {
            leftParts.push(part);
          }
        }
      } else {
        // Text + media split (text left, first media right)
        for (const part of parts) {
          if ((/<p[^>]*>\s*<img /.test(part) || /<figure[^>]*>/.test(part)) && rightParts.length === 0) {
            rightParts.push(part);
          } else {
            leftParts.push(part);
          }
        }
      }

      if (rightParts.length > 0 && leftParts.length > 0) {
        return `<div class="${opts.className}"><div class="${opts.leftClassName}">${leftParts.join('\n')}</div><div class="${opts.rightClassName}">${rightParts.join('\n')}</div></div>`;
      }
      return html;
    }

    case 'split-top-bottom': {
      const opts = transform.options as SplitTopBottomOptions;
      const topParts: string[] = [];
      const gridParts: string[] = [];
      const parts = splitTopLevel(html);

      for (const part of parts) {
        if (/<figure[^>]*>/.test(part) || /<p[^>]*>\s*<img /.test(part)) {
          gridParts.push(part);
        } else {
          topParts.push(part);
        }
      }

      if (gridParts.length >= 2) {
        return `${topParts.join('\n')}\n<div class="${opts.className}">${gridParts.join('\n')}</div>`;
      }
      return html;
    }

    case 'group-by-heading': {
      const opts = transform.options as GroupByHeadingOptions;
      const headingTag = `h${opts.headingLevel}`;
      const headingRegex = new RegExp(`<${headingTag}[^>]*>`);
      const parts = splitTopLevel(html);
      const headerParts: string[] = [];
      const sections: string[][] = [];
      let current: string[] | null = null;

      for (const part of parts) {
        if (headingRegex.test(part)) {
          if (current) sections.push(current);
          current = [part];
        } else if (current) {
          current.push(part);
        } else {
          headerParts.push(part);
        }
      }
      if (current) sections.push(current);

      if (sections.length >= 2) {
        const header = headerParts.length > 0 ? headerParts.join('\n') : '';
        const cols = sections.map(s => `<div class="${opts.columnClassName}">${s.join('\n')}</div>`).join('\n');
        return `${header}\n<div class="${opts.containerClassName}">${cols}</div>`;
      }
      return html;
    }

    default:
      return html;
  }
}

// === Rule engine ===

interface LayoutResult {
  html: string;
  appliedLayout?: string;
}

export function applyAutoLayoutWithRules(html: string, rules: LayoutRuleInput[]): LayoutResult {
  // Skip if manual columns layout is present
  if (html.includes('slide-columns')) return { html, appliedLayout: 'Columns (manual)' };

  const features = analyzeContent(html);
  const enabledRules = rules.filter(r => r.enabled);

  for (const rule of enabledRules) {
    if (matchesConditions(features, rule.conditions)) {
      return {
        html: applyTransform(html, rule.transform, features),
        appliedLayout: rule.displayName,
      };
    }
  }

  return { html };
}

// === Legacy hardcoded auto-layout (fallback) ===

/**
 * Detects content patterns in rendered slide HTML and wraps in layout containers.
 * Skips slides that already use manual <!-- columns --> layout.
 */
function applyAutoLayout(html: string): LayoutResult {
  // Skip if manual columns layout is present
  if (html.includes('slide-columns')) return { html, appliedLayout: 'Columns (manual)' };

  // Analyze top-level content
  const hasHeading = /<h[1-3][^>]*>/.test(html);
  const images = html.match(/<img [^>]+>/g) || [];
  const figures = html.match(/<figure[^>]*>/g) || [];
  const imageCount = images.length;
  const figureCount = figures.length;
  const hasCards = html.includes('slide-card-grid');
  const hasBlockquote = /<blockquote/.test(html);
  const hasList = /<[uo]l[^>]*>/.test(html) && !hasCards;
  const hasCodeBlock = /<pre[^>]*>/.test(html);
  const paragraphs = html.match(/<p[^>]*>[\s\S]*?<\/p>/g) || [];
  // Paragraphs that aren't just images or captions
  const textParagraphs = paragraphs.filter(
    (p) => !/<p[^>]*>\s*<img /.test(p) && !/<p[^>]*>\s*<em>[^<]+<\/em>\s*<\/p>/.test(p)
  );

  // Sections: h1/h2 title + 2+ h3 sections each followed by a list → multi-column
  const h3Count = (html.match(/<h3[^>]*>/g) || []).length;
  if (h3Count >= 2 && imageCount === 0 && !hasCards) {
    const parts = splitTopLevel(html);
    const headerParts: string[] = [];
    const sections: string[][] = [];
    let current: string[] | null = null;

    for (const part of parts) {
      if (/<h3[^>]*>/.test(part)) {
        if (current) sections.push(current);
        current = [part];
      } else if (current) {
        current.push(part);
      } else {
        headerParts.push(part);
      }
    }
    if (current) sections.push(current);

    if (sections.length >= 2) {
      const header = headerParts.length > 0 ? headerParts.join('\n') : '';
      const cols = sections.map(s => `<div class="layout-section-col">${s.join('\n')}</div>`).join('\n');
      return { html: `${header}\n<div class="layout-sections">${cols}</div>`, appliedLayout: 'Sections' };
    }
  }

  // Hero: only headings + at most 1 short text paragraph, no images/lists/cards/code
  if (
    hasHeading &&
    imageCount === 0 &&
    !hasCards &&
    !hasList &&
    !hasCodeBlock &&
    !hasBlockquote &&
    textParagraphs.length <= 1
  ) {
    return { html: `<div class="layout-hero">${html}</div>`, appliedLayout: 'Hero' };
  }

  // Cards + Image: has card grid and at least one image not inside cards
  if (hasCards && imageCount > 0) {
    // Split: everything before/after the first image or figure that's outside cards
    // Strategy: cards + non-image content on left, images on right
    const cardAndTextParts: string[] = [];
    const mediaParts: string[] = [];

    // Simple split: go through top-level elements
    const parts = splitTopLevel(html);
    for (const part of parts) {
      if (/<img [^>]+>/.test(part) && !part.includes('slide-card')) {
        mediaParts.push(part);
      } else if (/<figure[^>]*>/.test(part)) {
        mediaParts.push(part);
      } else {
        cardAndTextParts.push(part);
      }
    }

    if (mediaParts.length > 0) {
      return { html: `<div class="layout-cards-image"><div class="layout-cards-side">${cardAndTextParts.join('\n')}</div><div class="layout-media-side">${mediaParts.join('\n')}</div></div>`, appliedLayout: 'Cards + Image' };
    }
  }

  // Image grid: 2+ images (or figures)
  const totalImages = figureCount > 0 ? figureCount : imageCount;
  if (totalImages >= 2 && hasHeading) {
    // Put headings/text on top, images in a grid below
    const topParts: string[] = [];
    const gridParts: string[] = [];

    const parts = splitTopLevel(html);
    for (const part of parts) {
      if (/<figure[^>]*>/.test(part) || (/<p[^>]*>\s*<img /.test(part))) {
        gridParts.push(part);
      } else {
        topParts.push(part);
      }
    }

    if (gridParts.length >= 2) {
      return { html: `${topParts.join('\n')}\n<div class="layout-image-grid">${gridParts.join('\n')}</div>`, appliedLayout: 'Image Grid' };
    }
  }

  // Text + Image: heading/text and exactly 1 image
  if (hasHeading && (imageCount === 1 || figureCount === 1)) {
    const bodyParts: string[] = [];
    const mediaParts: string[] = [];

    const parts = splitTopLevel(html);
    for (const part of parts) {
      if ((/<p[^>]*>\s*<img /.test(part) || /<figure[^>]*>/.test(part)) && mediaParts.length === 0) {
        mediaParts.push(part);
      } else {
        bodyParts.push(part);
      }
    }

    if (mediaParts.length === 1 && bodyParts.length > 0) {
      return { html: `<div class="layout-text-image"><div class="layout-body">${bodyParts.join('\n')}</div><div class="layout-media">${mediaParts.join('\n')}</div></div>`, appliedLayout: 'Text + Image' };
    }
  }

  return { html };
}

/**
 * Splits HTML into top-level element chunks.
 * Simple approach: split on closing tags that are followed by opening tags.
 */
function splitTopLevel(html: string): string[] {
  const parts: string[] = [];
  // Match top-level block elements
  const regex = /<(?:h[1-6]|p|div|ul|ol|blockquote|pre|figure|table)[^>]*>[\s\S]*?<\/(?:h[1-6]|p|div|ul|ol|blockquote|pre|figure|table)>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    parts.push(match[0]);
  }
  return parts.length > 0 ? parts : [html];
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

export function parsePresentation(markdown: string, layoutRules?: LayoutRuleInput[]): ParsedPresentation {
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
    html = transformImageCaptions(html);

    // Use rule engine if rules provided, otherwise fall back to hardcoded
    let appliedLayout: string | undefined;
    if (layoutRules && layoutRules.length > 0) {
      const result = applyAutoLayoutWithRules(html, layoutRules);
      html = result.html;
      appliedLayout = result.appliedLayout;
    } else {
      const result = applyAutoLayout(html);
      html = result.html;
      appliedLayout = result.appliedLayout;
    }

    // Advance line offset: raw content lines + 1 for the --- separator
    lineOffset += raw.split('\n').length + 1;

    return { content, html, notes, lineOffset: slideLineOffset, appliedLayout };
  });

  return { slides };
}
