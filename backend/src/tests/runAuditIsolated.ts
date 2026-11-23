/**
 * Isolation des tests : à importer EN PREMIER dans chaque fichier de test.
 * Chaque fichier (exécuté dans son propre processus par node:test) reçoit une
 * base et un dossier de sauvegardes neufs dans le dossier temporaire du système.
 * La base réelle (data/database.sqlite) n'est jamais ouverte.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

export const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-badgeuse-test-'));
process.env.DB_PATH = path.join(TEST_ROOT, 'test.sqlite');
process.env.BACKUP_DIR = path.join(TEST_ROOT, 'backups');
process.env.FRONTEND_DIST = path.join(TEST_ROOT, 'no-frontend');
process.env.COOKIE_SECURE = 'false';

/** Supprime le dossier temporaire du test (appelé à la fin de chaque fichier). */
export function cleanupTestRoot(): void {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}
