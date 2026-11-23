import dotenv from 'dotenv';
dotenv.config();

import { closeDatabase, initDatabase } from './database';
import { startAutoBackupSchedule, stopAutoBackupSchedule } from './services/backupService';
import { APP_VERSION, createApp } from './app';

const PORT = Number(process.env.PORT) || 3000;
// Dans le conteneur Docker, 0.0.0.0 est nécessaire ; c'est docker-compose qui
// choisit sur quelle adresse de l'hôte le port est publié (BIND_ADDRESS).
const HOST = process.env.HOST || '0.0.0.0';

async function startServer(): Promise<void> {
  await initDatabase();
  startAutoBackupSchedule();
  const server = createApp().listen(PORT, HOST, () => {
    console.log(`[Ma Badgeuse ${APP_VERSION}] Serveur démarré sur http://${HOST}:${PORT}`);
  });

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[Ma Badgeuse] ${signal} reçu : arrêt propre en cours...`);
    stopAutoBackupSchedule();
    server.close(async () => {
      try {
        await closeDatabase();
      } catch (err) {
        console.error('[Ma Badgeuse] Fermeture de la base :', err);
      }
      process.exit(0);
    });
    // Filet de sécurité si des connexions restent ouvertes.
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Erreur critique au démarrage du serveur :', err);
  process.exit(1);
});
