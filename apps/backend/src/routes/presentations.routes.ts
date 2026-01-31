import { Router, Response } from 'express';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import type { CreatePresentationDto, UpdatePresentationDto } from '@slides/shared-types';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res: Response) => {
  const presentations = await prisma.presentation.findMany({
    where: { userId: req.userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, theme: true, createdAt: true, updatedAt: true },
  });
  res.json(presentations);
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const { title, content, theme } = req.body as CreatePresentationDto;
  const presentation = await prisma.presentation.create({
    data: { title, content: content || '', theme: theme || 'default', userId: req.userId! },
  });
  res.status(201).json(presentation);
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const presentation = await prisma.presentation.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!presentation) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(presentation);
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { title, content, theme } = req.body as UpdatePresentationDto;
  try {
    const presentation = await prisma.presentation.updateMany({
      where: { id: req.params.id, userId: req.userId },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(theme !== undefined && { theme }),
      },
    });
    if (presentation.count === 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const updated = await prisma.presentation.findUnique({ where: { id: req.params.id } });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Update failed' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const result = await prisma.presentation.deleteMany({
    where: { id: req.params.id, userId: req.userId },
  });
  if (result.count === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.status(204).send();
});

export default router;
