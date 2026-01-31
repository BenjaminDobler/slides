#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BACKEND_URL = process.env.SLIDES_BACKEND_URL || 'http://localhost:3333';
const AUTH_TOKEN = process.env.SLIDES_AUTH_TOKEN || '';

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
