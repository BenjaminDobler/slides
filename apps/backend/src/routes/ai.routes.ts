import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../utils/prisma';
import { decrypt } from '../utils/encryption';
import { createAIProvider } from '../services/ai/provider-factory';
import type { AiGenerateDto, AiImproveDto, AiSuggestStyleDto, AiGenerateThemeDto } from '@slides/shared-types';

const router = Router();
router.use(authMiddleware);

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
Each slide should be concise. Use headings, bullet points, and code blocks.
You can use mermaid diagrams with \`\`\`mermaid blocks.
${context ? `Context about the presentation:\n${context}` : ''}`;

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

export default router;
