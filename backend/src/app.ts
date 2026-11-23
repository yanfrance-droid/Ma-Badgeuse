import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { HttpError } from './http';
import { securityHeaders, sameOriginWrites } from './security';
import { loadSession, requireAuth, requirePasswordUpToDate } from './middleware/auth';
import { requireAdmin } from './middleware/adminAuth';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { entriesRouter } from './routes/entries';
import { periodsRouter } from './routes/periods';
import { regularizationsRouter } from './routes/regularizations';
import { targetsRouter } from './routes/targets';
import { statusRouter } from './routes/status';
import { auditRouter } from './routes/audit';
import { summaryRouter } from './routes/summary';
import { backupRouter } from './routes/backup';
import { settingsRouter } from './routes/settings';
import { exportRouter } from './routes/export';

function readVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    return String(pkg.version);
  } catch {
    return 'inconnue';
  }
}

export const APP_VERSION = readVersion();

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // Derrière un proxy HTTPS (Caddy, Traefik, Nginx...), indiquer TRUST_PROXY=1
  // pour que l'adresse IP réelle et le protocole HTTPS soient reconnus.
  if (process.env.TRUST_PROXY) {
    const value = process.env.TRUST_PROXY;
    app.set('trust proxy', /^\d+$/.test(value) ? Number(value) : value);
  }

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(securityHeaders);
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'Ma Badgeuse', version: APP_VERSION });
  });

  app.use('/api', sameOriginWrites(allowedOrigins), loadSession);

  // Connexion, inscription, déconnexion : accessibles sans session.
  app.use('/api/auth', authRouter);

  // Toutes les autres routes exigent une session et un mot de passe à jour.
  app.use('/api', requireAuth, requirePasswordUpToDate);
  app.use('/api/admin', requireAdmin, adminRouter);
  app.use('/api/status', statusRouter);
  app.use('/api/entries', entriesRouter);
  app.use('/api/periods', periodsRouter);
  app.use('/api/regularizations', regularizationsRouter);
  app.use('/api/targets', targetsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/summary', summaryRouter);
  app.use('/api/backup', backupRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/export', exportRouter);

  // Route d'API inconnue : vraie erreur 404 en JSON (et non la page d'accueil).
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Route introuvable.')));

  // Fichiers du frontend compilé (image Docker, ou après npm run build:all).
  const clientBuildPath = process.env.FRONTEND_DIST || path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath, { index: false }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
  }

  // Gestionnaire d'erreurs unique : message clair pour les erreurs prévues,
  // message générique (et détail dans les journaux) pour le reste.
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ success: false, error: err.message, code: err.code });
      return;
    }
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (50 Mo au maximum).' : "Envoi de fichier invalide.";
      res.status(status).json({ success: false, error: message });
      return;
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ success: false, error: 'Requête trop volumineuse.' });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ success: false, error: 'Corps de requête JSON invalide.' });
      return;
    }
    console.error(`[Erreur serveur] ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ success: false, error: 'Erreur interne du serveur. Réessayez ; si le problème persiste, prévenez l’administrateur.' });
  });

  return app;
}
