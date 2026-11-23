import crypto from 'crypto';
import { promisify } from 'util';
import { db } from '../database';
import { User } from '../types';
import { HttpError, badRequest, conflict, notFound } from '../http';
import { DEFAULT_USER_SETTINGS, PASSWORD_MIN_LENGTH, SESSION_DURATION_DAYS } from '../defaults';

const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions
) => Promise<Buffer>;

// Paramètres scrypt (≈ 16 Mo de mémoire, quelques dizaines de ms par calcul).
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;

// ----------------------------------------------------------------------------
// Mots de passe
// ----------------------------------------------------------------------------

/** Hache un mot de passe avec scrypt et un sel aléatoire. Format : scrypt$N$r$p$sel$hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && bufA.length > 0 && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Vérifie un mot de passe. Accepte aussi les formats historiques (PBKDF2 `sel:hash`
 * et SHA-256 sans sel), qui sont convertis en scrypt à la connexion suivante.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;

  if (storedHash.startsWith('scrypt$')) {
    const [, n, r, p, saltHex, hashHex] = storedHash.split('$');
    const computed = await scryptAsync(password, Buffer.from(saltHex, 'hex'), hashHex.length / 2, {
      N: Number(n),
      r: Number(r),
      p: Number(p)
    });
    return safeEqualHex(computed.toString('hex'), hashHex);
  }

  if (storedHash.includes(':')) {
    const [salt, expected] = storedHash.split(':');
    const computed = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256').toString('hex');
    return safeEqualHex(computed, expected);
  }

  const legacyExact = crypto.createHash('sha256').update(password).digest('hex');
  const legacyLower = crypto.createHash('sha256').update(password.trim().toLowerCase()).digest('hex');
  return safeEqualHex(legacyExact, storedHash) || safeEqualHex(legacyLower, storedHash);
}

function needsRehash(storedHash: string): boolean {
  return !storedHash.startsWith(`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$`);
}

export function validateNewPassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    throw badRequest(`Le mot de passe doit comporter au moins ${PASSWORD_MIN_LENGTH} caractères.`);
  }
  if (password.length > 200) {
    throw badRequest('Le mot de passe ne doit pas dépasser 200 caractères.');
  }
  return password;
}

function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string') {
    throw badRequest("L'identifiant est obligatoire.");
  }
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(username)) {
    throw badRequest("L'identifiant doit faire 2 à 40 caractères : lettres minuscules, chiffres, point, tiret ou souligné.");
  }
  return username;
}

function normalizeDisplayName(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || value.trim().length > 60) {
    throw badRequest('Le nom affiché ne doit pas dépasser 60 caractères.');
  }
  return value.trim() || fallback;
}

/** Mot de passe temporaire lisible, communiqué par l'administrateur. */
export function generateTemporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(14);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 7)}-${out.slice(7)}`;
}

// ----------------------------------------------------------------------------
// Sessions : le jeton n'est jamais stocké en clair, seule son empreinte l'est.
// ----------------------------------------------------------------------------

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sessionExpiry(): string {
  return new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await db.run(`INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, ?)`, [
    hashToken(token),
    userId,
    sessionExpiry()
  ]);
  return token;
}

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  is_admin: number;
  must_change_password: number;
  created_at?: string;
}

function toUser(row: Pick<UserRow, 'id' | 'username' | 'display_name' | 'is_admin' | 'must_change_password'> & { created_at?: string }): User {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    is_admin: Boolean(row.is_admin),
    must_change_password: Boolean(row.must_change_password),
    created_at: row.created_at
  };
}

/** Retrouve l'utilisateur d'une session valide et prolonge la session (expiration glissante). */
export async function getUserFromSession(token: string | null): Promise<User | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = hashToken(token);
  const nowIso = new Date().toISOString();
  const row = await db.get<UserRow & { expires_at: string }>(
    `SELECT u.id, u.username, u.display_name, u.is_admin, u.must_change_password, s.expires_at
     FROM user_sessions s JOIN users u ON s.user_id = u.id
     WHERE s.token = ? AND s.expires_at > ?`,
    [tokenHash, nowIso]
  );
  if (!row) return null;

  // Prolongation au plus une fois par jour pour limiter les écritures.
  const remainingMs = new Date(row.expires_at).getTime() - Date.now();
  if (remainingMs < (SESSION_DURATION_DAYS - 1) * 24 * 60 * 60 * 1000) {
    await db.run(`UPDATE user_sessions SET expires_at = ? WHERE token = ?`, [sessionExpiry(), tokenHash]);
  }
  return toUser(row);
}

export async function deleteSession(token: string | null): Promise<void> {
  if (token) {
    await db.run(`DELETE FROM user_sessions WHERE token = ?`, [hashToken(token)]);
  }
}

export async function purgeExpiredSessions(): Promise<number> {
  const result = await db.run(`DELETE FROM user_sessions WHERE expires_at <= ?`, [new Date().toISOString()]);
  return result.changes;
}

// ----------------------------------------------------------------------------
// Comptes
// ----------------------------------------------------------------------------

export async function countUsers(): Promise<number> {
  const row = await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM users`);
  return row?.c ?? 0;
}

export async function isRegistrationOpen(): Promise<boolean> {
  const row = await db.get<{ setting_value: string }>(`SELECT setting_value FROM app_settings WHERE setting_key = 'registration_open'`);
  return row?.setting_value === '1';
}

export async function setRegistrationOpen(open: boolean): Promise<void> {
  await db.run(
    `INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES ('registration_open', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`,
    [open ? '1' : '0']
  );
}

/**
 * Crée un compte. Le tout premier compte du serveur devient administrateur.
 * `mustChangePassword` est utilisé quand l'administrateur crée le compte d'un tiers.
 */
export async function createUser(data: {
  username: unknown;
  displayName?: unknown;
  password: unknown;
  mustChangePassword?: boolean;
}): Promise<User> {
  const username = normalizeUsername(data.username);
  const displayName = normalizeDisplayName(data.displayName, username);
  const password = validateNewPassword(data.password);
  const passwordHash = await hashPassword(password);

  return db.transaction(async () => {
    const existing = await db.get(`SELECT id FROM users WHERE LOWER(username) = ?`, [username]);
    if (existing) {
      throw conflict('Cet identifiant est déjà utilisé. Veuillez en choisir un autre.');
    }
    const isFirstUser = (await countUsers()) === 0;
    const result = await db.run(
      `INSERT INTO users (username, display_name, password_hash, is_admin, must_change_password)
       VALUES (?, ?, ?, ?, ?)`,
      [username, displayName, passwordHash, isFirstUser ? 1 : 0, data.mustChangePassword ? 1 : 0]
    );
    const userId = result.lastID;

    const initialSettings: Record<string, string> = { ...DEFAULT_USER_SETTINGS, agent_name: displayName };
    for (const [key, value] of Object.entries(initialSettings)) {
      await db.run(`INSERT OR REPLACE INTO user_settings (user_id, setting_key, setting_value) VALUES (?, ?, ?)`, [
        userId,
        key,
        value
      ]);
    }

    return toUser({
      id: userId,
      username,
      display_name: displayName,
      is_admin: isFirstUser ? 1 : 0,
      must_change_password: data.mustChangePassword ? 1 : 0
    });
  });
}

/**
 * Vérifie l'identifiant et le mot de passe. Le message d'échec est le même que
 * le compte existe ou non. Si le mot de passe ne respecte plus la politique
 * actuelle (ex. ancien mot de passe de 4 caractères), un changement est exigé.
 */
export async function authenticate(usernameInput: unknown, password: unknown): Promise<User> {
  if (typeof usernameInput !== 'string' || typeof password !== 'string' || !usernameInput.trim() || !password) {
    throw badRequest('Identifiant et mot de passe requis.');
  }
  if (usernameInput.length > 100 || password.length > 200) {
    throw new HttpError(401, 'Identifiant ou mot de passe incorrect.');
  }
  const username = usernameInput.trim().toLowerCase();
  const row = await db.get<UserRow>(`SELECT * FROM users WHERE LOWER(username) = ?`, [username]);

  // Un calcul est fait même si le compte n'existe pas, pour ne pas révéler son existence par le temps de réponse.
  const valid = row ? await verifyPassword(password, row.password_hash) : (await hashPassword(password), false);
  if (!row || !valid) {
    throw new HttpError(401, 'Identifiant ou mot de passe incorrect.');
  }

  const weakPassword = password.length < PASSWORD_MIN_LENGTH;
  if (needsRehash(row.password_hash) || (weakPassword && !row.must_change_password)) {
    const upgraded = needsRehash(row.password_hash) ? await hashPassword(password) : row.password_hash;
    await db.run(
      `UPDATE users SET password_hash = ?, must_change_password = CASE WHEN ? THEN 1 ELSE must_change_password END WHERE id = ?`,
      [upgraded, weakPassword ? 1 : 0, row.id]
    );
    if (weakPassword) row.must_change_password = 1;
  }
  return toUser(row);
}

export async function changePassword(userId: number, currentPassword: unknown, newPasswordInput: unknown): Promise<void> {
  const row = await db.get<UserRow>(`SELECT * FROM users WHERE id = ?`, [userId]);
  if (!row) throw notFound('Compte introuvable.');
  if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, row.password_hash))) {
    throw new HttpError(401, 'Le mot de passe actuel est incorrect.');
  }
  const newPassword = validateNewPassword(newPasswordInput);
  if (newPassword === currentPassword) {
    throw badRequest("Le nouveau mot de passe doit être différent de l'ancien.");
  }
  const newHash = await hashPassword(newPassword);
  await db.run(
    `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [newHash, userId]
  );
}

/** Supprime toutes les sessions d'un compte, sauf éventuellement celle en cours. */
export async function revokeSessions(userId: number, exceptToken: string | null = null): Promise<void> {
  if (exceptToken) {
    await db.run(`DELETE FROM user_sessions WHERE user_id = ? AND token <> ?`, [userId, hashToken(exceptToken)]);
  } else {
    await db.run(`DELETE FROM user_sessions WHERE user_id = ?`, [userId]);
  }
}

// ----------------------------------------------------------------------------
// Administration des comptes
// ----------------------------------------------------------------------------

export async function listUsers(): Promise<User[]> {
  const rows = await db.all<UserRow>(
    `SELECT id, username, display_name, is_admin, must_change_password, created_at FROM users ORDER BY id ASC`
  );
  return rows.map(toUser);
}

async function countAdmins(): Promise<number> {
  const row = await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM users WHERE is_admin = 1`);
  return row?.c ?? 0;
}

/** Génère un mot de passe temporaire pour un compte et déconnecte ses sessions. */
export async function resetUserPassword(userId: number): Promise<{ user: User; temporaryPassword: string }> {
  const row = await db.get<UserRow>(`SELECT * FROM users WHERE id = ?`, [userId]);
  if (!row) throw notFound('Compte introuvable.');
  const temporaryPassword = generateTemporaryPassword();
  const hash = await hashPassword(temporaryPassword);
  await db.transaction(async () => {
    await db.run(`UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
      hash,
      userId
    ]);
    await db.run(`DELETE FROM user_sessions WHERE user_id = ?`, [userId]);
  });
  return { user: toUser({ ...row, must_change_password: 1 }), temporaryPassword };
}

export async function setUserAdmin(actingUserId: number, userId: number, isAdmin: boolean): Promise<User> {
  return db.transaction(async () => {
    const row = await db.get<UserRow>(`SELECT * FROM users WHERE id = ?`, [userId]);
    if (!row) throw notFound('Compte introuvable.');
    if (!isAdmin && row.is_admin && (await countAdmins()) <= 1) {
      throw conflict('Impossible de retirer le dernier administrateur.');
    }
    if (!isAdmin && userId === actingUserId) {
      throw conflict('Vous ne pouvez pas retirer vos propres droits administrateur.');
    }
    await db.run(`UPDATE users SET is_admin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [isAdmin ? 1 : 0, userId]);
    return toUser({ ...row, is_admin: isAdmin ? 1 : 0 });
  });
}

export async function deleteUser(actingUserId: number, userId: number): Promise<void> {
  if (userId === actingUserId) {
    throw conflict('Vous ne pouvez pas supprimer votre propre compte depuis cet écran.');
  }
  await db.transaction(async () => {
    const row = await db.get<UserRow>(`SELECT * FROM users WHERE id = ?`, [userId]);
    if (!row) throw notFound('Compte introuvable.');
    if (row.is_admin && (await countAdmins()) <= 1) {
      throw conflict('Impossible de supprimer le dernier administrateur.');
    }
    for (const table of ['daily_entries', 'periods', 'regularizations', 'monthly_targets', 'audit_logs', 'user_settings', 'user_sessions']) {
      await db.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    }
    await db.run(`DELETE FROM users WHERE id = ?`, [userId]);
  });
}
