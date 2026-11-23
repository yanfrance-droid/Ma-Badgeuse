/**
 * Secours : génère un mot de passe temporaire pour un compte, depuis le serveur.
 * Utile si l'unique administrateur a oublié son mot de passe.
 *
 *   Docker : docker exec -it ma-badgeuse node backend/dist/scripts/resetPassword.js <identifiant>
 *   Local  : npm --prefix backend run reset-password -- <identifiant>
 *
 * Le compte devra choisir un nouveau mot de passe à sa prochaine connexion.
 */
import dotenv from 'dotenv';
dotenv.config();

import { closeDatabase, db, initDatabase } from '../database';
import { resetUserPassword, setUserAdmin } from '../services/authService';

async function main(): Promise<void> {
  const username = (process.argv[2] || '').trim().toLowerCase();
  const makeAdmin = process.argv.includes('--admin');
  if (!username) {
    console.error('Usage : resetPassword <identifiant> [--admin]');
    process.exitCode = 1;
    return;
  }
  await initDatabase();
  try {
    const user = await db.get<{ id: number; username: string }>(`SELECT id, username FROM users WHERE LOWER(username) = ?`, [username]);
    if (!user) {
      console.error(`Aucun compte « ${username} ».`);
      process.exitCode = 1;
      return;
    }
    const { temporaryPassword } = await resetUserPassword(user.id);
    if (makeAdmin) {
      await setUserAdmin(0, user.id, true);
    }
    console.log(`Mot de passe temporaire pour « ${user.username} » : ${temporaryPassword}`);
    console.log('Il devra être changé à la prochaine connexion. Toutes les sessions de ce compte ont été fermées.');
    if (makeAdmin) console.log('Le compte a aussi reçu les droits administrateur.');
  } finally {
    await closeDatabase();
  }
}

main().catch((err) => {
  console.error('Échec :', err);
  process.exitCode = 1;
});
