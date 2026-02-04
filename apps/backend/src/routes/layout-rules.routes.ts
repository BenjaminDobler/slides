import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const rules = await prisma.layoutRule.findMany({
    orderBy: { priority: 'asc' },
  });
  // Parse JSON strings into objects for the response
  const parsed = rules.map((r) => ({
    ...r,
    conditions: JSON.parse(r.conditions),
    transform: JSON.parse(r.transform),
  }));
  res.json(parsed);
});

router.get('/:id', async (req: Request, res: Response) => {
  const rule = await prisma.layoutRule.findUnique({
    where: { id: req.params.id },
  });
  if (!rule) {
    res.status(404).json({ error: 'Layout rule not found' });
    return;
  }
  res.json({
    ...rule,
    conditions: JSON.parse(rule.conditions),
    transform: JSON.parse(rule.transform),
  });
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, displayName, description, priority, enabled, conditions, transform, cssContent } = req.body;
    const rule = await prisma.layoutRule.create({
      data: {
        name,
        displayName,
        description,
        priority: priority ?? 100,
        enabled: enabled ?? true,
        conditions: JSON.stringify(conditions),
        transform: JSON.stringify(transform),
        cssContent,
        userId: req.userId!,
      },
    });
    res.status(201).json({
      ...rule,
      conditions: JSON.parse(rule.conditions),
      transform: JSON.parse(rule.transform),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.layoutRule.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Layout rule not found' });
      return;
    }
    if (existing.isDefault) {
      res.status(403).json({ error: 'Cannot modify default layout rules' });
      return;
    }
    if (existing.userId && existing.userId !== req.userId) {
      res.status(403).json({ error: 'Not your layout rule' });
      return;
    }
    const { displayName, description, priority, enabled, conditions, transform, cssContent } = req.body;
    const data: Record<string, unknown> = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (description !== undefined) data.description = description;
    if (priority !== undefined) data.priority = priority;
    if (enabled !== undefined) data.enabled = enabled;
    if (conditions !== undefined) data.conditions = JSON.stringify(conditions);
    if (transform !== undefined) data.transform = JSON.stringify(transform);
    if (cssContent !== undefined) data.cssContent = cssContent;

    const rule = await prisma.layoutRule.update({
      where: { id: req.params.id },
      data,
    });
    res.json({
      ...rule,
      conditions: JSON.parse(rule.conditions),
      transform: JSON.parse(rule.transform),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.layoutRule.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Layout rule not found' });
      return;
    }
    if (existing.isDefault) {
      res.status(403).json({ error: 'Cannot delete default layout rules' });
      return;
    }
    if (existing.userId && existing.userId !== req.userId) {
      res.status(403).json({ error: 'Not your layout rule' });
      return;
    }
    await prisma.layoutRule.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
