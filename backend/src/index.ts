import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { initDatabase } from './database';
import { startAutoBackupSchedule } from './services/backupService';
import { entriesRouter } from './routes/entries';
import { periodsRouter } from './routes/periods';
import { regularizationsRouter } from './routes/regularizations';
import { targetsRouter } from './routes/targets';
import { statusRouter } from './routes/status';
import { auditRouter } from './routes/audit';
import { summaryRouter } from './routes/summary';
import { backupRouter } from './routes/backup';
import { settingsRouter } from './routes/settings';
import { authRouter } from './routes/auth';
import { authMiddleware } from './middleware/auth';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Healthcheck pour Docker & Proxmox
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'Ma Badgeuse',
    version: '0.1.0',
    mode: 'WAL',
    timestamp: new Date().toISOString()
  });
});

// Enregistrement des routes API publiques
app.use('/api/auth', authRouter);
app.use('/api/status', statusRouter);

// Middleware d'authentification pour toutes les routes de données
app.use('/api', authMiddleware);

// Enregistrement des routes API protégées
app.use('/api/entries', entriesRouter);
app.use('/api/periods', periodsRouter);
app.use('/api/regularizations', regularizationsRouter);
app.use('/api/targets', targetsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/backup', backupRouter);
app.use('/api/settings', settingsRouter);

// Service des fichiers statiques du frontend (mode production Docker)
const clientBuildPath = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Gestion globale des erreurs
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({ success: false, error: err.message || 'Erreur interne du serveur.' });
});

// Démarrage et initialisation de la base
async function startServer() {
  try {
    await initDatabase();
    startAutoBackupSchedule();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`=========================================`);
      console.log(`🕒 Ma Badgeuse - Serveur démarré`);
      console.log(`📍 Port : ${PORT}`);
      console.log(`💾 Base : SQLite Mode WAL`);
      console.log(`🌐 Accès : http://localhost:${PORT}`);
      console.log(`=========================================`);
    });
  } catch (err) {
    console.error('Erreur critique au démarrage du serveur :', err);
    process.exit(1);
  }
}

startServer();
