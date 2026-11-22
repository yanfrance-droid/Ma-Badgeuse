import fs from 'fs';
import path from 'path';
import { db, rawDb, closeDatabase, reopenDatabase } from '../database';

const DEFAULT_BACKUP_DIR = path.resolve(__dirname, '../../backups');
const BACKUP_DIR = process.env.BACKUP_DIR || DEFAULT_BACKUP_DIR;

// Assurer que le dossier de backup existe
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Nettoie les anciennes sauvegardes au-delà du nombre maximum conservé
 */
export function cleanOldBackups(maxKeep: number = 14): void {
  try {
    const backups = listBackups();
    // Les sauvegardes d'urgence (préfixées par 'safety_') sont sacrées : on ne les purge JAMAIS automatiquement
    const routineBackups = backups.filter((b) => !b.filename.startsWith('safety_'));
    if (routineBackups.length > maxKeep) {
      const toRemove = routineBackups.slice(maxKeep);
      for (const b of toRemove) {
        const p = path.join(BACKUP_DIR, b.filename);
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
          console.log(`[Backup] Ancienne sauvegarde purgée (${b.filename})`);
        }
      }
    }
  } catch (err) {
    console.warn('[Backup] Erreur lors de la rotation des sauvegardes:', err);
  }
}

/**
 * Crée une sauvegarde à chaud de la base SQLite
 */
export async function createDatabaseBackup(prefix: string = 'backup'): Promise<{ filename: string; filepath: string; sizeBytes: number }> {
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const filename = `${prefix}_${timestamp}.sqlite`;
  const filepath = path.join(BACKUP_DIR, filename);

  // SQLite VACUUM INTO permet de créer une copie cohérente à chaud même sous WAL
  try {
    const sanitizedPath = filepath.replace(/\\/g, '/');
    await db.exec(`VACUUM INTO '${sanitizedPath}'`);
  } catch (err) {
    console.warn('[Backup] VACUUM INTO a échoué, tentative de fallback par checkpoint + copie:', err);
    try {
      await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {}
    const dbPath = (rawDb as any).filename;
    fs.copyFileSync(dbPath, filepath);
  }

  const stats = fs.statSync(filepath);
  cleanOldBackups(14);

  return {
    filename,
    filepath,
    sizeBytes: stats.size
  };
}

/**
 * Liste toutes les sauvegardes existantes
 */
export function listBackups(): Array<{ filename: string; sizeBytes: number; createdAt: string; isAuto: boolean }> {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.sqlite') || f.endsWith('.db'));
  return files
    .map((filename) => {
      const fullPath = path.join(BACKUP_DIR, filename);
      const stats = fs.statSync(fullPath);
      return {
        filename,
        sizeBytes: stats.size,
        createdAt: stats.mtime.toISOString(),
        isAuto: filename.startsWith('auto_backup_')
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Restaure une sauvegarde depuis un fichier en fermant proprement la connexion
 */
export async function restoreBackupFromFile(sourceFilePath: string): Promise<void> {
  const dbPath = (rawDb as any).filename;

  // 1. Créer un backup d'urgence avant écrasement
  await createDatabaseBackup('safety_pre_restore');

  // 2. Vider le journal WAL et fermer la connexion active pour libérer les verrous Windows
  try {
    await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (e) {
    console.warn('[Backup] checkpoint avant restauration a échoué (non bloquant):', e);
  }
  await closeDatabase();

  // 3. Remplacer le fichier database.sqlite
  fs.copyFileSync(sourceFilePath, dbPath);

  // 4. Supprimer les journaux WAL résiduels pour repartir d'un état propre
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

  // 5. Réouvrir la connexion SQLite
  await reopenDatabase();

  // 6. Réactiver le mode WAL et les contraintes
  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);
}

/**
 * Diagnostic de santé complet de la base de données
 */
export async function getDatabaseStatus(userId?: number): Promise<{
  integrity: string;
  databaseSizeKb: number;
  walSizeKb: number;
  totalEntries: number;
  totalRegularizations: number;
  totalPeriods: number;
  totalBackups: number;
  lastBackupDate: string | null;
}> {
  const dbPath = (rawDb as any).filename;
  const walPath = `${dbPath}-wal`;

  let integrity = 'ok';
  try {
    const res = await db.get<any>(`PRAGMA integrity_check`);
    integrity = res && res.integrity_check ? res.integrity_check : 'ok';
  } catch (e: any) {
    integrity = e.message;
  }

  let dbSize = 0;
  if (fs.existsSync(dbPath)) {
    dbSize = Math.round(fs.statSync(dbPath).size / 1024);
  }

  let walSize = 0;
  if (fs.existsSync(walPath)) {
    walSize = Math.round(fs.statSync(walPath).size / 1024);
  }

  const entriesCount = userId
    ? (await db.get<any>(`SELECT COUNT(*) as count FROM daily_entries WHERE user_id = ?`, [userId]))?.count || 0
    : (await db.get<any>(`SELECT COUNT(*) as count FROM daily_entries`))?.count || 0;
  const regCount = userId
    ? (await db.get<any>(`SELECT COUNT(*) as count FROM regularizations WHERE user_id = ?`, [userId]))?.count || 0
    : (await db.get<any>(`SELECT COUNT(*) as count FROM regularizations`))?.count || 0;
  const periodsCount = userId
    ? (await db.get<any>(`SELECT COUNT(*) as count FROM periods WHERE user_id = ?`, [userId]))?.count || 0
    : (await db.get<any>(`SELECT COUNT(*) as count FROM periods`))?.count || 0;

  const backups = listBackups();
  const lastBackup = backups.length > 0 ? backups[0].createdAt : null;

  return {
    integrity,
    databaseSizeKb: dbSize,
    walSizeKb: walSize,
    totalEntries: entriesCount,
    totalRegularizations: regCount,
    totalPeriods: periodsCount,
    totalBackups: backups.length,
    lastBackupDate: lastBackup
  };
}

/**
 * Optimise la base : force le checkpoint WAL, compacte les pages et met à jour les stats
 */
export async function optimizeDatabase(): Promise<{ success: boolean; message: string }> {
  try {
    await db.exec(`PRAGMA wal_checkpoint(TRUNCATE)`);
    await db.exec(`VACUUM`);
    await db.exec(`PRAGMA optimize`);
    return { success: true, message: "Base de données compactée et optimisée avec succès." };
  } catch (err: any) {
    throw new Error(`Erreur lors de l'optimisation : ${err.message}`);
  }
}

/**
 * Remise à zéro isolée du compte d'un utilisateur uniquement.
 * GARANTIE ABSOLUE : Ne touche STRICTEMENT JAMAIS aux données des autres utilisateurs.
 */
export async function resetUserData(userId: number): Promise<{ success: boolean; message: string; safetyBackup: string }> {
  if (!userId) {
    throw new Error("Identifiant utilisateur manquant.");
  }

  // 1. Sauvegarde d'urgence immédiate sur le serveur avant effacement
  const safetyBackup = await createDatabaseBackup(`safety_user_${userId}`);

  // 2. Transaction SQL avec clause WHERE user_id = ? stricte
  await db.exec('BEGIN TRANSACTION');
  try {
    await db.run('DELETE FROM daily_entries WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM periods WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM regularizations WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM monthly_targets WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM audit_logs WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM user_settings WHERE user_id = ?', [userId]);
    await db.exec('COMMIT');
  } catch (txErr) {
    await db.exec('ROLLBACK');
    throw txErr;
  }

  // 3. Compacter le fichier SQLite
  try {
    await db.exec(`PRAGMA wal_checkpoint(TRUNCATE)`);
    await db.exec(`VACUUM`);
  } catch {}

  return {
    success: true,
    message: "Votre espace personnel a été remis à zéro avec succès. Les données des autres membres de la famille restent 100% intactes.",
    safetyBackup: safetyBackup.filename
  };
}

/**
 * Remise à zéro complète du serveur (Tous les comptes - Admin uniquement)
 */
export async function resetServerAll(confirmation: string): Promise<{ success: boolean; message: string; safetyBackup: string }> {
  if (confirmation !== 'RESET_SERVEUR') {
    throw new Error("Veuillez taper 'RESET_SERVEUR' pour confirmer la remise à zéro complète de tout le serveur.");
  }

  const safetyBackup = await createDatabaseBackup('safety_pre_reset_all');

  await db.exec('BEGIN TRANSACTION');
  try {
    await db.exec(`
      DELETE FROM daily_entries;
      DELETE FROM periods;
      DELETE FROM regularizations;
      DELETE FROM monthly_targets;
      DELETE FROM audit_logs;
      DELETE FROM sqlite_sequence WHERE name IN ('daily_entries', 'periods', 'regularizations', 'monthly_targets', 'audit_logs');
    `);
    await db.exec('COMMIT');
  } catch (txErr) {
    await db.exec('ROLLBACK');
    throw txErr;
  }

  try {
    await db.exec(`PRAGMA wal_checkpoint(TRUNCATE)`);
    await db.exec(`VACUUM`);
  } catch {}

  return {
    success: true,
    message: "Toutes les données de tous les comptes ont été remises à zéro.",
    safetyBackup: safetyBackup.filename
  };
}

/**
 * Démarre le planificateur de sauvegarde automatique sur le serveur
 * (1 sauvegarde par jour, conservées 14 jours)
 */
export function startAutoBackupSchedule(): void {
  console.log('[AutoBackup] Planificateur de sauvegarde automatique activé (Rotation 14 jours).');

  // Vérification au démarrage : si pas de backup dans les dernières 24h, en créer une
  const checkAndRun = async () => {
    try {
      const backups = listBackups();
      const now = Date.now();
      const lastBackup = backups.find((b) => b.isAuto || b.filename.startsWith('backup_'));

      let shouldBackup = false;
      if (!lastBackup) {
        shouldBackup = true;
      } else {
        const lastTime = new Date(lastBackup.createdAt).getTime();
        const diffHours = (now - lastTime) / (1000 * 60 * 60);
        if (diffHours >= 24) {
          shouldBackup = true;
        }
      }

      if (shouldBackup) {
        console.log('[AutoBackup] Création de la sauvegarde automatique quotidienne...');
        const res = await createDatabaseBackup('auto_backup');
        console.log(`[AutoBackup] Sauvegarde créée avec succès : ${res.filename} (${Math.round(res.sizeBytes / 1024)} Ko)`);
      }
    } catch (err) {
      console.warn('[AutoBackup] Erreur lors de la sauvegarde automatique :', err);
    }
  };

  // Lancement après 5 secondes au démarrage
  setTimeout(checkAndRun, 5000);

  // Puis vérification toutes les heures
  setInterval(checkAndRun, 60 * 60 * 1000);
}
