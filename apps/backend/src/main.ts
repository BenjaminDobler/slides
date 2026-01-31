import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import authRoutes from './routes/auth.routes';
import presentationsRoutes from './routes/presentations.routes';
import themesRoutes from './routes/themes.routes';
import aiRoutes from './routes/ai.routes';
import aiConfigRoutes from './routes/ai-config.routes';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api', (_req, res) => {
  res.send({ message: 'Slides API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/presentations', presentationsRoutes);
app.use('/api/themes', themesRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai-config', aiConfigRoutes);

const port = config.port;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/api`);
});
server.on('error', console.error);
