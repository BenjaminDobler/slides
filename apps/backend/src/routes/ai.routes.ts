import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../utils/prisma';
import { decrypt } from '../utils/encryption';
import { createAIProvider } from '../services/ai/provider-factory';
import type { AiGenerateDto, AiImproveDto, AiSuggestStyleDto, AiGenerateThemeDto, AiSpeakerNotesDto, AiGenerateDiagramDto, AiRewriteDto, AiOutlineToSlidesDto, AiVisualReviewDto, AiVisualImproveDto } from '@slides/shared-types';

const router = Router();
router.use(authMiddleware);

const SLIDE_FORMAT_GUIDE = `
SUPPORTED MARKDOWN SYNTAX:
- Standard markdown: headings (#, ##, ###), bold, italic, lists, links, images, code blocks, tables
- Slide separator: a line containing only '---' separates slides
- Card grid layout: a list where every item starts with **Title:** description renders as a styled card grid
- Mermaid diagrams: use \`\`\`mermaid code blocks (flowchart, sequenceDiagram, pie, graph, etc.)
- Speaker notes: wrap in <!-- notes --> and <!-- /notes --> (not shown in presentation)
- Image captions: an image followed by *italic text* on the next line renders as a figure with caption

AUTOMATIC LAYOUTS:
The system automatically detects content patterns and applies the best layout. Just write clean markdown:
- A slide with only a heading (+ optional subtitle) → centered hero layout
- A slide with heading + text + one image → side-by-side (text left, image right)
- A slide with heading + multiple images → heading on top, image grid below
- A slide with cards + images → cards on left, image on right
No special directives needed — just write the content naturally.

EXAMPLE - Card grid:
- **Feature A:** Description of feature A
- **Feature B:** Description of feature B
- **Feature C:** Description of feature C

EXAMPLE - Image with caption:
![Photo](https://example.com/photo.jpg)
*A beautiful sunset over the mountains*
`.trim();

async function getProviderForUser(userId: string, providerName: string) {
  const cfg = await prisma.aiProviderConfig.findUnique({
    where: { userId_providerName: { userId, providerName } },
  });
  if (!cfg) {
    throw new Error(`No ${providerName} configuration found. Add your API key in settings.`);
  }
  const apiKey = decrypt(cfg.apiKeyEncrypted);
  return createAIProvider(providerName, apiKey);
}

router.post('/generate', async (req: AuthRequest, res: Response) => {
  try {
    const { prompt, provider, context } = req.body as AiGenerateDto;
    const ai = await getProviderForUser(req.userId!, provider);

    const systemPrompt = `You are a presentation assistant. Generate markdown slides separated by '---'.
Each slide should be concise. Use the full range of supported layout features when appropriate.

${SLIDE_FORMAT_GUIDE}
${context ? `\nContext about the presentation:\n${context}` : ''}`;

    const content = await ai.generateContent(prompt, { systemPrompt });
    res.json({ content });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/improve', async (req: AuthRequest, res: Response) => {
  try {
    const { slideContent, provider, instruction } = req.body as AiImproveDto;
    const ai = await getProviderForUser(req.userId!, provider);

    const prompt = `Improve this slide content${instruction ? ` (${instruction})` : ''}:\n\n${slideContent}\n\nReturn only the improved markdown.`;
    const content = await ai.generateContent(prompt, {
      systemPrompt: 'You are a presentation design expert. Return only markdown.',
    });
    res.json({ content });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/suggest-style', async (req: AuthRequest, res: Response) => {
  try {
    const { content, provider } = req.body as AiSuggestStyleDto;
    const ai = await getProviderForUser(req.userId!, provider);

    const prompt = `Given this presentation content, suggest which theme would work best and why. Available themes: default, dark, minimal, corporate, creative.\n\n${content}`;
    const suggestion = await ai.generateContent(prompt, {
      systemPrompt: 'You are a presentation design expert. Be concise.',
    });
    res.json({ suggestion });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/generate-theme', async (req: AuthRequest, res: Response) => {
  try {
    const { description, provider, existingCss } = req.body as AiGenerateThemeDto;
    const ai = await getProviderForUser(req.userId!, provider);

    const systemPrompt = `You are a CSS theme designer for a presentation slide application.
Generate a complete CSS theme following this exact pattern. The theme name should be a kebab-case identifier derived from the description.

IMPORTANT: Return ONLY a JSON object with these fields: name, displayName, cssContent. No markdown, no explanation.

The cssContent must follow this selector pattern (replace THEME_NAME with your chosen name):

.slide-content[data-theme="THEME_NAME"], [data-theme="THEME_NAME"] .slide-content, [data-theme="THEME_NAME"] .slide {
  --slide-bg: #...; --slide-text: #...; --slide-heading: #...; --slide-accent: #...;
  background: var(--slide-bg); color: var(--slide-text); font-family: '...', sans-serif;
}
[data-theme="THEME_NAME"] h1, [data-theme="THEME_NAME"] h2, [data-theme="THEME_NAME"] h3 {
  font-family: '...', sans-serif; color: var(--slide-heading);
}
[data-theme="THEME_NAME"] code { background: #...; padding: 0.2em 0.4em; border-radius: 3px; }
[data-theme="THEME_NAME"] a { color: var(--slide-accent); }
[data-theme="THEME_NAME"] table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
[data-theme="THEME_NAME"] th, [data-theme="THEME_NAME"] td { padding: 0.6rem 1rem; text-align: left; border-bottom: 1px solid ...; }
[data-theme="THEME_NAME"] th { font-weight: 600; border-bottom-width: 2px; }
[data-theme="THEME_NAME"] .slide-card { background: ...; border: 1px solid ...; border-radius: 8px; padding: 1.2rem; }
[data-theme="THEME_NAME"] .slide-card-title { color: var(--slide-heading); font-weight: 600; }

You can add additional CSS rules for creative effects (gradients, shadows, etc.) but always use the [data-theme="THEME_NAME"] selector prefix.
${existingCss ? `\nHere is an existing theme CSS for reference:\n${existingCss}` : ''}`;

    const result = await ai.generateContent(`Create a theme: ${description}`, { systemPrompt });

    // Parse JSON from response
    let parsed: { name: string; displayName: string; cssContent: string };
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result);
    } catch {
      res.status(400).json({ error: 'AI returned invalid theme format' });
      return;
    }

    res.json(parsed);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/speaker-notes', async (req: AuthRequest, res: Response) => {
  try {
    const { slideContent, provider } = req.body as AiSpeakerNotesDto;
    const ai = await getProviderForUser(req.userId!, provider);

    const prompt = `Generate concise speaker notes for this slide:\n\n${slideContent}`;
    const notes = await ai.generateContent(prompt, {
      systemPrompt: 'You are a presentation coach. Generate concise, helpful speaker notes. Return only the notes text, no markdown formatting or headers.',
    });
    res.json({ notes });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/generate-diagram', async (req: AuthRequest, res: Response) => {
  try {
    const { description, provider } = req.body as AiGenerateDiagramDto;
    const ai = await getProviderForUser(req.userId!, provider);

    const prompt = `Create a mermaid diagram for: ${description}`;
    const result = await ai.generateContent(prompt, {
      systemPrompt: 'You are a diagram expert. Return ONLY valid mermaid diagram syntax. No markdown code fences, no explanation — just the mermaid code starting with the diagram type (graph, sequenceDiagram, flowchart, etc.).',
    });
    // Strip any accidental code fences
    const mermaid = result.replace(/^```(?:mermaid)?\n?/g, '').replace(/\n?```$/g, '').trim();
    res.json({ mermaid });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/rewrite', async (req: AuthRequest, res: Response) => {
  try {
    const { slideContent, provider, audience } = req.body as AiRewriteDto;
    const ai = await getProviderForUser(req.userId!, provider);

    const prompt = `Rewrite this slide content for a ${audience} audience:\n\n${slideContent}\n\nReturn only the rewritten markdown.`;
    const content = await ai.generateContent(prompt, {
      systemPrompt: `You are a presentation expert. Rewrite slide content for the specified audience while preserving the structure. Return only markdown.\n\n${SLIDE_FORMAT_GUIDE}`,
    });
    res.json({ content });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/outline-to-slides', async (req: AuthRequest, res: Response) => {
  try {
    const { outline, provider } = req.body as AiOutlineToSlidesDto;
    const ai = await getProviderForUser(req.userId!, provider);

    const prompt = `Convert this outline into a full presentation:\n\n${outline}`;
    const content = await ai.generateContent(prompt, {
      systemPrompt: `You are a presentation assistant. Convert the outline into well-structured markdown slides separated by '---'.
Make each slide focused and visually appealing. Use the full range of layout features when appropriate. Return only the markdown.

${SLIDE_FORMAT_GUIDE}`,
    });
    res.json({ content });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/visual-review', async (req: AuthRequest, res: Response) => {
  try {
    const { slideContent, screenshot, provider } = req.body as AiVisualReviewDto;
    const ai = await getProviderForUser(req.userId!, provider);

    const prompt = `Here is a screenshot of a presentation slide and its markdown source.

Markdown source:
\`\`\`
${slideContent}
\`\`\`

Please review this slide visually. Comment on:
- Layout and spacing issues (text overflow, cramped cards, poor alignment)
- Content density (too much text for one slide?)
- Readability and visual hierarchy
- Suggestions for improvement

Be specific and actionable.`;

    const review = await ai.generateContent(prompt, {
      systemPrompt: 'You are a presentation design expert. Review the slide screenshot and provide specific, actionable feedback. Be concise.',
      imageBase64: screenshot,
      imageMimeType: 'image/png',
      maxTokens: 1500,
    });
    res.json({ review });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/visual-improve', async (req: AuthRequest, res: Response) => {
  try {
    const { slideContent, screenshot, provider, instruction } = req.body as AiVisualImproveDto;
    const ai = await getProviderForUser(req.userId!, provider);

    const prompt = `Here is a screenshot of a presentation slide and its markdown source.

Markdown source:
\`\`\`
${slideContent}
\`\`\`

${instruction ? `Instruction: ${instruction}\n\n` : ''}Improve this slide. If the content is too dense, split it into multiple slides separated by '---'.
Fix any visual issues you see in the screenshot (overflow, cramped layout, poor hierarchy).

${SLIDE_FORMAT_GUIDE}

Return ONLY the improved markdown, nothing else.`;

    const content = await ai.generateContent(prompt, {
      systemPrompt: 'You are a presentation design expert. Improve the slide content based on the visual screenshot. Return only markdown. If the slide is too dense, split into multiple slides separated by ---.',
      imageBase64: screenshot,
      imageMimeType: 'image/png',
      maxTokens: 3000,
    });
    res.json({ content });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
