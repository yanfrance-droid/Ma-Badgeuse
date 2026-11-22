import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { adminMiddleware } from '../middleware/adminAuth';
import {
  createDatabaseBackup,
  listBackups,
  restoreBackupFromFile,
  getDatabaseStatus,
  optimizeDatabase,
  resetUserData,
  resetServerAll
} from '../services/backupService';

// Upload sécurisé avec limite stricte de taille à 50 Mo
const upload = multer({
  dest: path.resolve(__dirname, '../../backups/tmp'),
  limits: { fileSize: 50 * 1024 * 1024 }
});

export const backupRouter = Router();

/**
 * POST /api/backup/create
 * Crée une sauvegarde à chaud de la base de données (ADMIN UNIQUEMENT)
 */
backupRouter.post('/create', adminMiddleware, async (_req: Request, res: Response) => {
  try {
    const backup = await createDatabaseBackup();
    res.json({ success: true, message: "Sauvegarde créée avec succès.", data: backup });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/backup/list
 * Liste toutes les sauvegardes existantes (ADMIN UNIQUEMENT)
 */
backupRouter.get('/list', adminMiddleware, async (_req: Request, res: Response) => {
  try {
    const backups = listBackups();
    res.json({ success: true, data: backups });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/backup/export-current
 * Télécharge directement un snapshot de la base SQLite active (ADMIN UNIQUEMENT)
 */
backupRouter.get('/export-current', adminMiddleware, async (_req: Request, res: Response) => {
  try {
    const backup = await createDatabaseBackup();
    res.download(backup.filepath, `ma_badgeuse_${backup.filename}`);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/backup/download/:filename
 * Télécharge un fichier de sauvegarde précis (ADMIN UNIQUEMENT)
 */
backupRouter.get('/download/:filename', adminMiddleware, (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const backupDir = process.env.BACKUP_DIR || path.resolve(__dirname, '../../backups');
    const filepath = path.join(backupDir, path.basename(filename));

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, error: "Fichier introuvable." });
    }

    res.download(filepath, filename);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/backup/restore/:filename
 * Restaure une sauvegarde existante (ADMIN UNIQUEMENT)
 */
backupRouter.post('/restore/:filename', adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const backupDir = process.env.BACKUP_DIR || path.resolve(__dirname, '../../backups');
    const filepath = path.join(backupDir, path.basename(filename));

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, error: "Sauvegarde introuvable." });
    }

    await restoreBackupFromFile(filepath);
    res.json({ success: true, message: `Sauvegarde ${filename} restaurée avec succès.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/backup/upload-restore
 * Permet d'uploader un fichier .sqlite depuis le smartphone / PC et de le restaurer (ADMIN UNIQUEMENT)
 */
backupRouter.post('/upload-restore', adminMiddleware, upload.single('database_file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "Aucun fichier reçu." });
    }

    await restoreBackupFromFile(req.file.path);
    // Nettoyer le fichier temporaire
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({ success: true, message: "Base de données importée et restaurée avec succès." });
  } catch (err: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/backup/status
 * Diagnostic et santé de la base de données
 */
backupRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await getDatabaseStatus(req.userId);
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/backup/optimize
 * Optimisation, VACUUM et checkpoint WAL (ADMIN UNIQUEMENT)
 */
backupRouter.post('/optimize', adminMiddleware, async (_req: Request, res: Response) => {
  try {
    const result = await optimizeDatabase();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/backup/reset-my-data
 * Remise à zéro isolée du compte de l'utilisateur connecté
 * Accessible à TOUT utilisateur pour son PROPRE compte (WHERE user_id = req.userId)
 */
backupRouter.post('/reset-my-data', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const { confirmation } = req.body;
    if (confirmation !== 'RESET') {
      return res.status(400).json({ success: false, error: "Veuillez taper 'RESET' pour confirmer la remise à zéro de vos heures." });
    }
    const result = await resetUserData(userId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/backup/reset-server-all
 * Remise à zéro totale du serveur (Tous les comptes - ADMIN UNIQUEMENT)
 */
backupRouter.post('/reset-server-all', adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { confirmation } = req.body;
    const result = await resetServerAll(confirmation);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/backup/reset
 * Alias pour remise à zéro personnelle
 */
backupRouter.post('/reset', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const { confirmation } = req.body;
    if (confirmation !== 'RESET') {
      return res.status(400).json({ success: false, error: "Veuillez taper 'RESET' pour confirmer." });
    }
    const result = await resetUserData(userId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
