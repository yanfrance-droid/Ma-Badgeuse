import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { db, getDatabasePath, initDatabase, withDatabaseClosed } from '../database';
import { HttpError } from '../http';
import { purgeExpiredSessions } from './authService';

const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(__dirname, '../../backups');
/** Fichiers temporaires (envois, exports) : dans le dossier de sauvegarde, donc dans le volume Docker. */
export const BACKUP_TMP_DIR = path.join(BACKUP_DIR, 'tmp');

for (const dir of [BACKUP_DIR, BACKUP_TMP_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const ROUTINE_BACKUPS_TO_KEEP = 14;
const SAFETY_BACKUPS_TO_KEEP = 20;

export function getBackupDir(): string {
  return BACKUP_DIR;
}

export interface BackupInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  isAuto: boolean;
  isSafety: boolean;
}

export function listBackups(): BackupInfo[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.sqlite'))
    .map((filename) => {
      const stats = fs.statSync(path.join(BACKUP_DIR, filename));
      return {
        filename,
        sizeBytes: stats.size,
        createdAt: stats.mtime.toISOString(),
        isAuto: filename.startsWith('auto_backup_'),
        isSafety: filename.startsWith('safety')
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Rotation : garde les 14 dernières sauvegardes ordinaires et les 20 dernières
 * sauvegardes de sécurité (créées avant une restauration ou une remise à zéro).
 */
export function cleanOldBackups(): void {
  const all = listBackups();
  const groups: Array<[BackupInfo[], number]> = [
    [all.filter((b) => !b.isSafety), ROUTINE_BACKUPS_TO_KEEP],
    [all.filter((b) => b.isSafety), SAFETY_BACKUPS_TO_KEEP]
  ];
  for (const [items, keep] of groups) {
    for (const b of items.slice(keep)) {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, b.filename));
        console.log(`[Backup] Ancienne sauvegarde supprimée : ${b.filename}`);
      } catch (err) {
        console.warn(`[Backup] Suppression impossible de ${b.filename} :`, err);
      }
    }
  }
}

function timestamp(): string {
  // AAAAMMJJHHMMSSmmm : deux sauvegardes dans la même seconde ne s'écrasent plus.
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17);
}

/** Copie cohérente de la base, même en écriture (VACUUM INTO gère le mode WAL). */
async function vacuumInto(target: string): Promise<void> {
  const escaped = target.replace(/\\/g, '/').replace(/'/g, "''");
  await db.exec(`VACUUM INTO '${escaped}'`);
}

export async function createDatabaseBackup(prefix: string = 'backup'): Promise<{ filename: string; filepath: string; sizeBytes: number }> {
  const filename = `${prefix}_${timestamp()}.sqlite`;
  const filepath = path.join(BACKUP_DIR, filename);
  await vacuumInto(filepath);
  const { size } = fs.statSync(filepath);
  cleanOldBackups();
  return { filename, filepath, sizeBytes: size };
}

/** Instantané temporaire pour un téléchargement : supprimé par l'appelant après envoi. */
export async function createExportSnapshot(): Promise<string> {
  const filepath = path.join(BACKUP_TMP_DIR, `export_${timestamp()}.sqlite`);
  await vacuumInto(filepath);
  return filepath;
}

/** Résout le nom d'une sauvegarde existante, sans possibilité de sortir du dossier. */
export function resolveBackupFile(filename: unknown): string {
  if (typeof filename !== 'string' || !/^[A-Za-z0-9_.-]+\.sqlite$/.test(filename)) {
    throw new HttpError(400, 'Nom de sauvegarde invalide.');
  }
  const filepath = path.join(BACKUP_DIR, path.basename(filename));
  if (!fs.existsSync(filepath)) {
    throw new HttpError(404, 'Sauvegarde introuvable.');
  }
  return filepath;
}

const REQUIRED_TABLES = ['users', 'daily_entries', 'status_catalog', 'monthly_targets', 'regularizations'];

/**
 * Vérifie qu'un fichier est une base « Ma Badgeuse » intacte, sans toucher à la base active :
 * en-tête SQLite, ouverture en lecture seule, PRAGMA integrity_check, tables attendues.
 */
export async function validateBackupFile(filepath: string): Promise<void> {
  const fd = fs.openSync(filepath, 'r');
  const header = Buffer.alloc(16);
  try {
    fs.readSync(fd, header, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (header.toString('latin1') !== 'SQLite format 3\u0000') {
    throw new HttpError(400, "Ce fichier n'est pas une base SQLite. Rien n'a été modifié.");
  }

  const candidate = await new Promise<sqlite3.Database>((resolve, reject) => {
    const conn = new sqlite3.Database(filepath, sqlite3.OPEN_READONLY, (err) => (err ? reject(err) : resolve(conn)));
  });
  const query = <T>(sql: string) =>
    new Promise<T[]>((resolve, reject) => candidate.all(sql, (err, rows) => (err ? reject(err) : resolve(rows as T[]))));
  try {
    const integrity = await query<{ integrity_check: string }>('PRAGMA integrity_check');
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      throw new HttpError(400, "Le fichier est endommagé (contrôle d'intégrité en échec). Rien n'a été modifié.");
    }
    const tables = (await query<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map((t) => t.name);
    const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t));
    if (missing.length > 0) {
      throw new HttpError(400, `Ce fichier n'est pas une sauvegarde de Ma Badgeuse (tables absentes : ${missing.join(', ')}). Rien n'a été modifié.`);
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "Le fichier n'a pas pu être lu comme une base SQLite. Rien n'a été modifié.");
  } finally {
    await new Promise<void>((resolve) => candidate.close(() => resolve()));
  }
}

function replaceDatabaseFile(source: string): void {
  const dbPath = getDatabasePath();
  fs.copyFileSync(source, dbPath);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

/**
 * Restaure une sauvegarde. Le fichier est validé avant toute modification ;
 * une sauvegarde de sécurité est créée ; la base restaurée est migrée au schéma
 * courant. En cas d'échec, la sauvegarde de sécurité est remise en place.
 * Toute l'opération s'exécute seule : aucune autre requête ne s'intercale.
 */
export async function restoreBackupFromFile(sourceFilePath: string): Promise<{ safetyBackup: string }> {
  await validateBackupFile(sourceFilePath);

  return db.exclusive(async () => {
    const safety = await createDatabaseBackup('safety_pre_restore');
    try {
      await withDatabaseClosed(async () => replaceDatabaseFile(sourceFilePath));
      await initDatabase();
    } catch (err) {
      console.error('[Backup] Échec de la restauration, retour à la sauvegarde de sécurité :', err);
      await withDatabaseClosed(async () => replaceDatabaseFile(safety.filepath));
      await initDatabase();
      throw new HttpError(500, "La restauration a échoué ; la base précédente a été remise en place.");
    }
    return { safetyBackup: safety.filename };
  });
}

export async function getDatabaseStatus(): Promise<{
  integrity: string;
  integrityOk: boolean;
  databaseSizeKb: number;
  walSizeKb: number;
  totalUsers: number;
  totalEntries: number;
  totalRegularizations: number;
  totalPeriods: number;
  totalBackups: number;
  lastBackupDate: string | null;
}> {
  const dbPath = getDatabasePath();
  let integrity = 'ok';
  try {
    const rows = await db.all<{ integrity_check: string }>('PRAGMA integrity_check');
    integrity = rows.map((r) => r.integrity_check).join('; ') || 'inconnue';
  } catch (err: any) {
    integrity = `vérification impossible : ${err?.message ?? err}`;
  }
  const sizeKb = (file: string) => (fs.existsSync(file) ? Math.round(fs.statSync(file).size / 1024) : 0);
  const count = async (table: string) => (await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM ${table}`))?.c ?? 0;
  const backups = listBackups();
  return {
    integrity,
    integrityOk: integrity === 'ok',
    databaseSizeKb: sizeKb(dbPath),
    walSizeKb: sizeKb(`${dbPath}-wal`),
    totalUsers: await count('users'),
    totalEntries: await count('daily_entries'),
    totalRegularizations: await count('regularizations'),
    totalPeriods: await count('periods'),
    totalBackups: backups.length,
    lastBackupDate: backups[0]?.createdAt ?? null
  };
}

export async function optimizeDatabase(): Promise<{ success: boolean; message: string }> {
  await db.exclusive(async () => {
    await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    await db.exec('VACUUM');
    await db.exec('PRAGMA optimize');
  });
  const purged = await purgeExpiredSessions();
  return { success: true, message: `Base compactée et optimisée (${purged} session(s) expirée(s) supprimée(s)).` };
}

async function compact(): Promise<void> {
  try {
    await db.exclusive(async () => {
      await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      await db.exec('VACUUM');
    });
  } catch (err) {
    // Le compactage est un confort : son échec ne remet pas en cause l'effacement déjà validé.
    console.warn('[Backup] Compactage après effacement impossible :', err);
  }
}

/**
 * Efface les données de travail d'un compte : pointages, périodes, régularisations,
 * objectifs mensuels et historique. Le compte et ses réglages sont conservés.
 * Une copie de toute la base est faite avant l'effacement (dossier des sauvegardes).
 */
export async function resetUserData(userId: number): Promise<{ success: boolean; message: string; safetyBackup: string }> {
  const safety = await createDatabaseBackup(`safety_user_${userId}`);
  await db.transaction(async () => {
    for (const table of ['daily_entries', 'periods', 'regularizations', 'monthly_targets', 'audit_logs']) {
      await db.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    }
  });
  await compact();
  return {
    success: true,
    message: 'Vos pointages, périodes, régularisations, objectifs et votre historique ont été effacés. Vos réglages et votre compte sont conservés. Les autres comptes ne sont pas touchés.',
    safetyBackup: safety.filename
  };
}

/**
 * Efface les données de travail de tous les comptes (administrateurs uniquement).
 * Les comptes, sessions, réglages et statuts sont conservés.
 */
export async function resetServerAll(confirmation: unknown): Promise<{ success: boolean; message: string; safetyBackup: string }> {
  if (confirmation !== 'RESET_SERVEUR') {
    throw new HttpError(400, "Tapez RESET_SERVEUR pour confirmer l'effacement des données de tous les comptes.");
  }
  const safety = await createDatabaseBackup('safety_server_reset');
  await db.transaction(async () => {
    for (const table of ['daily_entries', 'periods', 'regularizations', 'monthly_targets', 'audit_logs']) {
      await db.run(`DELETE FROM ${table}`);
    }
  });
  await compact();
  return {
    success: true,
    message: 'Les pointages, périodes, régularisations, objectifs et historiques de tous les comptes ont été effacés. Les comptes et leurs réglages sont conservés.',
    safetyBackup: safety.filename
  };
}

let autoBackupTimer: NodeJS.Timeout | null = null;
let firstCheckTimer: NodeJS.Timeout | null = null;

/** Sauvegarde automatique : une par jour au plus, vérifiée toutes les heures. */
export function startAutoBackupSchedule(): void {
  const runCheck = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const alreadyDone = listBackups().some((b) => b.isAuto && b.filename.startsWith(`auto_backup_${today}`));
      if (!alreadyDone) {
        const backup = await createDatabaseBackup('auto_backup');
        console.log(`[Backup] Sauvegarde automatique créée : ${backup.filename}`);
      }
      await purgeExpiredSessions();
    } catch (err) {
      console.error('[Backup] Échec de la sauvegarde automatique :', err);
    }
  };
  firstCheckTimer = setTimeout(runCheck, 5000);
  autoBackupTimer = setInterval(runCheck, 60 * 60 * 1000);
}

export function stopAutoBackupSchedule(): void {
  if (firstCheckTimer) clearTimeout(firstCheckTimer);
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  firstCheckTimer = null;
  autoBackupTimer = null;
}
