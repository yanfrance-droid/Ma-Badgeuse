import { db } from '../database';
import { DEFAULT_USER_SETTINGS, UserSettingKey } from '../defaults';
import { badRequest, conflict, isValidTime, requireNumber, requireInteger } from '../http';

type Validator = (value: unknown) => string;

const text = (label: string, max: number): Validator => (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > max) {
    throw badRequest(`${label} doit être un texte de ${max} caractères au plus.`);
  }
  return value.trim();
};

const time = (label: string): Validator => (value) => {
  if (!isValidTime(value)) throw badRequest(`${label} est invalide (format HH:mm attendu).`);
  return value;
};

const decimal = (label: string, min: number, max: number): Validator => (value) => String(requireNumber(value, label, min, max));
const integer = (label: string, min: number, max: number): Validator => (value) => String(requireInteger(value, label, min, max));

/** Seuls ces réglages peuvent être enregistrés, chacun avec son contrôle. */
const VALIDATORS: Record<UserSettingKey, Validator> = {
  habitual_start_time: time("L'heure d'arrivée habituelle"),
  habitual_end_time: time("L'heure de départ habituelle"),
  habitual_break_minutes: integer('La pause habituelle', 0, 360),
  habitual_expected_hours: decimal('Les heures prévues par jour', 0, 24),
  default_monthly_target: decimal("L'objectif mensuel par défaut", 0, 744),
  annual_target_hours: decimal('Le quota annuel', 1, 5000),
  agent_name: text("Le nom de l'agent", 100),
  employer_name: text("Le nom de l'employeur", 120),
  job_title: text("L'intitulé du poste", 120),
  manager_phone: text('Le téléphone du responsable', 30),
  manager_email: text("L'e-mail du responsable", 120)
};

export async function getUserSettings(userId: number): Promise<Record<UserSettingKey, string>> {
  const rows = await db.all<{ setting_key: string; setting_value: string }>(
    `SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?`,
    [userId]
  );
  const settings: Record<string, string> = { ...DEFAULT_USER_SETTINGS };
  for (const r of rows) {
    if (r.setting_key in DEFAULT_USER_SETTINGS) {
      settings[r.setting_key] = r.setting_value;
    }
  }
  return settings as Record<UserSettingKey, string>;
}

/** Lit un réglage numérique du compte, avec repli sur la valeur par défaut unique. */
export async function getUserNumberSetting(userId: number, key: UserSettingKey): Promise<number> {
  const row = await db.get<{ setting_value: string }>(
    `SELECT setting_value FROM user_settings WHERE user_id = ? AND setting_key = ?`,
    [userId, key]
  );
  const fallback = Number(DEFAULT_USER_SETTINGS[key]);
  const value = row ? Number(row.setting_value) : fallback;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export async function saveUserSettings(userId: number, updates: unknown): Promise<Record<UserSettingKey, string>> {
  if (typeof updates !== 'object' || updates === null || Array.isArray(updates)) {
    throw badRequest('Données de réglages invalides.');
  }
  const entries = Object.entries(updates as Record<string, unknown>);
  const validated: Array<[string, string]> = [];
  for (const [key, value] of entries) {
    const validator = VALIDATORS[key as UserSettingKey];
    if (!validator) {
      throw badRequest(`Réglage inconnu : « ${key.slice(0, 40)} ».`);
    }
    validated.push([key, validator(value)]);
  }

  await db.transaction(async () => {
    for (const [key, value] of validated) {
      await db.run(
        `INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id, setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`,
        [userId, key, value]
      );
    }
  });
  return getUserSettings(userId);
}

// ----------------------------------------------------------------------------
// Verrouillage des mois validés
// ----------------------------------------------------------------------------

/** Liste des mois validés parmi ceux fournis (format AAAA-MM). */
export async function findValidatedMonths(userId: number, yearMonths: string[]): Promise<string[]> {
  const unique = Array.from(new Set(yearMonths));
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => '?').join(',');
  const rows = await db.all<{ year_month: string }>(
    `SELECT year_month FROM monthly_targets WHERE user_id = ? AND is_validated = 1 AND year_month IN (${placeholders})`,
    [userId, ...unique]
  );
  return rows.map((r) => r.year_month).sort();
}

/** Refuse toute modification touchant un mois validé (il faut d'abord le rouvrir). */
export async function assertMonthsOpen(userId: number, dates: string[]): Promise<void> {
  const locked = await findValidatedMonths(
    userId,
    dates.map((d) => d.slice(0, 7))
  );
  if (locked.length > 0) {
    throw conflict(
      `Le mois ${locked.join(', ')} est validé et donc verrouillé. Rouvrez-le avant de le modifier.`
    );
  }
}
