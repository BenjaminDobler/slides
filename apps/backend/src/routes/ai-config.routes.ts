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
    select: { id: true, providerName: true, model: true },
  });
  res.json(configs.map((c) => ({ ...c, hasKey: true })));
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { providerName, apiKey, model } = req.body as CreateAiProviderConfigDto;
    if (!providerName || !apiKey) {
      res.status(400).json({ error: 'providerName and apiKey required' });
      return;
    }

    const apiKeyEncrypted = encrypt(apiKey);
    const config = await prisma.aiProviderConfig.upsert({
      where: { userId_providerName: { userId: req.userId!, providerName } },
      update: { apiKeyEncrypted, model },
      create: { userId: req.userId!, providerName, apiKeyEncrypted, model },
    });
    res.json({ id: config.id, providerName: config.providerName, model: config.model, hasKey: true });
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
