import path from 'path';
import fs from 'fs';

// 1. Définir un chemin de base de données de test dédié et isolé
const testDbPath = path.resolve(__dirname, '../../../data/test_audit.sqlite');
process.env.DB_PATH = testDbPath;
process.env.BACKUP_DIR = path.resolve(__dirname, '../../../data/test_backups');

function cleanupTestFiles() {
  const files = [
    testDbPath,
    `${testDbPath}-wal`,
    `${testDbPath}-shm`
  ];
  for (const f of files) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }
  // Nettoyer le dossier temporaire de test de backup
  const testBackupDir = process.env.BACKUP_DIR;
  if (testBackupDir && fs.existsSync(testBackupDir)) {
    try {
      fs.rmSync(testBackupDir, { recursive: true, force: true });
    } catch {}
  }
}

// Nettoyage avant exécution
cleanupTestFiles();

// 2. Importer dynamiquement la suite de tests APRÈS avoir positionné DB_PATH
import('./comprehensiveAudit.test.js')
  .then((mod) => mod.runComprehensiveAudit())
  .then((res) => {
    // Nettoyage après exécution
    cleanupTestFiles();
    if (res.failed > 0) {
      console.error(`\n❌ ÉCHEC DU BANC D'ESSAI : ${res.failed} test(s) échoué(s).\n`);
      process.exit(1);
    } else {
      console.log(`\n✨ BANC D'ESSAI RÉUSSI À 100% (La base réelle n'a pas été touchée).\n`);
      process.exit(0);
    }
  })
  .catch((err) => {
    cleanupTestFiles();
    console.error('Erreur critique pendant le banc d\'essai :', err);
    process.exit(1);
  });
