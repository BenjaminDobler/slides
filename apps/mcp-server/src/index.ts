#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { extname, basename } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BACKEND_URL = process.env.SLIDES_BACKEND_URL || 'http://localhost:3332';
const AUTH_TOKEN = process.env.SLIDES_AUTH_TOKEN || '';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
};

function getMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${method} ${path} failed (${res.status}): ${err}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function apiUpload(path: string, formData: FormData) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API POST ${path} failed (${res.status}): ${err}`);
  }
  return res.json();
}

const SLIDE_FORMAT_GUIDE = `
Slides are written in Markdown. Each slide is separated by a line containing only "---".

Supported markdown features:
- Standard markdown: headings (#, ##, ###), bold, italic, lists, links, images, tables, code blocks
- Code syntax highlighting: use fenced code blocks with a language identifier
- Mermaid diagrams: use a fenced code block with "mermaid" as the language

Special layout directives:
- Two-column layout: wrap content in <!-- columns --> and <!-- split --> directives.
  Example:
    <!-- columns -->
    Left column content (text, images, etc.)

    <!-- split -->
    Right column content

- Card grid: create a bullet list where every item starts with **Title:** description.
  These are automatically rendered as styled card boxes.
  Example:
    - **Feature A:** Description of feature A
    - **Feature B:** Description of feature B

- Speaker notes: wrap notes in <!-- notes --> and <!-- /notes --> directives.
  These are only visible in presenter view, not on the slide itself.
  Example:
    <!-- notes -->
    Remember to mention the demo here.
    <!-- /notes -->
`.trim();

const server = new McpServer({
  name: 'slides',
  version: '1.0.0',
  description: 'A presentation slide editor. Presentations are written in Markdown with slides separated by "---". ' + SLIDE_FORMAT_GUIDE,
});

server.tool(
  'list_presentations',
  'List all presentations for the authenticated user',
  {},
  async () => {
    const presentations = await api('GET', '/api/presentations');
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(presentations, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'get_presentation',
  'Get a presentation by ID, including its full markdown content',
  { id: z.string().describe('Presentation ID') },
  async ({ id }) => {
    const presentation = await api('GET', `/api/presentations/${id}`);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(presentation, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'create_presentation',
  'Create a new presentation. Content is Markdown with slides separated by "---". ' + SLIDE_FORMAT_GUIDE,
  {
    title: z.string().describe('Presentation title'),
    content: z.string().describe('Markdown content with slides separated by ---. Supports headings, lists, code blocks, mermaid diagrams, <!-- columns -->/<!-- split --> for two-column layouts, and **Title:** description lists for card grids.'),
    theme: z.string().optional().describe('Theme name (default: "default"). Use list_themes to see available themes.'),
  },
  async ({ title, content, theme }) => {
    const presentation = await api('POST', '/api/presentations', {
      title,
      content,
      theme: theme || 'default',
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(presentation, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'update_presentation',
  'Update an existing presentation (title, content, or theme). Content follows the same Markdown slide format as create_presentation.',
  {
    id: z.string().describe('Presentation ID'),
    title: z.string().optional().describe('New title'),
    content: z.string().optional().describe('New full markdown content (replaces existing). Uses same format: slides separated by ---, supports layout directives.'),
    theme: z.string().optional().describe('New theme name. Use list_themes to see available themes.'),
  },
  async ({ id, title, content, theme }) => {
    const body: Record<string, string> = {};
    if (title) body.title = title;
    if (content) body.content = content;
    if (theme) body.theme = theme;
    const presentation = await api('PUT', `/api/presentations/${id}`, body);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(presentation, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'delete_presentation',
  'Delete a presentation by ID',
  { id: z.string().describe('Presentation ID') },
  async ({ id }) => {
    await api('DELETE', `/api/presentations/${id}`);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Presentation ${id} deleted successfully.`,
        },
      ],
    };
  }
);

server.tool(
  'list_themes',
  'List all available presentation themes',
  {},
  async () => {
    const themes = await api('GET', '/api/themes');
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(themes, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'add_slides',
  'Append new slides to the end of an existing presentation. The slides are added after a --- separator.',
  {
    id: z.string().describe('Presentation ID'),
    slides: z.string().describe('Markdown for the new slides to append. Multiple slides separated by ---. Supports all layout directives: <!-- columns -->/<!-- split -->, **Title:** card lists, ```mermaid diagrams, and <!-- notes -->.'),
  },
  async ({ id, slides }) => {
    const presentation = await api('GET', `/api/presentations/${id}`);
    const newContent = presentation.content.trimEnd() + '\n\n---\n\n' + slides;
    const updated = await api('PUT', `/api/presentations/${id}`, {
      content: newContent,
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(updated, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'list_media',
  'List all media files in the media library. Returns an array of media items with id, filename, originalName, mimeType, size, url, and createdAt.',
  {},
  async () => {
    const media = await api('GET', '/api/media');
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(media, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'upload_media',
  'Upload a media file to the media library from a local file path or a URL. Returns the media metadata and a markdown image snippet for use in slides.',
  {
    source: z.string().describe('Local file path or URL (http/https) of the media file to upload'),
    filename: z.string().optional().describe('Optional custom filename override. If not provided, the original filename is used.'),
  },
  async ({ source, filename }) => {
    let buffer: Buffer;
    let name: string;
    let mimeType: string;

    if (source.startsWith('http://') || source.startsWith('https://')) {
      const res = await fetch(source);
      if (!res.ok) {
        throw new Error(`Failed to download ${source}: ${res.status} ${res.statusText}`);
      }
      buffer = Buffer.from(await res.arrayBuffer());
      const urlPath = new URL(source).pathname;
      name = filename || basename(urlPath) || 'download';
      const contentType = res.headers.get('content-type');
      mimeType = contentType?.split(';')[0].trim() || getMimeType(name);
    } else {
      buffer = await readFile(source);
      name = filename || basename(source);
      mimeType = getMimeType(name);
    }

    const file = new File([buffer], name, { type: mimeType });
    const formData = new FormData();
    formData.append('file', file);

    const media = await apiUpload('/api/media', formData);
    const markdownSnippet = `![${media.originalName || name}](${media.url})`;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ ...media, markdownSnippet }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'delete_media',
  'Delete a media file from the media library by its ID',
  { id: z.string().describe('Media file ID') },
  async ({ id }) => {
    await api('DELETE', `/api/media/${id}`);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Media ${id} deleted successfully.`,
        },
      ],
    };
  }
);

server.tool(
  'list_layout_rules',
  'List all layout rules. Layout rules define how slide content is automatically arranged (e.g., hero layout, text+image split, image grid). Rules are checked in priority order; the first matching rule is applied.',
  {},
  async () => {
    const rules = await api('GET', '/api/layout-rules');
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(rules, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'create_layout_rule',
  'Create a custom layout rule. A rule has conditions (when to apply), a transform (how to rearrange HTML), and CSS (styling for the layout classes).',
  {
    name: z.string().describe('Unique rule name (slug format, e.g. "my-layout")'),
    displayName: z.string().describe('Human-readable name'),
    description: z.string().optional().describe('Description of what this rule does'),
    priority: z.number().optional().describe('Priority (lower = checked first, default: 100)'),
    conditions: z.string().describe('JSON string of LayoutConditions object. Fields: hasHeading (bool), imageCount ({eq/gte/lte/gt: number}), figureCount, h3Count, textParagraphCount, hasCards (bool), hasList (bool), hasCodeBlock (bool), hasBlockquote (bool). All optional, AND logic.'),
    transform: z.string().describe('JSON string of LayoutTransform object. Type is one of: "wrap", "split-two", "split-top-bottom", "group-by-heading". Each type has specific options.'),
    cssContent: z.string().describe('CSS rules for the layout classes used by the transform'),
  },
  async ({ name, displayName, description, priority, conditions, transform, cssContent }) => {
    const rule = await api('POST', '/api/layout-rules', {
      name,
      displayName,
      description,
      priority: priority ?? 100,
      conditions: JSON.parse(conditions),
      transform: JSON.parse(transform),
      cssContent,
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(rule, null, 2),
        },
      ],
    };
  }
);

server.tool(
  'delete_layout_rule',
  'Delete a custom layout rule by ID. Default (built-in) rules cannot be deleted.',
  { id: z.string().describe('Layout rule ID') },
  async ({ id }) => {
    await api('DELETE', `/api/layout-rules/${id}`);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Layout rule ${id} deleted successfully.`,
        },
      ],
    };
  }
);

async function main() {
  if (!AUTH_TOKEN) {
    console.error(
      'Warning: SLIDES_AUTH_TOKEN not set. API calls will fail with 401.'
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
