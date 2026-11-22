import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

//sqlite3.verbose();

const DEFAULT_DB_DIR = path.resolve(__dirname, '../../data');
const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, 'database.sqlite');
const DB_PATH = process.env.DB_PATH || DEFAULT_DB_PATH;

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export let rawDb = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error(`[DB Error] Impossible d'ouvrir la base SQLite à ${DB_PATH}:`, err.message);
  } else {
    console.log(`[DB] Base SQLite connectée avec succès: ${DB_PATH}`);
  }
});

export function closeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    rawDb.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function reopenDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    rawDb = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error(`[DB Error] Impossible de réouvrir la base SQLite à ${DB_PATH}:`, err.message);
        reject(err);
      } else {
        console.log(`[DB] Base SQLite réouverte avec succès: ${DB_PATH}`);
        resolve();
      }
    });
  });
}

// Promisified wrapper for clean async/await syntax
export const db = {
  run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      rawDb.run(sql, params, function (this: sqlite3.RunResult, err: Error | null) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },

  get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      rawDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T);
      });
    });
  },

  all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      rawDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve((rows || []) as T[]);
      });
    });
  },

  exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      rawDb.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

/**
 * Initialisation du schéma SQLite et application du mode WAL
 */
export async function initDatabase(): Promise<void> {
  console.log('[DB] Configuration du mode WAL et vérification du schéma...');

  // 1. Configuration des pragmas critiques (WAL, Synchronous, Clés étrangères, Timeout)
  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);

  // 2. DDL complet
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      security_question TEXT NOT NULL,
      security_answer_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token);

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      setting_key TEXT NOT NULL,
      setting_value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, setting_key)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS status_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      color_hex TEXT NOT NULL,
      accounting_rule TEXT NOT NULL CHECK(accounting_rule IN ('MAINTAINED', 'NEUTRAL', 'DEDUCTED', 'VARIABLE', 'CUSTOM')),
      is_default_absence INTEGER DEFAULT 0,
      is_system INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS monthly_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
      year_month TEXT NOT NULL,
      target_hours REAL NOT NULL,
      notes TEXT,
      is_validated INTEGER DEFAULT 0,
      validated_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, year_month)
    );

    CREATE TABLE IF NOT EXISTS periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status_id INTEGER,
      color_hex TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (status_id) REFERENCES status_catalog(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS daily_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
      entry_date TEXT NOT NULL,
      expected_hours REAL DEFAULT 0.0,
      start_time TEXT,
      end_time TEXT,
      break_minutes INTEGER DEFAULT 0,
      actual_hours REAL DEFAULT 0.0,
      manual_actual_override INTEGER DEFAULT 0,
      status_id INTEGER,
      period_id INTEGER,
      is_override INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (status_id) REFERENCES status_catalog(id) ON DELETE SET NULL,
      FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE SET NULL,
      UNIQUE(user_id, entry_date)
    );

    CREATE TABLE IF NOT EXISTS regularizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
      reg_date TEXT NOT NULL,
      counter_type TEXT NOT NULL CHECK(counter_type IN ('POSITIVE', 'NEGATIVE')),
      operation_type TEXT DEFAULT 'SETTLE' CHECK(operation_type IN ('SETTLE', 'ADD')),
      amount_hours REAL NOT NULL,
      reason TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
      entity_name TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action_type TEXT NOT NULL CHECK(action_type IN ('INSERT', 'UPDATE', 'DELETE', 'REGULARIZE', 'RESTORE')),
      old_values JSON,
      new_values JSON,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_daily_entries_date ON daily_entries(user_id, entry_date);
    CREATE INDEX IF NOT EXISTS idx_periods_dates ON periods(user_id, start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(user_id, entity_name, entity_id);
    CREATE INDEX IF NOT EXISTS idx_regularizations_date ON regularizations(user_id, reg_date);
  `);

  // Assurer qu'au moins un compte par défaut existe (Maman / 1234) pour intégrité référentielle
  try {
    const existingUser = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM users`);
    if (!existingUser || existingUser.count === 0) {
      const defaultPassHash = crypto.createHash('sha256').update('1234').digest('hex');
      const defaultAnswerHash = crypto.createHash('sha256').update('famille'.trim().toLowerCase()).digest('hex');
      await db.run(
        `INSERT OR IGNORE INTO users (id, username, display_name, password_hash, security_question, security_answer_hash)
         VALUES (1, 'maman', 'Maman', ?, 'Quel est le mot de passe de secours de la famille ?', ?)`,
        [defaultPassHash, defaultAnswerHash]
      );
      console.log('[DB] Utilisateur par défaut "maman" initialisé avec succès.');
    }
  } catch (e) {
    console.warn('[DB User Seed]', e);
  }

  // Migration de colonnes et contraintes multi-utilisateurs
  await db.exec(`PRAGMA foreign_keys = OFF;`);

  try {
    const entryCols = await db.all<any>(`PRAGMA table_info(daily_entries)`);
    const hasUserIdInEntries = entryCols.some((c) => c.name === 'user_id');
    if (!hasUserIdInEntries) {
      await db.exec(`
        DROP TABLE IF EXISTS daily_entries_v2;
        CREATE TABLE daily_entries_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          entry_date TEXT NOT NULL,
          expected_hours REAL DEFAULT 0.0,
          start_time TEXT,
          end_time TEXT,
          break_minutes INTEGER DEFAULT 0,
          actual_hours REAL DEFAULT 0.0,
          manual_actual_override INTEGER DEFAULT 0,
          status_id INTEGER,
          period_id INTEGER,
          is_override INTEGER DEFAULT 0,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (status_id) REFERENCES status_catalog(id) ON DELETE SET NULL,
          FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE SET NULL,
          UNIQUE(user_id, entry_date)
        );
        INSERT OR IGNORE INTO daily_entries_v2 (id, user_id, entry_date, expected_hours, start_time, end_time, break_minutes, actual_hours, manual_actual_override, status_id, period_id, is_override, notes, created_at, updated_at)
        SELECT id, 1, entry_date, expected_hours, start_time, end_time, break_minutes, actual_hours, manual_actual_override, status_id, period_id, is_override, notes, created_at, updated_at FROM daily_entries;
        DROP TABLE daily_entries;
        ALTER TABLE daily_entries_v2 RENAME TO daily_entries;
        CREATE INDEX IF NOT EXISTS idx_daily_entries_date ON daily_entries(user_id, entry_date);
      `);
    }
  } catch (e) {
    console.warn('[DB Migration] daily_entries:', e);
  }

  try {
    const targetCols = await db.all<any>(`PRAGMA table_info(monthly_targets)`);
    const hasUserIdInTargets = targetCols.some((c) => c.name === 'user_id');
    if (!hasUserIdInTargets) {
      await db.exec(`
        DROP TABLE IF EXISTS monthly_targets_v2;
        CREATE TABLE monthly_targets_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          year_month TEXT NOT NULL,
          target_hours REAL NOT NULL,
          notes TEXT,
          is_validated INTEGER DEFAULT 0,
          validated_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, year_month)
        );
        INSERT OR IGNORE INTO monthly_targets_v2 (id, user_id, year_month, target_hours, notes, is_validated, validated_at, created_at, updated_at)
        SELECT id, 1, year_month, target_hours, notes, is_validated, validated_at, created_at, updated_at FROM monthly_targets;
        DROP TABLE monthly_targets;
        ALTER TABLE monthly_targets_v2 RENAME TO monthly_targets;
        CREATE INDEX IF NOT EXISTS idx_monthly_targets_user ON monthly_targets(user_id, year_month);
      `);
    }
  } catch (e) {
    console.warn('[DB Migration] monthly_targets:', e);
  }

  try {
    const periodCols = await db.all<any>(`PRAGMA table_info(periods)`);
    if (!periodCols.some((c) => c.name === 'user_id')) {
      await db.exec(`ALTER TABLE periods ADD COLUMN user_id INTEGER DEFAULT 1`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_periods_user ON periods(user_id)`);
    }
  } catch (e) {
    console.warn('[DB Migration] periods:', e);
  }

  try {
    const regCols = await db.all<any>(`PRAGMA table_info(regularizations)`);
    if (!regCols.some((c) => c.name === 'user_id')) {
      await db.exec(`ALTER TABLE regularizations ADD COLUMN user_id INTEGER DEFAULT 1`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_regularizations_user ON regularizations(user_id)`);
    }
  } catch (e) {
    console.warn('[DB Migration] regularizations:', e);
  }

  try {
    const auditCols = await db.all<any>(`PRAGMA table_info(audit_logs)`);
    if (!auditCols.some((c) => c.name === 'user_id')) {
      await db.exec(`ALTER TABLE audit_logs ADD COLUMN user_id INTEGER DEFAULT 1`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`);
    }
  } catch (e) {
    console.warn('[DB Migration] audit_logs:', e);
  }

  await db.exec(`PRAGMA foreign_keys = ON;`);

  // Migration de colonnes rétrocompatibles si la base existait déjà
  try {
    await db.exec(`ALTER TABLE regularizations ADD COLUMN operation_type TEXT DEFAULT 'SETTLE'`);
  } catch (e) {
    // Colonne déjà présente
  }

  // 3. Seed des 9 statuts initiaux avec couleurs et règles
  const initialStatuses = [
    { id: 1, code: 'CONGE_PAYE', label: 'Congé payé', color_hex: '#0D2B52', accounting_rule: 'MAINTAINED', is_default_absence: 1, is_system: 1, display_order: 1 },
    { id: 2, code: 'JOUR_ZERO', label: 'Journée à 0 h / Non travaillée', color_hex: '#2E7D32', accounting_rule: 'NEUTRAL', is_default_absence: 0, is_system: 1, display_order: 2 },
    { id: 3, code: 'ARRET_MALADIE', label: 'Arrêt maladie', color_hex: '#B3E5FC', accounting_rule: 'MAINTAINED', is_default_absence: 1, is_system: 1, display_order: 3 },
    { id: 4, code: 'EVENT_FAMILLE', label: 'Événement familial', color_hex: '#FBC02D', accounting_rule: 'MAINTAINED', is_default_absence: 1, is_system: 1, display_order: 4 },
    { id: 5, code: 'CONGE_MATERNITE', label: 'Congé maternité', color_hex: '#F48FB1', accounting_rule: 'MAINTAINED', is_default_absence: 1, is_system: 1, display_order: 5 },
    { id: 6, code: 'CONGE_SANS_SOLDE', label: 'Congé sans solde', color_hex: '#C62828', accounting_rule: 'DEDUCTED', is_default_absence: 1, is_system: 1, display_order: 6 },
    { id: 7, code: 'VACANCES_SCOLAIRES', label: 'Vacances scolaires', color_hex: '#4FC3F7', accounting_rule: 'VARIABLE', is_default_absence: 0, is_system: 1, display_order: 7 },
    { id: 8, code: 'FERMETURE_ECOLE', label: 'Fermeture école', color_hex: '#EF6C00', accounting_rule: 'MAINTAINED', is_default_absence: 1, is_system: 1, display_order: 8 },
    { id: 9, code: 'JOUR_FERIE', label: 'Jour férié', color_hex: '#FFAB91', accounting_rule: 'MAINTAINED', is_default_absence: 1, is_system: 1, display_order: 9 },
  ];

  for (const st of initialStatuses) {
    await db.run(
      `INSERT OR IGNORE INTO status_catalog (id, code, label, color_hex, accounting_rule, is_default_absence, is_system, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [st.id, st.code, st.label, st.color_hex, st.accounting_rule, st.is_default_absence, st.is_system, st.display_order]
    );
  }

  // 4. Seed des paramètres par défaut
  await db.run(
    `INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)`,
    ['default_monthly_target', '120']
  );
  await db.run(
    `INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)`,
    ['annual_target_hours', '800']
  );
  await db.run(
    `INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)`,
    ['app_title', 'Ma Badgeuse']
  );
  await db.run(
    `INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)`,
    ['habitual_start_time', '10:45']
  );
  await db.run(
    `INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)`,
    ['habitual_end_time', '14:45']
  );
  await db.run(
    `INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)`,
    ['habitual_break_minutes', '0']
  );
  await db.run(
    `INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)`,
    ['habitual_expected_hours', '4.0']
  );
  await db.run(
    `INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)`,
    ['admin_pin_hash', crypto.createHash('sha256').update('1234').digest('hex')]
  );

  console.log('[DB] Base SQLite initialisée et prête en mode WAL.');
}
