import crypto from 'crypto';
import { db } from '../database';
import { User } from '../types';

// Rate limiting mémoire pour contrer les attaques par force brute (max 5 échecs / 15 min)
const failedAttemptsMap = new Map<string, { count: number; lockUntil: number }>();

function checkRateLimit(identifier: string): void {
  const key = identifier.toLowerCase().trim();
  const entry = failedAttemptsMap.get(key);
  if (entry) {
    if (Date.now() < entry.lockUntil) {
      const waitMinutes = Math.ceil((entry.lockUntil - Date.now()) / (60 * 1000));
      throw new Error(`Compte temporairement verrouillé pour des raisons de sécurité suite à plusieurs échecs. Veuillez réessayer dans ${waitMinutes} minute(s).`);
    } else if (Date.now() >= entry.lockUntil) {
      failedAttemptsMap.delete(key);
    }
  }
}

function recordFailedAttempt(identifier: string): void {
  const key = identifier.toLowerCase().trim();
  const entry = failedAttemptsMap.get(key) || { count: 0, lockUntil: 0 };
  entry.count += 1;
  if (entry.count >= 5) {
    entry.lockUntil = Date.now() + 15 * 60 * 1000; // Verrouillage 15 minutes
  }
  failedAttemptsMap.set(key, entry);
}

function clearFailedAttempts(identifier: string): void {
  const key = identifier.toLowerCase().trim();
  failedAttemptsMap.delete(key);
}

/**
 * Hache un mot de passe en utilisant PBKDF2 avec un sel aléatoire de 16 octets.
 * PRÉSERVE STRICTEMENT la casse des majuscules et minuscules.
 */
export function hashPassword(password: string, existingSalt?: string): string {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Vérifie un mot de passe avec rétrocompatibilité complète :
 * 1. Format PBKDF2 salé (`salt:hash`)
 * 2. Format historique SHA-256 (`64 car. hex`)
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  if (storedHash.includes(':')) {
    const [salt, expectedHash] = storedHash.split(':');
    const computed = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256').toString('hex');
    return computed === expectedHash;
  }
  // Rétrocompatibilité avec les anciens hachages SHA-256 :
  const legacyHashLower = crypto.createHash('sha256').update(password.trim().toLowerCase()).digest('hex');
  const legacyHashExact = crypto.createHash('sha256').update(password).digest('hex');
  return storedHash === legacyHashLower || storedHash === legacyHashExact;
}

export function hashString(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function register(data: {
  username: string;
  displayName?: string;
  password: string;
  securityQuestion: string;
  securityAnswer: string;
}): Promise<{ user: User; token: string }> {
  const cleanUsername = data.username ? data.username.trim() : '';
  if (!cleanUsername) {
    throw new Error("L'identifiant est obligatoire.");
  }
  if (!data.password || data.password.trim().length < 4) {
    throw new Error("Le mot de passe doit comporter au moins 4 caractères.");
  }
  if (!data.securityQuestion || !data.securityQuestion.trim()) {
    throw new Error("La question secrète est obligatoire.");
  }
  if (!data.securityAnswer || !data.securityAnswer.trim()) {
    throw new Error("La réponse à la question secrète est obligatoire.");
  }

  // Vérifier si l'utilisateur existe déjà (insensible à la casse)
  const existing = await db.get<any>(`SELECT id FROM users WHERE LOWER(username) = ?`, [cleanUsername.toLowerCase()]);
  if (existing) {
    throw new Error(`L'identifiant "${cleanUsername}" est déjà utilisé. Veuillez en choisir un autre.`);
  }

  const displayName = data.displayName?.trim() || cleanUsername;
  const passwordHash = hashPassword(data.password);
  const securityQuestion = data.securityQuestion.trim();
  const securityAnswerHash = hashString(data.securityAnswer);

  const result = await db.run(`
    INSERT INTO users (username, display_name, password_hash, security_question, security_answer_hash)
    VALUES (?, ?, ?, ?, ?)
  `, [cleanUsername, displayName, passwordHash, securityQuestion, securityAnswerHash]);

  const userId = result.lastID;

  // Créer les paramètres par défaut pour ce nouvel utilisateur
  const defaultSettings: Array<[string, string]> = [
    ['habitual_start_time', '10:45'],
    ['habitual_end_time', '14:45'],
    ['habitual_break_minutes', '0'],
    ['habitual_expected_hours', '4.0'],
    ['default_monthly_target', '120'],
    ['annual_target_hours', '800'],
    ['agent_name', displayName]
  ];

  for (const [key, val] of defaultSettings) {
    await db.run(`
      INSERT OR REPLACE INTO user_settings (user_id, setting_key, setting_value)
      VALUES (?, ?, ?)
    `, [userId, key, val]);
  }

  // Créer une session persistante (1 an)
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 365);
  const expiresAtStr = expiresAt.toISOString();

  await db.run(`
    INSERT INTO user_sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `, [token, userId, expiresAtStr]);

  return {
    user: {
      id: userId,
      username: cleanUsername,
      display_name: displayName
    },
    token
  };
}

export async function login(data: {
  username: string;
  password: string;
}): Promise<{ user: User; token: string }> {
  const cleanUsername = data.username ? data.username.trim() : '';
  if (!cleanUsername || !data.password) {
    throw new Error("Identifiant et mot de passe requis.");
  }

  checkRateLimit(cleanUsername);

  const user = await db.get<any>(`SELECT * FROM users WHERE LOWER(username) = ?`, [cleanUsername.toLowerCase()]);
  if (!user) {
    recordFailedAttempt(cleanUsername);
    throw new Error("Identifiant ou mot de passe incorrect.");
  }

  if (!verifyPassword(data.password, user.password_hash)) {
    recordFailedAttempt(cleanUsername);
    throw new Error("Identifiant ou mot de passe incorrect.");
  }

  clearFailedAttempts(cleanUsername);

  // Mise à niveau automatique du hash vers PBKDF2 salé si l'ancien format SHA-256 sans sel est détecté
  if (!user.password_hash.includes(':')) {
    const upgradedHash = hashPassword(data.password);
    await db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [upgradedHash, user.id]);
  }

  // Créer une session persistante (1 an)
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 365);
  const expiresAtStr = expiresAt.toISOString();

  await db.run(`
    INSERT INTO user_sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `, [token, user.id, expiresAtStr]);

  return {
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name
    },
    token
  };
}

export async function getMe(token: string): Promise<User | null> {
  if (!token) return null;
  const nowIso = new Date().toISOString();
  const session = await db.get<any>(`
    SELECT s.user_id, u.username, u.display_name
    FROM user_sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `, [token, nowIso]);

  if (!session) return null;

  return {
    id: session.user_id,
    username: session.username,
    display_name: session.display_name
  };
}

export async function logout(token: string): Promise<void> {
  if (token) {
    await db.run(`DELETE FROM user_sessions WHERE token = ?`, [token]);
  }
}

export async function getSecurityQuestion(username: string): Promise<{ username: string; display_name: string; security_question: string }> {
  const cleanUsername = username ? username.trim().toLowerCase() : '';
  const user = await db.get<any>(`SELECT username, display_name, security_question FROM users WHERE LOWER(username) = ?`, [cleanUsername]);
  if (!user) {
    throw new Error(`Aucun compte trouvé avec l'identifiant "${username}".`);
  }
  return {
    username: user.username,
    display_name: user.display_name,
    security_question: user.security_question
  };
}

export async function resetPassword(data: {
  username: string;
  securityAnswer: string;
  newPassword: string;
}): Promise<{ user: User; token: string }> {
  const cleanUsername = data.username ? data.username.trim().toLowerCase() : '';
  checkRateLimit(`reset_${cleanUsername}`);

  const user = await db.get<any>(`SELECT * FROM users WHERE LOWER(username) = ?`, [cleanUsername]);
  if (!user) {
    throw new Error(`Aucun compte trouvé avec l'identifiant "${data.username}".`);
  }

  const answerHash = hashString(data.securityAnswer);
  if (answerHash !== user.security_answer_hash) {
    recordFailedAttempt(`reset_${cleanUsername}`);
    throw new Error("Réponse à la question secrète incorrecte.");
  }

  clearFailedAttempts(`reset_${cleanUsername}`);

  if (!data.newPassword || data.newPassword.trim().length < 4) {
    throw new Error("Le nouveau mot de passe doit comporter au moins 4 caractères.");
  }

  const newHash = hashPassword(data.newPassword);
  await db.run(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newHash, user.id]);

  // Supprimer les anciennes sessions
  await db.run(`DELETE FROM user_sessions WHERE user_id = ?`, [user.id]);

  // Créer une nouvelle session
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 365);
  const expiresAtStr = expiresAt.toISOString();

  await db.run(`
    INSERT INTO user_sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `, [token, user.id, expiresAtStr]);

  return {
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name
    },
    token
  };
}

export async function listAllUsers(): Promise<Array<{ id: number; username: string; display_name: string; created_at: string }>> {
  return db.all<any>(`SELECT id, username, display_name, created_at FROM users ORDER BY id ASC`);
}

export async function verifyAdminPin(pin: string): Promise<boolean> {
  if (!pin) return false;
  const row = await db.get<{ setting_value: string }>(
    `SELECT setting_value FROM app_settings WHERE setting_key = 'admin_pin_hash'`
  );
  const targetHash = row?.setting_value || hashString('1234');
  return hashString(pin) === targetHash || verifyPassword(pin, targetHash);
}

export async function changeAdminPin(oldPin: string, newPin: string): Promise<void> {
  const isValid = await verifyAdminPin(oldPin);
  if (!isValid) {
    throw new Error("L'ancien code PIN administrateur est incorrect.");
  }
  if (!newPin || newPin.trim().length < 4) {
    throw new Error("Le nouveau code PIN doit comporter au moins 4 caractères.");
  }
  const newHash = hashString(newPin);
  await db.run(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES ('admin_pin_hash', ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`,
    [newHash]
  );
}

export async function deleteUserByAdmin(userIdToDelete: number): Promise<void> {
  if (userIdToDelete === 1) {
    throw new Error("Impossible de supprimer le compte initial (Maman).");
  }
  await db.exec('BEGIN TRANSACTION');
  try {
    await db.run(`DELETE FROM daily_entries WHERE user_id = ?`, [userIdToDelete]);
    await db.run(`DELETE FROM periods WHERE user_id = ?`, [userIdToDelete]);
    await db.run(`DELETE FROM regularizations WHERE user_id = ?`, [userIdToDelete]);
    await db.run(`DELETE FROM monthly_targets WHERE user_id = ?`, [userIdToDelete]);
    await db.run(`DELETE FROM audit_logs WHERE user_id = ?`, [userIdToDelete]);
    await db.run(`DELETE FROM user_settings WHERE user_id = ?`, [userIdToDelete]);
    await db.run(`DELETE FROM user_sessions WHERE user_id = ?`, [userIdToDelete]);
    await db.run(`DELETE FROM users WHERE id = ?`, [userIdToDelete]);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}
