import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../utils/prisma';
import { encrypt, decrypt } from '../utils/encryption';
import { createAIProvider } from '../services/ai/provider-factory';
import type { CreateAiProviderConfigDto, UpdateAiProviderConfigDto } from '@slides/shared-types';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res: Response) => {
  const configs = await prisma.aiProviderConfig.findMany({
    where: { userId: req.userId },
    select: { id: true, providerName: true, model: true, baseUrl: true },
  });
  res.json(configs.map((c) => ({ ...c, hasKey: true })));
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { providerName, apiKey, model, baseUrl } = req.body as CreateAiProviderConfigDto;
    if (!providerName) {
      res.status(400).json({ error: 'providerName required' });
      return;
    }
    // API key is required unless baseUrl is provided (proxy mode)
    if (!apiKey && !baseUrl) {
      res.status(400).json({ error: 'apiKey or baseUrl required' });
      return;
    }

    // Use placeholder when using proxy without API key
    const effectiveApiKey = apiKey || 'not-needed';
    const apiKeyEncrypted = encrypt(effectiveApiKey);
    const config = await prisma.aiProviderConfig.upsert({
      where: { userId_providerName: { userId: req.userId!, providerName } },
      update: { apiKeyEncrypted, model, baseUrl },
      create: { userId: req.userId!, providerName, apiKeyEncrypted, model, baseUrl },
    });
    res.json({ id: config.id, providerName: config.providerName, model: config.model, baseUrl: config.baseUrl, hasKey: true });
  } catch {
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { apiKey, model, baseUrl } = req.body as UpdateAiProviderConfigDto;

    // Find existing config
    const existing = await prisma.aiProviderConfig.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Configuration not found' });
      return;
    }

    // Build update data
    const updateData: { model?: string; baseUrl?: string; apiKeyEncrypted?: string } = {};
    if (model !== undefined) updateData.model = model;
    if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
    if (apiKey) updateData.apiKeyEncrypted = encrypt(apiKey);

    const config = await prisma.aiProviderConfig.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ id: config.id, providerName: config.providerName, model: config.model, baseUrl: config.baseUrl, hasKey: true });
  } catch {
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.aiProviderConfig.deleteMany({
    where: { id: req.params.id, userId: req.userId },
  });
  res.status(204).send();
});

router.get('/:provider/models', async (req: AuthRequest, res: Response) => {
  try {
    const { provider } = req.params;

    const config = await prisma.aiProviderConfig.findFirst({
      where: { userId: req.userId, providerName: provider },
    });

    if (!config) {
      res.status(400).json({ error: `No ${provider} configuration found. Add your API key in settings.` });
      return;
    }

    const apiKey = decrypt(config.apiKeyEncrypted);
    const aiProvider = createAIProvider(provider, apiKey, config.baseUrl || undefined, config.model || undefined);

    if (!aiProvider) {
      res.status(400).json({ error: `Unknown provider: ${provider}` });
      return;
    }

    const models = await aiProvider.listModels();
    res.json(models);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list models' });
  }
});

export default router;
