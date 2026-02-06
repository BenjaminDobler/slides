import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../utils/prisma';
import { encrypt } from '../utils/encryption';
import type { CreateAiProviderConfigDto } from '@slides/shared-types';

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

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  await prisma.aiProviderConfig.deleteMany({
    where: { id: req.params.id, userId: req.userId },
  });
  res.status(204).send();
});

export default router;
