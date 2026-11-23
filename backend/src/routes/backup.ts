import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { requireAdmin } from '../middleware/adminAuth';
import { asyncHandler, badRequest, requireUserId } from '../http';
import {
  BACKUP_TMP_DIR,
  createDatabaseBackup,
  createExportSnapshot,
  getDatabaseStatus,
  listBackups,
  optimizeDatabase,
  resetServerAll,
  resetUserData,
  resolveBackupFile,
  restoreBackupFromFile
} from '../services/backupService';

const upload = multer({
  dest: BACKUP_TMP_DIR,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.sqlite' || ext === '.db') cb(null, true);
    else cb(badRequest('Seuls les fichiers .sqlite ou .db sont acceptés.'));
  }
});

function removeQuietly(file: string | undefined): void {
  if (file && fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
    } catch (err) {
      console.warn('[Backup] Fichier temporaire non supprimé :', file, err);
    }
  }
}

export const backupRouter = Router();

/**
 * POST /api/backup/reset-my-data
 * Efface les données de travail du compte connecté (tout utilisateur, pour lui-même).
 */
backupRouter.post(
  '/reset-my-data',
  asyncHandler(async (req, res) => {
    if (req.body?.confirmation !== 'RESET') {
      throw badRequest('Tapez RESET pour confirmer la remise à zéro de vos données.');
    }
    res.json(await resetUserData(requireUserId(req)));
  })
);

// Toutes les routes suivantes sont réservées aux administrateurs.
backupRouter.use(requireAdmin);

backupRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await getDatabaseStatus() });
  })
);

backupRouter.get(
  '/list',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: listBackups() });
  })
);

backupRouter.post(
  '/create',
  asyncHandler(async (_req, res) => {
    const backup = await createDatabaseBackup();
    res.status(201).json({ success: true, message: 'Sauvegarde créée.', data: { filename: backup.filename, sizeBytes: backup.sizeBytes } });
  })
);

/** Téléchargement d'un instantané de la base active, sans laisser de copie sur le serveur. */
backupRouter.get(
  '/export-current',
  asyncHandler(async (_req, res, next) => {
    const snapshot = await createExportSnapshot();
    const name = `ma_badgeuse_${path.basename(snapshot).replace(/^export_/, '')}`;
    res.download(snapshot, name, (err) => {
      removeQuietly(snapshot);
      if (err && !res.headersSent) next(err);
    });
  })
);

backupRouter.get(
  '/download/:filename',
  asyncHandler(async (req, res) => {
    const filepath = resolveBackupFile(req.params.filename);
    res.download(filepath, path.basename(filepath));
  })
);

backupRouter.post(
  '/restore/:filename',
  asyncHandler(async (req, res) => {
    const filepath = resolveBackupFile(req.params.filename);
    const result = await restoreBackupFromFile(filepath);
    res.json({ success: true, message: `Sauvegarde ${path.basename(filepath)} restaurée.`, safetyBackup: result.safetyBackup });
  })
);

backupRouter.post(
  '/upload-restore',
  upload.single('database_file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Aucun fichier reçu.');
    try {
      const result = await restoreBackupFromFile(req.file.path);
      res.json({ success: true, message: 'Base importée et restaurée.', safetyBackup: result.safetyBackup });
    } finally {
      removeQuietly(req.file.path);
    }
  })
);

backupRouter.post(
  '/optimize',
  asyncHandler(async (_req, res) => {
    res.json(await optimizeDatabase());
  })
);

backupRouter.post(
  '/reset-server-all',
  asyncHandler(async (req, res) => {
    res.json(await resetServerAll(req.body?.confirmation));
  })
);
