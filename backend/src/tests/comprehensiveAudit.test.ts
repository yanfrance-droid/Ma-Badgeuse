/**
 * Tests de la logique métier (calculs, isolation entre comptes, remises à zéro,
 * annulation, mots de passe), appelée directement sans passer par HTTP.
 */
import { cleanupTestRoot } from './runAuditIsolated';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { closeDatabase, db, initDatabase } from '../database';
import { authenticate, createUser, hashPassword, verifyPassword } from '../services/authService';
import { getDatabaseStatus, getBackupDir, optimizeDatabase, resetServerAll, resetUserData } from '../services/backupService';
import { computeActualHours, computeDailyDelta, getAnnualCockpitSummary, getGlobalCockpitSummary } from '../services/hoursService';
import { logAudit, undoLastAction } from '../services/auditService';

let aliceId = 0;
let bobId = 0;

before(async () => {
  await initDatabase();
  aliceId = (await createUser({ username: 'alice', displayName: 'Alice', password: 'motdepasse-alice' })).id;
  bobId = (await createUser({ username: 'bob', displayName: 'Bob', password: 'motdepasse-bob1' })).id;
});

after(async () => {
  await closeDatabase();
  cleanupTestRoot();
});

describe('Calcul des heures', () => {
  test('durée simple, avec pause, et passage de minuit', () => {
    assert.equal(computeActualHours('08:00', '16:30', 30), 8);
    assert.equal(computeActualHours('10:45', '14:45', 0), 4);
    assert.equal(computeActualHours('21:00', '05:00', 0), 8);
    assert.equal(computeActualHours('10:00', '10:15', 60), 0);
  });

  test('écart journalier selon la règle du statut', () => {
    assert.deepEqual(computeDailyDelta({ expected_hours: 8, actual_hours: 9.5 }), { delta: 1.5, positive: 1.5, negative: 0 });
    assert.deepEqual(computeDailyDelta({ expected_hours: 8, actual_hours: 6 }), { delta: -2, positive: 0, negative: 2 });
    // Absence avec maintien : jamais de dette.
    assert.deepEqual(computeDailyDelta({ expected_hours: 4, actual_hours: 0, accounting_rule: 'MAINTAINED' }), { delta: 0, positive: 0, negative: 0 });
    // Jour neutre et vacances scolaires : heures faites comptées en plus.
    assert.deepEqual(computeDailyDelta({ expected_hours: 4, actual_hours: 2, accounting_rule: 'NEUTRAL' }), { delta: 2, positive: 2, negative: 0 });
    assert.deepEqual(computeDailyDelta({ expected_hours: 4, actual_hours: 0, accounting_rule: 'VARIABLE' }), { delta: 0, positive: 0, negative: 0 });
    // Absence à rattraper : écart réel.
    assert.deepEqual(computeDailyDelta({ expected_hours: 4, actual_hours: 0, accounting_rule: 'DEDUCTED' }), { delta: -4, positive: 0, negative: 4 });
    // Journée future non travaillée : pas de dette anticipée.
    assert.deepEqual(computeDailyDelta({ expected_hours: 4, actual_hours: 0 }, true), { delta: 0, positive: 0, negative: 0 });
  });
});

describe('Isolation entre comptes et bilans', () => {
  test('les bilans ne mélangent pas les comptes', async () => {
    for (let i = 1; i <= 8; i++) {
      await db.run(
        `INSERT INTO daily_entries (user_id, entry_date, start_time, end_time, break_minutes, expected_hours, actual_hours)
         VALUES (?, ?, '09:00', '17:00', 60, 7, 7)`,
        [bobId, `2025-10-1${i}`]
      );
    }
    await db.run(
      `INSERT INTO daily_entries (user_id, entry_date, expected_hours, actual_hours) VALUES (?, '2025-10-01', 8, 10)`,
      [aliceId]
    );

    const bob = await getGlobalCockpitSummary(bobId, '2025-10');
    const alice = await getGlobalCockpitSummary(aliceId, '2025-10');
    assert.equal(bob.current_month.actual_hours, 56);
    assert.equal(alice.current_month.actual_hours, 10);
    assert.equal(alice.total_positive_balance, 2);

    const annualBob = await getAnnualCockpitSummary(bobId, 2025);
    assert.equal(annualBob.total_worked_hours, 56);
    assert.equal(annualBob.annual_contract_hours, 800);
    assert.equal(annualBob.remaining_contract_hours, 744);
  });

  test('compensation : les heures en plus effacent les heures dues', async () => {
    await db.run(`INSERT INTO daily_entries (user_id, entry_date, expected_hours, actual_hours) VALUES (?, '2025-10-02', 8, 5)`, [aliceId]);
    const alice = await getGlobalCockpitSummary(aliceId, '2025-10');
    assert.equal(alice.gross_positive_hours, 2);
    assert.equal(alice.gross_negative_hours, 3);
    assert.equal(alice.total_positive_balance, 0);
    assert.equal(alice.total_negative_balance, 1);
  });

  test("le solde du mois suit les règles du jour : une absence neutre ne crée pas d'écart", async () => {
    const neutral = await db.get<{ id: number }>(`SELECT id FROM status_catalog WHERE accounting_rule = 'NEUTRAL' LIMIT 1`);
    assert.ok(neutral, 'un statut neutre existe dans le catalogue');
    await db.run(`INSERT INTO daily_entries (user_id, entry_date, expected_hours, actual_hours) VALUES (?, '2025-11-03', 4, 5)`, [bobId]);
    await db.run(`INSERT INTO daily_entries (user_id, entry_date, expected_hours, actual_hours, status_id) VALUES (?, '2025-11-04', 4, 0, ?)`, [
      bobId,
      neutral.id
    ]);
    const summary = await getGlobalCockpitSummary(bobId, '2025-11');
    assert.equal(summary.current_month.positive_delta, 1);
    assert.equal(summary.current_month.negative_delta, 0);
    assert.equal(summary.current_month.delta_hours, 1);
    const annual = await getAnnualCockpitSummary(bobId, 2025);
    assert.equal(annual.months.find((m) => m.year_month === '2025-11')?.delta_hours, 1);
    await db.run(`DELETE FROM daily_entries WHERE user_id = ? AND entry_date LIKE '2025-11-%'`, [bobId]);
  });

  test("la remise à zéro d'un compte laisse l'autre strictement intact et conserve les réglages", async () => {
    const before = JSON.stringify(await db.all(`SELECT * FROM daily_entries WHERE user_id = ? ORDER BY id`, [bobId]));
    const result = await resetUserData(aliceId);
    assert.ok(fs.existsSync(path.join(getBackupDir(), result.safetyBackup)), 'la sauvegarde de sécurité existe');

    const aliceEntries = await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM daily_entries WHERE user_id = ?`, [aliceId]);
    const aliceSettings = await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM user_settings WHERE user_id = ?`, [aliceId]);
    assert.equal(aliceEntries?.c, 0);
    assert.ok((aliceSettings?.c ?? 0) > 0, 'les réglages sont conservés');

    const afterReset = JSON.stringify(await db.all(`SELECT * FROM daily_entries WHERE user_id = ? ORDER BY id`, [bobId]));
    assert.equal(afterReset, before);
  });

  test('la remise à zéro du serveur exige la confirmation exacte', async () => {
    await assert.rejects(resetServerAll('MAUVAISE_CHAINE'));
  });
});

describe('Concurrence', () => {
  test('des transactions simultanées ne se mélangent pas', async () => {
    const writes = Array.from({ length: 12 }, (_, i) =>
      db.transaction(async () => {
        await db.run(`INSERT INTO regularizations (user_id, reg_date, counter_type, operation_type, amount_hours, reason) VALUES (?, '2025-11-01', 'POSITIVE', 'ADD', 1, ?)`, [
          bobId,
          `concurrence ${i}`
        ]);
        await new Promise((resolve) => setTimeout(resolve, 5));
        await db.run(`INSERT INTO audit_logs (user_id, entity_name, entity_id, action_type, reason) VALUES (?, 'test', ?, 'INSERT', 'concurrence')`, [bobId, i]);
      })
    );
    const results = await Promise.allSettled(writes);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 12);
    const count = await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM regularizations WHERE reason LIKE 'concurrence %'`);
    assert.equal(count?.c, 12);
  });

  test("une transaction en échec est entièrement annulée sans bloquer les suivantes", async () => {
    await assert.rejects(
      db.transaction(async () => {
        await db.run(`INSERT INTO regularizations (user_id, reg_date, counter_type, operation_type, amount_hours, reason) VALUES (?, '2025-11-02', 'POSITIVE', 'ADD', 1, 'rollback')`, [bobId]);
        throw new Error('échec volontaire');
      })
    );
    const count = await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM regularizations WHERE reason = 'rollback'`);
    assert.equal(count?.c, 0);
    await db.transaction(async () => undefined);
  });
});

describe('Annulation', () => {
  test("annule la création d'une journée puis refuse quand il n'y a plus rien", async () => {
    const userId = (await createUser({ username: 'carole', password: 'motdepasse-carole' })).id;
    await db.transaction(async () => {
      const r = await db.run(`INSERT INTO daily_entries (user_id, entry_date, expected_hours, actual_hours) VALUES (?, '2025-12-01', 4, 4)`, [userId]);
      await logAudit(userId, 'daily_entries', r.lastID, 'INSERT', null, { entry_date: '2025-12-01' });
    });
    const first = await undoLastAction(userId);
    assert.equal(first.success, true);
    const remaining = await db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM daily_entries WHERE user_id = ?`, [userId]);
    assert.equal(remaining?.c, 0);
    const second = await undoLastAction(userId);
    assert.equal(second.success, false);
  });

  test("restaure l'objectif ET l'état de validation d'un mois", async () => {
    const userId = (await createUser({ username: 'denis', password: 'motdepasse-denis' })).id;
    const r = await db.run(`INSERT INTO monthly_targets (user_id, year_month, target_hours, is_validated) VALUES (?, '2025-10', 100, 0)`, [userId]);
    const before = await db.get(`SELECT * FROM monthly_targets WHERE id = ?`, [r.lastID]);
    await db.run(`UPDATE monthly_targets SET is_validated = 1, validated_at = CURRENT_TIMESTAMP WHERE id = ?`, [r.lastID]);
    await logAudit(userId, 'monthly_targets', r.lastID, 'UPDATE', before, { is_validated: 1 });
    const result = await undoLastAction(userId);
    assert.equal(result.success, true);
    const afterUndo = await db.get<{ is_validated: number }>(`SELECT is_validated FROM monthly_targets WHERE id = ?`, [r.lastID]);
    assert.equal(afterUndo?.is_validated, 0);
  });
});

describe('Mots de passe', () => {
  test('hachage scrypt salé, jamais en clair', async () => {
    const row = await db.get<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = ?`, [bobId]);
    assert.ok(row?.password_hash.startsWith('scrypt$'));
    assert.ok(!row?.password_hash.includes('motdepasse-bob1'));
    const h1 = await hashPassword('identique-123');
    const h2 = await hashPassword('identique-123');
    assert.notEqual(h1, h2, 'deux hachages du même mot de passe diffèrent (sel)');
    assert.equal(await verifyPassword('identique-123', h1), true);
    assert.equal(await verifyPassword('autre-chose', h1), false);
  });

  test('un ancien hachage PBKDF2 est accepté puis converti en scrypt', async () => {
    const crypto = await import('crypto');
    const salt = 'abcdef0123456789';
    const legacy = `${salt}:${crypto.pbkdf2Sync('ancien-mot-de-passe', salt, 10000, 32, 'sha256').toString('hex')}`;
    const r = await db.run(`INSERT INTO users (username, display_name, password_hash) VALUES ('ancien', 'Ancien', ?)`, [legacy]);
    const user = await authenticate('ancien', 'ancien-mot-de-passe');
    assert.equal(user.id, r.lastID);
    const row = await db.get<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = ?`, [r.lastID]);
    assert.ok(row?.password_hash.startsWith('scrypt$'));
  });

  test('un mot de passe trop court accepté à la connexion impose un changement', async () => {
    const legacyHash = (await import('crypto')).createHash('sha256').update('1234').digest('hex');
    await db.run(`INSERT INTO users (username, display_name, password_hash) VALUES ('court', 'Court', ?)`, [legacyHash]);
    const user = await authenticate('court', '1234');
    assert.equal(user.must_change_password, true);
  });

  test('le premier compte est administrateur, les suivants non', async () => {
    const rows = await db.all<{ username: string; is_admin: number }>(`SELECT username, is_admin FROM users WHERE username IN ('alice', 'bob')`);
    assert.deepEqual(Object.fromEntries(rows.map((r) => [r.username, r.is_admin])), { alice: 1, bob: 0 });
  });
});

describe('Santé de la base', () => {
  test('intégrité, mode WAL et compactage', async () => {
    const status = await getDatabaseStatus();
    assert.equal(status.integrity, 'ok');
    assert.equal(status.integrityOk, true);
    const mode = await db.get<{ journal_mode: string }>('PRAGMA journal_mode');
    assert.equal(mode?.journal_mode.toLowerCase(), 'wal');
    assert.equal((await optimizeDatabase()).success, true);
    assert.equal((await getDatabaseStatus()).integrity, 'ok');
  });
});
