import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config/env';
import authRoutes from './routes/auth.routes';
import presentationsRoutes from './routes/presentations.routes';
import themesRoutes from './routes/themes.routes';
import aiRoutes from './routes/ai.routes';
import aiConfigRoutes from './routes/ai-config.routes';
import mediaRoutes from './routes/media.routes';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve uploaded media files
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/api/uploads', express.static(uploadsDir));

app.get('/api', (_req, res) => {
  res.send({ message: 'Slides API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/presentations', presentationsRoutes);
app.use('/api/themes', themesRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai-config', aiConfigRoutes);
app.use('/api/media', mediaRoutes);

const port = config.port;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/api`);
});
server.on('error', console.error);
