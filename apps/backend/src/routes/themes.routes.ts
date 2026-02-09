import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const themes = await prisma.theme.findMany({
    select: { id: true, name: true, displayName: true, cssContent: true, centerContent: true, isDefault: true, userId: true },
    orderBy: { name: 'asc' },
  });
  res.json(themes);
});

router.get('/:idOrName', async (req: Request, res: Response) => {
  // Try by ID first, then by name
  let theme = await prisma.theme.findUnique({
    where: { id: req.params.idOrName },
  });
  if (!theme) {
    theme = await prisma.theme.findUnique({
      where: { name: req.params.idOrName },
    });
  }
  if (!theme) {
    res.status(404).json({ error: 'Theme not found' });
    return;
  }
  res.json(theme);
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, displayName, cssContent, centerContent } = req.body;
    const theme = await prisma.theme.create({
      data: { name, displayName, cssContent, centerContent: centerContent ?? true, userId: req.userId! },
    });
    res.status(201).json(theme);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.theme.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Theme not found' });
      return;
    }
    if (existing.isDefault) {
      res.status(403).json({ error: 'Cannot modify default themes' });
      return;
    }
    if (existing.userId && existing.userId !== req.userId) {
      res.status(403).json({ error: 'Not your theme' });
      return;
    }
    const { displayName, cssContent, centerContent } = req.body;
    const theme = await prisma.theme.update({
      where: { id: req.params.id },
      data: {
        ...(displayName && { displayName }),
        ...(cssContent && { cssContent }),
        ...(centerContent !== undefined && { centerContent }),
      },
    });
    res.json(theme);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.theme.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Theme not found' });
      return;
    }
    if (existing.isDefault) {
      res.status(403).json({ error: 'Cannot delete default themes' });
      return;
    }
    if (existing.userId && existing.userId !== req.userId) {
      res.status(403).json({ error: 'Not your theme' });
      return;
    }
    await prisma.theme.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
