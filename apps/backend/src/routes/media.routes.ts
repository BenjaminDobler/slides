import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /^(image|video|audio)\//;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image, video, and audio files are allowed'));
    }
  },
});

const router = Router();
router.use(authMiddleware);

// List user's media
router.get('/', async (req: AuthRequest, res: Response) => {
  const media = await prisma.media.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(
    media.map((m) => ({
      ...m,
      url: `/api/uploads/${m.filename}`,
    }))
  );
});

// Upload
router.post('/', upload.single('file'), async (req: AuthRequest, res: Response) => {
  const file = (req as any).file as Express.Multer.File;
  if (!file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  const record = await prisma.media.create({
    data: {
      userId: req.userId!,
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    },
  });

  res.status(201).json({
    ...record,
    url: `/api/uploads/${record.filename}`,
  });
});

// Delete
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const media = await prisma.media.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!media) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // Remove file from disk
  const filePath = path.join(UPLOADS_DIR, media.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await prisma.media.delete({ where: { id: media.id } });
  res.status(204).send();
});

export default router;
