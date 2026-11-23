import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { AsyncLocalStorage } from 'async_hooks';
import { DEFAULT_APP_SETTINGS } from './defaults';

const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/database.sqlite');
const DB_PATH = process.env.DB_PATH || DEFAULT_DB_PATH;

/** Version du schéma attendue par ce code (stockée dans PRAGMA user_version). */
export const SCHEMA_VERSION = 2;

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

function openConnection(): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const conn = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error(`[DB] Impossible d'ouvrir la base SQLite (${DB_PATH}) :`, err.message);
        reject(err);
      } else {
        resolve(conn);
      }
    });
  });
}

let rawDb: sqlite3.Database | null = null;

function connection(): sqlite3.Database {
  if (!rawDb) {
    throw new Error('La base de données est fermée.');
  }
  return rawDb;
}

export function getDatabasePath(): string {
  return DB_PATH;
}

/*
 * Sérialisation des accès.
 *
 * L'application n'utilise qu'une seule connexion SQLite. Sans précaution, deux
 * requêtes HTTP simultanées pouvaient entrelacer leurs instructions à l'intérieur
 * d'une même transaction (« cannot start a transaction within a transaction »).
 * Chaque opération passe donc par une file d'attente : une transaction garde la
 * main jusqu'à son COMMIT ou ROLLBACK, et les instructions qu'elle exécute
 * (repérées grâce à AsyncLocalStorage) ne repassent pas par la file.
 */
const lockContext = new AsyncLocalStorage<boolean>();
let queueTail: Promise<unknown> = Promise.resolve();

function withLock<T>(task: () => Promise<T>): Promise<T> {
  if (lockContext.getStore()) {
    return task();
  }
  const run = queueTail.then(() => lockContext.run(true, task));
  queueTail = run.catch(() => undefined);
  return run;
}

function rawRun(sql: string, params: unknown[]): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    connection().run(sql, params, function (this: sqlite3.RunResult, err: Error | null) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function rawGet<T>(sql: string, params: unknown[]): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    connection().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });
}

function rawAll<T>(sql: string, params: unknown[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    connection().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []) as T[]);
    });
  });
}

function rawExec(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    connection().exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export const db = {
  run(sql: string, params: unknown[] = []) {
    return withLock(() => rawRun(sql, params));
  },
  get<T = any>(sql: string, params: unknown[] = []) {
    return withLock(() => rawGet<T>(sql, params));
  },
  all<T = any>(sql: string, params: unknown[] = []) {
    return withLock(() => rawAll<T>(sql, params));
  },
  exec(sql: string) {
    return withLock(() => rawExec(sql));
  },

  /** Exécute `work` dans une transaction atomique, à l'abri des autres requêtes. */
  transaction<T>(work: () => Promise<T>): Promise<T> {
    return withLock(async () => {
      await rawExec('BEGIN IMMEDIATE');
      try {
        const result = await work();
        await rawExec('COMMIT');
        return result;
      } catch (err) {
        await rawExec('ROLLBACK').catch(() => undefined);
        throw err;
      }
    });
  },

  /** Exécute `work` seul, sans transaction (fermeture/réouverture de la base, VACUUM...). */
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    return withLock(work);
  }
};

export async function closeDatabase(): Promise<void> {
  if (!rawDb) return;
  const conn = rawDb;
  rawDb = null;
  await new Promise<void>((resolve, reject) => {
    conn.close((err) => (err ? reject(err) : resolve()));
  });
}

async function openAndConfigure(): Promise<void> {
  rawDb = await openConnection();
  await rawExec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
}

async function tableExists(name: string): Promise<boolean> {
  const row = await rawGet<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [name]);
  return Boolean(row);
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const cols = await rawAll<{ name: string }>(`PRAGMA table_info(${table})`, []);
  return cols.some((c) => c.name === column);
}

const TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    security_question TEXT NOT NULL DEFAULT '',
    security_answer_hash TEXT NOT NULL DEFAULT '',
    is_admin INTEGER NOT NULL DEFAULT 0,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
  );

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
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    absence_reason TEXT,
    absence_impact TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (status_id) REFERENCES status_catalog(id) ON DELETE SET NULL,
    FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE SET NULL,
    UNIQUE(user_id, entry_date)
  );

  CREATE TABLE IF NOT EXISTS regularizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reg_date TEXT NOT NULL,
    counter_type TEXT NOT NULL CHECK(counter_type IN ('POSITIVE', 'NEGATIVE')),
    operation_type TEXT DEFAULT 'SETTLE' CHECK(operation_type IN ('SETTLE', 'ADD')),
    amount_hours REAL NOT NULL,
    reason TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    entity_name TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action_type TEXT NOT NULL CHECK(action_type IN ('INSERT', 'UPDATE', 'DELETE', 'REGULARIZE', 'RESTORE')),
    old_values JSON,
    new_values JSON,
    reason TEXT,
    undone_at DATETIME,
    reverts_log_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_daily_entries_date ON daily_entries(user_id, entry_date);
  CREATE INDEX IF NOT EXISTS idx_periods_dates ON periods(user_id, start_date, end_date);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(user_id, entity_name, entity_id);
  CREATE INDEX IF NOT EXISTS idx_regularizations_date ON regularizations(user_id, reg_date);
`;

/**
 * Migration 1 : reprise des anciennes migrations « multi-utilisateurs ».
 * Elle ne concerne que les bases créées par les toutes premières versions,
 * avant l'ajout de la colonne user_id.
 */
async function migrateToV1(): Promise<void> {
  await rawExec('PRAGMA foreign_keys = OFF;');
  try {
    if (!(await columnExists('daily_entries', 'user_id'))) {
      await rawExec(`
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
      `);
    }

    if (!(await columnExists('monthly_targets', 'user_id'))) {
      await rawExec(`
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
      `);
    }

    for (const table of ['periods', 'regularizations', 'audit_logs']) {
      if (!(await columnExists(table, 'user_id'))) {
        await rawExec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER DEFAULT 1`);
      }
    }

    if (!(await columnExists('regularizations', 'operation_type'))) {
      await rawExec(`ALTER TABLE regularizations ADD COLUMN operation_type TEXT DEFAULT 'SETTLE'`);
    }
  } finally {
    await rawExec('PRAGMA foreign_keys = ON;');
  }
}

/**
 * Migration 2 : rôle administrateur, sessions hachées, annulation fiable,
 * motif et impact d'absence stockés, suppression du PIN et de la question secrète.
 */
async function migrateToV2(): Promise<void> {
  if (!(await columnExists('users', 'is_admin'))) {
    await rawExec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
  }
  if (!(await columnExists('users', 'must_change_password'))) {
    await rawExec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`);
  }
  // Le plus ancien compte (historiquement le compte n°1) devient administrateur.
  await rawExec(`
    UPDATE users SET is_admin = 1
    WHERE id = (SELECT MIN(id) FROM users)
      AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin = 1)
  `);
  // La réinitialisation par question secrète est supprimée : on efface les réponses stockées.
  await rawExec(`UPDATE users SET security_answer_hash = ''`);

  // Les jetons de session sont désormais stockés hachés : les anciens (en clair) sont invalidés.
  await rawExec(`DELETE FROM user_sessions`);
  await rawExec(`DROP INDEX IF EXISTS idx_sessions_token`);
  await rawExec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)`);

  // Le code PIN partagé est remplacé par le rôle administrateur.
  await rawExec(`DELETE FROM app_settings WHERE setting_key = 'admin_pin_hash'`);

  if (!(await columnExists('daily_entries', 'absence_reason'))) {
    await rawExec(`ALTER TABLE daily_entries ADD COLUMN absence_reason TEXT`);
  }
  if (!(await columnExists('daily_entries', 'absence_impact'))) {
    await rawExec(`ALTER TABLE daily_entries ADD COLUMN absence_impact TEXT`);
  }

  if (!(await columnExists('audit_logs', 'undone_at'))) {
    await rawExec(`ALTER TABLE audit_logs ADD COLUMN undone_at DATETIME`);
  }
  if (!(await columnExists('audit_logs', 'reverts_log_id'))) {
    await rawExec(`ALTER TABLE audit_logs ADD COLUMN reverts_log_id INTEGER`);
  }
  // Reprise des anciennes annulations, qui n'étaient tracées que dans le texte du motif.
  const restores = await rawAll<{ id: number; reason: string | null }>(
    `SELECT id, reason FROM audit_logs WHERE action_type = 'RESTORE'`,
    []
  );
  for (const r of restores) {
    const match = r.reason?.match(/#(\d+)/);
    if (match) {
      const target = Number(match[1]);
      await rawRun(`UPDATE audit_logs SET reverts_log_id = ? WHERE id = ?`, [target, r.id]);
      await rawRun(`UPDATE audit_logs SET undone_at = CURRENT_TIMESTAMP WHERE id = ? AND undone_at IS NULL`, [target]);
    }
  }
}

// Une migration « transactionnelle » est appliquée dans une transaction unique avec la
// mise à jour de user_version. La migration 1 ne l'est pas : elle doit désactiver les
// clés étrangères, ce que SQLite ignore à l'intérieur d'une transaction.
const MIGRATIONS: Array<{ version: number; transactional: boolean; up: () => Promise<void> }> = [
  { version: 1, transactional: false, up: migrateToV1 },
  { version: 2, transactional: true, up: migrateToV2 }
];

async function seedReferenceData(): Promise<void> {
  const initialStatuses = [
    { id: 1, code: 'CONGE_PAYE', label: 'Congé payé', color_hex: '#0D2B52', accounting_rule: 'MAINTAINED', is_default_absence: 1, display_order: 1 },
    { id: 2, code: 'JOUR_ZERO', label: 'Journée à 0 h / Non travaillée', color_hex: '#2E7D32', accounting_rule: 'NEUTRAL', is_default_absence: 0, display_order: 2 },
    { id: 3, code: 'ARRET_MALADIE', label: 'Arrêt maladie', color_hex: '#B3E5FC', accounting_rule: 'MAINTAINED', is_default_absence: 1, display_order: 3 },
    { id: 4, code: 'EVENT_FAMILLE', label: 'Événement familial', color_hex: '#FBC02D', accounting_rule: 'MAINTAINED', is_default_absence: 1, display_order: 4 },
    { id: 5, code: 'CONGE_MATERNITE', label: 'Congé maternité', color_hex: '#F48FB1', accounting_rule: 'MAINTAINED', is_default_absence: 1, display_order: 5 },
    { id: 6, code: 'CONGE_SANS_SOLDE', label: 'Congé sans solde', color_hex: '#C62828', accounting_rule: 'DEDUCTED', is_default_absence: 1, display_order: 6 },
    { id: 7, code: 'VACANCES_SCOLAIRES', label: 'Vacances scolaires', color_hex: '#4FC3F7', accounting_rule: 'VARIABLE', is_default_absence: 0, display_order: 7 },
    { id: 8, code: 'FERMETURE_ECOLE', label: 'Fermeture école', color_hex: '#EF6C00', accounting_rule: 'MAINTAINED', is_default_absence: 1, display_order: 8 },
    { id: 9, code: 'JOUR_FERIE', label: 'Jour férié', color_hex: '#FFAB91', accounting_rule: 'MAINTAINED', is_default_absence: 1, display_order: 9 }
  ];
  for (const st of initialStatuses) {
    await rawRun(
      `INSERT OR IGNORE INTO status_catalog (id, code, label, color_hex, accounting_rule, is_default_absence, is_system, display_order)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [st.id, st.code, st.label, st.color_hex, st.accounting_rule, st.is_default_absence, st.display_order]
    );
  }

  for (const [key, value] of Object.entries(DEFAULT_APP_SETTINGS)) {
    await rawRun(`INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)`, [key, value]);
  }
}

/**
 * Ouvre la base, crée le schéma s'il n'existe pas, applique les migrations
 * manquantes puis insère les données de référence. Aucune erreur n'est avalée :
 * une migration qui échoue empêche le démarrage.
 */
export async function initDatabase(): Promise<void> {
  await db.exclusive(async () => {
    if (!rawDb) {
      await openAndConfigure();
    }

    const isNewDatabase = !(await tableExists('users'));
    const { user_version: currentVersion } = (await rawGet<{ user_version: number }>('PRAGMA user_version', [])) || { user_version: 0 };

    if (currentVersion > SCHEMA_VERSION) {
      throw new Error(
        `La base est en version ${currentVersion}, plus récente que ce que gère l'application (${SCHEMA_VERSION}). Mettez l'application à jour.`
      );
    }

    // Les tables absentes sont créées directement dans leur forme la plus récente ;
    // les migrations vérifient l'existence des colonnes avant de les ajouter.
    await rawExec(TABLES_SQL);

    if (isNewDatabase) {
      await rawExec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    } else {
      for (const migration of MIGRATIONS) {
        if (migration.version <= currentVersion) continue;
        console.log(`[DB] Application de la migration ${migration.version}...`);
        if (!migration.transactional) {
          await migration.up();
          await rawExec(`PRAGMA user_version = ${migration.version}`);
          continue;
        }
        await rawExec('BEGIN IMMEDIATE');
        try {
          await migration.up();
          await rawExec(`PRAGMA user_version = ${migration.version}`);
          await rawExec('COMMIT');
        } catch (err) {
          await rawExec('ROLLBACK').catch(() => undefined);
          throw err;
        }
      }
    }

    await rawExec(INDEXES_SQL);
    await seedReferenceData();
  });
  console.log(`[DB] Base SQLite prête (schéma v${SCHEMA_VERSION}, mode WAL) : ${DB_PATH}`);
}

/**
 * Ferme la connexion, exécute `work` (qui peut remplacer le fichier de base),
 * puis rouvre et réinitialise la base. À appeler à l'intérieur de db.exclusive().
 */
export async function withDatabaseClosed(work: () => Promise<void>): Promise<void> {
  if (rawDb) {
    await rawExec('PRAGMA wal_checkpoint(TRUNCATE)').catch(() => undefined);
  }
  await closeDatabase();
  try {
    await work();
  } finally {
    await openAndConfigure();
  }
}
