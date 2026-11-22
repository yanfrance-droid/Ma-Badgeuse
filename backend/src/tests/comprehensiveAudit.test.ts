import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db, initDatabase } from '../database';
import {
  register,
  login,
  verifyAdminPin,
  changeAdminPin,
  resetPassword,
  deleteUserByAdmin,
  hashString
} from '../services/authService';
import {
  resetUserData,
  resetServerAll,
  getDatabaseStatus,
  optimizeDatabase
} from '../services/backupService';
import {
  computeActualHours,
  computeDailyDelta,
  getGlobalCockpitSummary,
  getAnnualCockpitSummary,
  getCurrentSchoolYearStart
} from '../services/hoursService';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  durationMs: number;
  details?: string;
}

const results: TestResult[] = [];

async function runTest(suite: string, name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - start;
    results.push({ suite, name, passed: true, durationMs });
    console.log(`  ✅ [PASS] ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({ suite, name, passed: false, durationMs, details: err.message || String(err) });
    console.error(`  ❌ [FAIL] ${name} (${durationMs}ms) -> ${err.message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (Expected: ${expected}, Got: ${actual})`);
  }
}

export async function runComprehensiveAudit() {
  console.log('\n================================================================');
  console.log('🚀 DÉMARRAGE DE L\'AUDIT COMPLET & DE LA SUITE DE TESTS COMPLÈTE');
  console.log('================================================================\n');

  // Initialisation complète du schéma SQLite
  await initDatabase();
  await db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);

  // Assurer que le code PIN admin par défaut est bien 1234
  await db.run(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES ('admin_pin_hash', ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`,
    [hashString('1234')]
  );

  // Nettoyage préalable des comptes d'audit résiduels éventuels
  await db.run(`DELETE FROM users WHERE username IN ('audit_alice', 'audit_bob', 'audit_charlie')`);

  // -------------------------------------------------------------------------
  // SUITE 1 : ÉTANCHÉITÉ MULTI-UTILISATEUR & REMISE À ZÉRO PERSONNELLE (RAZ)
  // -------------------------------------------------------------------------
  console.log('\n📁 SUITE 1 : ÉTANCHÉITÉ MULTI-UTILISATEUR & REMISE À ZÉRO PERSONNELLE');
  
  let aliceId: number = 0;
  let bobId: number = 0;

  await runTest('Suite 1: Étanchéité', '1.1 Création de 2 utilisateurs distincts (Alice & Bob)', async () => {
    const alice = await register({
      username: 'audit_alice',
      displayName: 'Alice Test',
      password: 'Password123!',
      securityQuestion: 'Couleur ?',
      securityAnswer: 'Bleu'
    });
    const bob = await register({
      username: 'audit_bob',
      displayName: 'Bob Test',
      password: 'Password456!',
      securityQuestion: 'Animal ?',
      securityAnswer: 'Chat'
    });

    aliceId = alice.user.id;
    bobId = bob.user.id;

    assert(aliceId > 0, 'Alice ID doit être valide');
    assert(bobId > 0, 'Bob ID doit être valide');
    assert(aliceId !== bobId, 'Alice et Bob doivent avoir des ID différents');
  });

  await runTest('Suite 1: Étanchéité', '1.2 Peuplement indépendant des données d\'Alice et de Bob', async () => {
    // Insérer 5 journées pour Alice en octobre 2026
    for (let i = 1; i <= 5; i++) {
      await db.run(`
        INSERT INTO daily_entries (user_id, entry_date, start_time, end_time, break_minutes, expected_hours, actual_hours, notes)
        VALUES (?, ?, '08:00', '16:00', 0, 8.0, 8.0, ?)
      `, [aliceId, `2026-10-0${i}`, `Journée Alice ${i}`]);
    }

    // Insérer 1 période, 1 régularisation, 1 cible mensuelle pour Alice
    await db.run(`
      INSERT INTO periods (user_id, label, start_date, end_date, notes)
      VALUES (?, 'Congé Alice', '2026-10-10', '2026-10-12', 'Congé annuel')
    `, [aliceId]);

    await db.run(`
      INSERT INTO regularizations (user_id, reg_date, counter_type, operation_type, amount_hours, reason)
      VALUES (?, '2026-10-15', 'POSITIVE', 'SETTLE', 2.0, 'Règlement Alice')
    `, [aliceId]);

    await db.run(`
      INSERT INTO monthly_targets (user_id, year_month, target_hours)
      VALUES (?, '2026-10', 120.0)
    `, [aliceId]);

    // Insérer 8 journées pour Bob en octobre 2026 (8 * 7h = 56h)
    for (let i = 1; i <= 8; i++) {
      await db.run(`
        INSERT INTO daily_entries (user_id, entry_date, start_time, end_time, break_minutes, expected_hours, actual_hours, notes)
        VALUES (?, ?, '09:00', '17:00', 60, 7.0, 7.0, ?)
      `, [bobId, `2026-10-1${i}`, `Journée Bob ${i}`]);
    }

    // Insérer 2 périodes, 2 régularisations, 1 cible mensuelle pour Bob
    await db.run(`
      INSERT INTO periods (user_id, label, start_date, end_date, notes)
      VALUES (?, 'Formation Bob', '2026-10-20', '2026-10-22', 'Formation technique')
    `, [bobId]);

    await db.run(`
      INSERT INTO periods (user_id, label, start_date, end_date, notes)
      VALUES (?, 'Arrêt Maladie Bob', '2026-10-25', '2026-10-26', 'Certificat médical')
    `, [bobId]);

    await db.run(`
      INSERT INTO regularizations (user_id, reg_date, counter_type, operation_type, amount_hours, reason)
      VALUES (?, '2026-10-28', 'POSITIVE', 'ADD', 3.0, 'Ajout heures sup Bob')
    `, [bobId]);

    await db.run(`
      INSERT INTO regularizations (user_id, reg_date, counter_type, operation_type, amount_hours, reason)
      VALUES (?, '2026-10-29', 'NEGATIVE', 'SETTLE', 1.5, 'Rattrapage Bob')
    `, [bobId]);

    await db.run(`
      INSERT INTO monthly_targets (user_id, year_month, target_hours)
      VALUES (?, '2026-10', 140.0)
    `, [bobId]);

    // Vérifier les comptes initiaux
    const aliceEntries = (await db.get<any>(`SELECT COUNT(*) as c FROM daily_entries WHERE user_id = ?`, [aliceId])).c;
    const bobEntries = (await db.get<any>(`SELECT COUNT(*) as c FROM daily_entries WHERE user_id = ?`, [bobId])).c;

    assertEqual(aliceEntries, 5, 'Alice doit avoir 5 pointages');
    assertEqual(bobEntries, 8, 'Bob doit avoir 8 pointages');
  });

  let bobSnapshotEntries: any[] = [];
  let bobSnapshotPeriods: any[] = [];
  let bobSnapshotRegs: any[] = [];
  let bobSnapshotTargets: any[] = [];
  let bobSnapshotSettings: any[] = [];

  await runTest('Suite 1: Étanchéité', '1.3 Prise d\'empreinte cryptographique complète de Bob avant le reset d\'Alice', async () => {
    bobSnapshotEntries = await db.all<any>(`SELECT * FROM daily_entries WHERE user_id = ? ORDER BY id ASC`, [bobId]);
    bobSnapshotPeriods = await db.all<any>(`SELECT * FROM periods WHERE user_id = ? ORDER BY id ASC`, [bobId]);
    bobSnapshotRegs = await db.all<any>(`SELECT * FROM regularizations WHERE user_id = ? ORDER BY id ASC`, [bobId]);
    bobSnapshotTargets = await db.all<any>(`SELECT * FROM monthly_targets WHERE user_id = ? ORDER BY id ASC`, [bobId]);
    bobSnapshotSettings = await db.all<any>(`SELECT * FROM user_settings WHERE user_id = ? ORDER BY setting_key ASC`, [bobId]);

    assertEqual(bobSnapshotEntries.length, 8, 'Bob doit avoir 8 entrées enregistrées');
    assertEqual(bobSnapshotPeriods.length, 2, 'Bob doit avoir 2 périodes enregistrées');
    assertEqual(bobSnapshotRegs.length, 2, 'Bob doit avoir 2 régularisations enregistrées');
    assertEqual(bobSnapshotTargets.length, 1, 'Bob doit avoir 1 cible mensuelle');
    assert(bobSnapshotSettings.length > 0, 'Bob doit avoir des user_settings');
  });

  let safetyBackupFilename = '';
  await runTest('Suite 1: Étanchéité', '1.4 Exécution de resetUserData(aliceId) — Remise à zéro d\'Alice', async () => {
    const res = await resetUserData(aliceId);
    assert(res.success === true, 'Le reset d\'Alice doit retourner success: true');
    assert(Boolean(res.safetyBackup), 'Un nom de sauvegarde de sécurité doit être retourné');
    safetyBackupFilename = res.safetyBackup;

    // Vérifier que le fichier de sauvegarde existe dans backend/backups ou BACKUP_DIR
    const backupDir = process.env.BACKUP_DIR || path.resolve(__dirname, '../../backups');
    const backupPath = path.join(backupDir, safetyBackupFilename);
    assert(fs.existsSync(backupPath), `Le fichier de sécurité ${backupPath} doit exister sur le disque`);
    assert(fs.statSync(backupPath).size > 0, 'Le fichier de sécurité ne doit pas être vide');
  });

  await runTest('Suite 1: Étanchéité', '1.5 Vérification : Données d\'Alice intégralement effacées', async () => {
    const aliceEntries = (await db.get<any>(`SELECT COUNT(*) as c FROM daily_entries WHERE user_id = ?`, [aliceId])).c;
    const alicePeriods = (await db.get<any>(`SELECT COUNT(*) as c FROM periods WHERE user_id = ?`, [aliceId])).c;
    const aliceRegs = (await db.get<any>(`SELECT COUNT(*) as c FROM regularizations WHERE user_id = ?`, [aliceId])).c;
    const aliceTargets = (await db.get<any>(`SELECT COUNT(*) as c FROM monthly_targets WHERE user_id = ?`, [aliceId])).c;
    const aliceSettings = (await db.get<any>(`SELECT COUNT(*) as c FROM user_settings WHERE user_id = ?`, [aliceId])).c;

    assertEqual(aliceEntries, 0, 'Alice ne doit plus avoir de daily_entries');
    assertEqual(alicePeriods, 0, 'Alice ne doit plus avoir de periods');
    assertEqual(aliceRegs, 0, 'Alice ne doit plus avoir de regularizations');
    assertEqual(aliceTargets, 0, 'Alice ne doit plus avoir de monthly_targets');
    assertEqual(aliceSettings, 0, 'Alice ne doit plus avoir de user_settings');

    // Le compte d'Alice doit toujours exister dans users
    const aliceUser = await db.get<any>(`SELECT * FROM users WHERE id = ?`, [aliceId]);
    assert(Boolean(aliceUser), 'Le compte Alice doit toujours exister dans la table users');
    assertEqual(aliceUser.username, 'audit_alice', 'Le nom d\'utilisateur d\'Alice doit rester intact');
  });

  await runTest('Suite 1: Étanchéité', '1.6 VÉRIFICATION CRITIQUE : Données de Bob 100% INTACTES et STRICTEMENT IDENTIQUES', async () => {
    const bobCurrentEntries = await db.all<any>(`SELECT * FROM daily_entries WHERE user_id = ? ORDER BY id ASC`, [bobId]);
    const bobCurrentPeriods = await db.all<any>(`SELECT * FROM periods WHERE user_id = ? ORDER BY id ASC`, [bobId]);
    const bobCurrentRegs = await db.all<any>(`SELECT * FROM regularizations WHERE user_id = ? ORDER BY id ASC`, [bobId]);
    const bobCurrentTargets = await db.all<any>(`SELECT * FROM monthly_targets WHERE user_id = ? ORDER BY id ASC`, [bobId]);
    const bobCurrentSettings = await db.all<any>(`SELECT * FROM user_settings WHERE user_id = ? ORDER BY setting_key ASC`, [bobId]);

    // 1. Contrôle des nombres de lignes
    assertEqual(bobCurrentEntries.length, bobSnapshotEntries.length, 'Le nombre de journées de Bob ne doit pas avoir bougé d\'un millième');
    assertEqual(bobCurrentPeriods.length, bobSnapshotPeriods.length, 'Le nombre de périodes de Bob ne doit pas avoir changé');
    assertEqual(bobCurrentRegs.length, bobSnapshotRegs.length, 'Le nombre de régularisations de Bob ne doit pas avoir changé');
    assertEqual(bobCurrentTargets.length, bobSnapshotTargets.length, 'Les cibles mensuelles de Bob ne doivent pas avoir changé');
    assertEqual(bobCurrentSettings.length, bobSnapshotSettings.length, 'Les paramètres de Bob ne doivent pas avoir changé');

    // 2. Contrôle d'intégrité octet par octet (JSON stringify)
    assertEqual(JSON.stringify(bobCurrentEntries), JSON.stringify(bobSnapshotEntries), 'Les pointages de Bob sont 100% identiques');
    assertEqual(JSON.stringify(bobCurrentPeriods), JSON.stringify(bobSnapshotPeriods), 'Les périodes de Bob sont 100% identiques');
    assertEqual(JSON.stringify(bobCurrentRegs), JSON.stringify(bobSnapshotRegs), 'Les régularisations de Bob sont 100% identiques');
    assertEqual(JSON.stringify(bobCurrentTargets), JSON.stringify(bobSnapshotTargets), 'Les cibles de Bob sont 100% identiques');
    assertEqual(JSON.stringify(bobCurrentSettings), JSON.stringify(bobSnapshotSettings), 'Les paramètres de Bob sont 100% identiques');
  });

  // -------------------------------------------------------------------------
  // SUITE 2 : ISOLATION DES REQUÊTES ET DES CALCULS MULTI-UTILISATEUR
  // -------------------------------------------------------------------------
  console.log('\n📁 SUITE 2 : ISOLATION DES REQUÊTES ET DES CALCULS');

  await runTest('Suite 2: Requêtes', '2.1 getGlobalCockpitSummary isole strictement par userId', async () => {
    const summaryAlice = await getGlobalCockpitSummary(aliceId, '2026-10');
    const summaryBob = await getGlobalCockpitSummary(bobId, '2026-10');

    assertEqual(summaryAlice.current_month.actual_hours, 0, 'Alice ayant été reset, ses heures du mois doivent être 0');
    assert(summaryBob.current_month.actual_hours > 0, 'Bob doit avoir ses heures calculées');
    // Bob a 8 jours de 7h = 56h
    assertEqual(summaryBob.current_month.actual_hours, 56, 'Bob doit totaliser exactement 56h travaillées en octobre');
  });

  await runTest('Suite 2: Requêtes', '2.2 getAnnualCockpitSummary isole strictement le quota et les mois', async () => {
    const annualAlice = await getAnnualCockpitSummary(aliceId, 2026);
    const annualBob = await getAnnualCockpitSummary(bobId, 2026);

    assertEqual(annualAlice.total_worked_hours, 0, 'Alice a 0h sur l\'année scolaire');
    assertEqual(annualBob.total_worked_hours, 56, 'Bob a 56h sur l\'année scolaire 2026-2027');
  });

  await runTest('Suite 2: Requêtes', '2.3 Protection cross-tenant : Alice ne peut pas altérer les lignes de Bob', async () => {
    // Tenter une mise à jour sur une ligne de Bob avec la clause WHERE user_id = aliceId
    const firstBobEntry = bobSnapshotEntries[0];
    const updateResult = await db.run(`
      UPDATE daily_entries 
      SET notes = 'Attaque pirate' 
      WHERE id = ? AND user_id = ?
    `, [firstBobEntry.id, aliceId]);

    assertEqual(updateResult.changes, 0, 'Aucune ligne ne doit être modifiée lors d\'une tentative cross-user');

    // Vérifier que la note de Bob est toujours intacte
    const verifyEntry = await db.get<any>(`SELECT notes FROM daily_entries WHERE id = ?`, [firstBobEntry.id]);
    assertEqual(verifyEntry.notes, firstBobEntry.notes, 'La note originale de Bob n\'a pas bougé');
  });

  // -------------------------------------------------------------------------
  // SUITE 3 : RÈGLES MÉTIER ET EXACTITUDE DES CALCULS D'HEURES
  // -------------------------------------------------------------------------
  console.log('\n📁 SUITE 3 : EXACTITUDE DES CALCULS & RÈGLES MÉTIER');

  await runTest('Suite 3: Calculs', '3.1 Calcul de durée standard (computeActualHours)', async () => {
    // 08:00 à 16:30 avec 30m de pause = 8.00h
    const h1 = computeActualHours('08:00', '16:30', 30);
    assertEqual(h1, 8.0, '08:00 - 16:30 avec 30m de pause doit faire 8h00');

    // 10:45 à 14:45 sans pause = 4.00h
    const h2 = computeActualHours('10:45', '14:45', 0);
    assertEqual(h2, 4.0, '10:45 - 14:45 sans pause doit faire 4h00');
  });

  await runTest('Suite 3: Calculs', '3.2 Franchissement de minuit (poste de nuit)', async () => {
    // 21:00 à 05:00 sans pause = 8.00h
    const nightHours = computeActualHours('21:00', '05:00', 0);
    assertEqual(nightHours, 8.0, 'Poste de nuit 21:00 -> 05:00 doit faire 8h00');
  });

  await runTest('Suite 3: Calculs', '3.3 Écart journalier direct (computeDailyDelta)', async () => {
    // Journée pile : 8h faites pour 8h prévues -> delta = 0
    const d1 = computeDailyDelta({ expected_hours: 8.0, actual_hours: 8.0 });
    assertEqual(d1.delta, 0.0, 'Écart pour 8h faites sur 8h prévues doit être 0');
    assertEqual(d1.positive, 0.0, 'Positif doit être 0');
    assertEqual(d1.negative, 0.0, 'Négatif doit être 0');

    // Heures supplémentaires : 9.5h faites pour 8h prévues -> delta = +1.5h
    const d2 = computeDailyDelta({ expected_hours: 8.0, actual_hours: 9.5 });
    assertEqual(d2.delta, 1.5, 'Écart doit être +1.5h');
    assertEqual(d2.positive, 1.5, 'Positif doit être 1.5h');
    assertEqual(d2.negative, 0.0, 'Négatif doit être 0');

    // Journée écourtée : 6h faites pour 8h prévues -> delta = -2h
    const d3 = computeDailyDelta({ expected_hours: 8.0, actual_hours: 6.0 });
    assertEqual(d3.delta, -2.0, 'Écart doit être -2.0h');
    assertEqual(d3.positive, 0.0, 'Positif doit être 0');
    assertEqual(d3.negative, 2.0, 'Négatif doit être 2.0h');
  });

  await runTest('Suite 3: Calculs', '3.4 Règle Arrêt Maladie (compté fait, neutralité absolue)', async () => {
    // Créer une journée maladie pour Bob en novembre 2026 : 4h attendues, 4h comptées
    await db.run(`
      INSERT INTO daily_entries (user_id, entry_date, start_time, end_time, break_minutes, expected_hours, actual_hours, notes)
      VALUES (?, '2026-11-03', NULL, NULL, 0, 4.0, 4.0, 'Arrêt maladie test')
    `, [bobId]);

    const delta = computeDailyDelta({ expected_hours: 4.0, actual_hours: 4.0 });
    assertEqual(delta.delta, 0.0, 'Arrêt maladie avec expected = actual doit avoir un delta nul');
    assertEqual(delta.negative, 0.0, 'Aucune dette ne doit être créée lors d\'un arrêt maladie');
  });

  await runTest('Suite 3: Calculs', '3.5 Décompte Annuel Scolaire (Quota 800h Septembre -> Août)', async () => {
    const annual = await getAnnualCockpitSummary(bobId, 2026);
    assertEqual(annual.school_year, '2026 - 2027', 'L\'année scolaire doit être 2026 - 2027');
    assertEqual(annual.annual_contract_hours, 800, 'Le quota par défaut doit être de 800h');
    // Bob a 56h (octobre) + 4h (novembre maladie) = 60h faites
    assertEqual(annual.total_worked_hours, 60, 'Bob doit totaliser 60h');
    assertEqual(annual.remaining_contract_hours, 740, 'Reste à faire : 800 - 60 = 740h');
    assertEqual(annual.overtime_contract_hours, 0, 'Le surplus au-delà de 800h doit être de 0h');
  });

  // -------------------------------------------------------------------------
  // SUITE 4 : SÉCURITÉ, AUTHENTIFICATION & MODE ADMIN MASTER PIN
  // -------------------------------------------------------------------------
  console.log('\n📁 SUITE 4 : SÉCURITÉ, AUTHENTIFICATION & CODE PIN ADMIN');

  await runTest('Suite 4: Sécurité', '4.1 Hachage robuste des mots de passe en PBKDF2 salé (aucun mot de passe en clair)', async () => {
    const userRow = await db.get<any>(`SELECT password_hash FROM users WHERE username = 'audit_bob'`);
    assert(Boolean(userRow.password_hash), 'Le hachage du mot de passe doit exister');
    assert(!userRow.password_hash.includes('Password456!'), 'Le mot de passe en clair ne doit JAMAIS apparaître');
    assert(userRow.password_hash.includes(':'), 'Le hash PBKDF2 doit contenir un sel séparé par deux-points');
    assertEqual(userRow.password_hash.length, 97, 'Le hash PBKDF2 salé doit comporter 97 caractères (32 car. sel + 1 + 64 car. hash)');
  });

  await runTest('Suite 4: Sécurité', '4.2 Rejet des identifiants incorrects au login', async () => {
    let failed = false;
    try {
      await login({ username: 'audit_bob', password: 'MauvaisMotDePasse' });
    } catch {
      failed = true;
    }
    assert(failed, 'La connexion avec un mauvais mot de passe doit être refusée');
  });

  await runTest('Suite 4: Sécurité', '4.3 Connexion réussie avec bon mot de passe et génération de session', async () => {
    const session = await login({ username: 'audit_bob', password: 'Password456!' });
    assert(Boolean(session.token), 'Un token de session doit être généré');
    assertEqual(session.user.username, 'audit_bob', 'L\'utilisateur connecté doit être Bob');
  });

  await runTest('Suite 4: Sécurité', '4.4 Vérification du code PIN Admin Master (1234 par défaut)', async () => {
    const valid = await verifyAdminPin('1234');
    assertEqual(valid, true, 'Le code PIN par défaut 1234 doit renvoyer true');

    const wrong = await verifyAdminPin('9999');
    assertEqual(wrong, false, 'Un code PIN erroné (9999) doit renvoyer false');
  });

  await runTest('Suite 4: Sécurité', '4.5 Modification du code PIN Admin et bascule vers le nouveau PIN', async () => {
    // Changer de 1234 vers 5678
    await changeAdminPin('1234', '5678');

    // Vérifier que 5678 fonctionne maintenant
    const newPinValid = await verifyAdminPin('5678');
    assertEqual(newPinValid, true, 'Le nouveau code PIN 5678 doit être accepté');

    // Vérifier que l'ancien 1234 est désormais rejeté
    const oldPinValid = await verifyAdminPin('1234');
    assertEqual(oldPinValid, false, 'L\'ancien code PIN 1234 doit maintenant être refusé');

    // Remettre le PIN d'origine 1234 pour laisser le système propre
    await changeAdminPin('5678', '1234');
    const restoredPinValid = await verifyAdminPin('1234');
    assertEqual(restoredPinValid, true, 'Le code PIN 1234 d\'origine doit être restauré');
  });

  await runTest('Suite 4: Sécurité', '4.6 Protection du Reset Serveur Total (RESET_SERVEUR obligatoire)', async () => {
    let badConfirmationRejected = false;
    try {
      await resetServerAll('MAUVAISE_CHAINE');
    } catch {
      badConfirmationRejected = true;
    }
    assert(badConfirmationRejected, 'resetServerAll doit refuser toute chaîne différente de RESET_SERVEUR');
  });

  // -------------------------------------------------------------------------
  // SUITE 5 : SANTÉ SQLITE, CONCURRENCE WAL ET INTÉGRITÉ PHYSIQUE
  // -------------------------------------------------------------------------
  console.log('\n📁 SUITE 5 : SANTÉ SQLITE & INTÉGRITÉ PHYSIQUE');

  await runTest('Suite 5: SQLite', '5.1 PRAGMA integrity_check de la base', async () => {
    const status = await getDatabaseStatus();
    assertEqual(status.integrity, 'ok', 'L\'intégrité SQLite doit renvoyer "ok"');
    assert(status.databaseSizeKb > 0, 'La taille de la base doit être supérieure à 0 Ko');
  });

  await runTest('Suite 5: SQLite', '5.2 Mode WAL actif et persistance des écritures', async () => {
    const journalMode = (await db.get<any>(`PRAGMA journal_mode`)).journal_mode;
    assertEqual(journalMode.toLowerCase(), 'wal', 'Le journal mode doit être WAL');
  });

  await runTest('Suite 5: SQLite', '5.3 Opération VACUUM et compactage sans corruption', async () => {
    const opt = await optimizeDatabase();
    assert(opt.success === true, 'L\'optimisation et le VACUUM doivent réussir');
    const statusPost = await getDatabaseStatus();
    assertEqual(statusPost.integrity, 'ok', 'L\'intégrité après compactage doit rester "ok"');
  });

  // -------------------------------------------------------------------------
  // NETTOYAGE POST-AUDIT DES UTILISATEURS DE TEST
  // -------------------------------------------------------------------------
  console.log('\n🧹 NETTOYAGE DES UTILISATEURS DE TEST...');
  await resetUserData(bobId);
  await db.run(`DELETE FROM users WHERE id IN (?, ?)`, [aliceId, bobId]);
  console.log('✨ Nettoyage terminé : Alice et Bob ont été supprimés proprement.');

  // -------------------------------------------------------------------------
  // RÉCAPITULATIF FINAL
  // -------------------------------------------------------------------------
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n================================================================');
  console.log(`📊 BILAN DE L'AUDIT : ${passed}/${total} TESTS RÉUSSIS (${failed} échec)`);
  console.log('================================================================\n');

  return { total, passed, failed, results };
}

// Exécuter si appelé directement via CLI
if (require.main === module || process.argv[1]?.includes('comprehensiveAudit')) {
  runComprehensiveAudit()
    .then((res) => {
      if (res.failed > 0) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error('Erreur critique pendant l\'audit :', err);
      process.exit(1);
    });
}
