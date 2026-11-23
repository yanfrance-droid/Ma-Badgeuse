/**
 * Tests de bout en bout de l'API HTTP : authentification, droits, validation,
 * verrouillage des mois, sauvegardes, en-têtes de sécurité, concurrence.
 * Reprend les scénarios de l'audit de novembre 2026 (« sonde » A1 à K4).
 */
import { cleanupTestRoot, TEST_ROOT } from './runAuditIsolated';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { closeDatabase, initDatabase } from '../database';
import { createApp } from '../app';
import { accountLimiter, ipLimiter, registrationLimiter } from '../security';

let server: Server;
let baseUrl = '';

/** Petit client HTTP qui conserve le cookie de session, comme un navigateur. */
class Client {
  cookie = '';
  async request(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const init: RequestInit = { method, headers: { ...headers } };
    if (this.cookie) (init.headers as Record<string, string>).cookie = this.cookie;
    if (body instanceof FormData) {
      init.body = body;
    } else if (body !== undefined) {
      (init.headers as Record<string, string>)['content-type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(baseUrl + url, init);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0];
      this.cookie = pair.endsWith('=') ? '' : pair;
    }
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, headers: res.headers, data: data as any };
  }
  get(url: string) {
    return this.request('GET', url);
  }
  post(url: string, body?: unknown, headers?: Record<string, string>) {
    return this.request('POST', url, body ?? {}, headers);
  }
  put(url: string, body?: unknown) {
    return this.request('PUT', url, body ?? {});
  }
  del(url: string) {
    return this.request('DELETE', url);
  }
}

const admin = new Client();
const member = new Client();
const anonymous = new Client();

before(async () => {
  await initDatabase();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
  cleanupTestRoot();
});

describe('Premier lancement et comptes', () => {
  test('aucun compte par défaut : le premier inscrit devient administrateur', async () => {
    const status = await anonymous.get('/api/auth/setup-status');
    assert.equal(status.data.data.needs_setup, true);

    const login = await anonymous.post('/api/auth/login', { username: 'maman', password: '1234' });
    assert.equal(login.status, 401, "l'ancien compte maman/1234 n'existe plus");

    const res = await admin.post('/api/auth/register', { username: 'julie', displayName: 'Julie', password: 'mot-de-passe-solide' });
    assert.equal(res.status, 201);
    assert.equal(res.data.data.user.is_admin, true);
    assert.equal(res.data.data.user.token, undefined, "le jeton n'est jamais renvoyé au JavaScript");
    assert.match(res.headers.get('set-cookie') || '', /HttpOnly; SameSite=Strict/);
  });

  test("l'inscription est ensuite fermée", async () => {
    const res = await anonymous.post('/api/auth/register', { username: 'intrus', password: 'mot-de-passe-solide' });
    assert.equal(res.status, 403);
  });

  test('mot de passe de moins de 10 caractères refusé', async () => {
    const res = await admin.post('/api/admin/users', { username: 'paul', password: 'abcd' });
    assert.equal(res.status, 400);
  });

  test("l'administrateur crée un compte qui doit changer son mot de passe", async () => {
    const created = await admin.post('/api/admin/users', { username: 'paul', displayName: 'Paul', password: 'temporaire-paul' });
    assert.equal(created.status, 201);
    const login = await member.post('/api/auth/login', { username: 'paul', password: 'temporaire-paul' });
    assert.equal(login.data.data.user.must_change_password, true);
    const blocked = await member.get('/api/entries');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.code, 'PASSWORD_CHANGE_REQUIRED');
    const changed = await member.post('/api/auth/change-password', { currentPassword: 'temporaire-paul', newPassword: 'nouveau-paul-123' });
    assert.equal(changed.status, 200);
    assert.equal((await member.get('/api/entries')).status, 200);
  });

  test("réinitialisation par l'administrateur (plus de question secrète)", async () => {
    assert.equal((await anonymous.get('/api/auth/security-question?username=paul')).status, 401);
    assert.equal((await admin.get('/api/auth/security-question?username=paul')).status, 404);
    const users = await admin.get('/api/admin/users');
    const paul = users.data.data.find((u: any) => u.username === 'paul');
    const reset = await admin.post(`/api/admin/users/${paul.id}/reset-password`);
    assert.equal(reset.status, 200);
    const temp = reset.data.data.temporary_password;
    assert.equal((await member.get('/api/entries')).status, 401, 'les sessions de Paul sont fermées');
    const login = await member.post('/api/auth/login', { username: 'paul', password: temp });
    assert.equal(login.data.data.user.must_change_password, true);
    await member.post('/api/auth/change-password', { currentPassword: temp, newPassword: 'nouveau-paul-456' });
  });
});

describe('Droits et routes protégées', () => {
  test('le catalogue des statuts exige une session ; la modification exige un administrateur', async () => {
    assert.equal((await anonymous.get('/api/status')).status, 401);
    assert.equal((await anonymous.put('/api/status/1', { label: 'Pirate' })).status, 401);
    assert.equal((await member.put('/api/status/1', { label: 'Pirate' })).status, 403);
    assert.equal((await member.post('/api/status', { code: 'X', label: 'x', color_hex: '#000000', accounting_rule: 'NEUTRAL' })).status, 403);
    const ok = await admin.put('/api/status/1', { label: 'Congé payé (CP)' });
    assert.equal(ok.status, 200);
    const refused = await admin.put('/api/status/1', { accounting_rule: 'DEDUCTED' });
    assert.equal(refused.status, 409, "la règle d'un statut système est figée");
  });

  test("l'ancien code PIN n'existe plus et les sauvegardes sont réservées aux administrateurs", async () => {
    assert.equal((await anonymous.post('/api/auth/verify-admin-pin', { pin: '1234' })).status, 401);
    assert.equal((await member.post('/api/auth/verify-admin-pin', { pin: '1234' })).status, 404);
    assert.equal((await member.get('/api/backup/list')).status, 403);
    assert.equal((await member.get('/api/backup/status')).status, 403);
    assert.equal((await member.get('/api/backup/export-current')).status, 403);
    assert.equal((await member.get('/api/admin/users')).status, 403);
    assert.equal((await admin.get('/api/backup/status')).status, 200);
  });

  test("le téléchargement d'un instantané fonctionne pour l'administrateur et ne laisse pas de copie", async () => {
    const res = await admin.get('/api/backup/export-current');
    assert.equal(res.status, 200);
    assert.ok(String(res.data).startsWith('SQLite format 3'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const leftovers = fs.readdirSync(path.join(TEST_ROOT, 'backups', 'tmp')).filter((f) => f.startsWith('export_'));
    assert.deepEqual(leftovers, []);
  });

  test('traversée de chemin refusée', async () => {
    const res = await admin.get('/api/backup/download/..%2F..%2Fpackage.json');
    assert.ok([400, 404].includes(res.status));
  });
});

describe('Validation des saisies', () => {
  test('dates, heures et identifiants invalides refusés avec un message clair (400)', async () => {
    const cases = [
      { entry_date: '2026-13-45', expected_hours: 4 },
      { entry_date: '2026-02-30', expected_hours: 4 },
      { entry_date: '2026-10-05', manual_actual_hours: -500 },
      { entry_date: '2026-10-05', manual_actual_hours: 'abc' },
      { entry_date: '2026-10-05', status_id: 99999 },
      { entry_date: '2026-10-05', notes: 'x'.repeat(5000) },
      { entry_date: '2026-10-05', start_time: '25:00', end_time: '10:00' }
    ];
    for (const body of cases) {
      const res = await member.post('/api/entries', body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
      assert.ok(!/SQLITE|constraint/i.test(res.data.error), "aucun détail SQLite n'est exposé");
    }
  });

  test('régularisations et objectifs invalides refusés (400)', async () => {
    assert.equal((await member.post('/api/regularizations', { reg_date: 'nimporte', counter_type: 'POSITIVE', operation_type: 'ADD', amount_hours: 2, reason: 'x' })).status, 400);
    assert.equal((await member.post('/api/regularizations', { reg_date: '2026-10-01', counter_type: 'POSITIVE', operation_type: 'ADD', amount_hours: '5abc', reason: 'x' })).status, 400);
    assert.equal((await member.post('/api/targets', { year_month: 'nimporte', target_hours: 'abc' })).status, 400);
    assert.equal((await member.post('/api/targets', { year_month: '2026-10', target_hours: 99999 })).status, 400);
  });

  test("une déduction supérieure au solde est refusée", async () => {
    const res = await member.post('/api/regularizations', { reg_date: '2026-10-01', counter_type: 'POSITIVE', operation_type: 'SETTLE', amount_hours: 50, reason: 'Payé' });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /solde actuel/);
  });

  test('réglages : seules les clés connues et valides sont acceptées', async () => {
    assert.equal((await member.post('/api/settings', { cle_inventee: 'x' })).status, 400);
    assert.equal((await member.post('/api/settings', { habitual_start_time: 'pas-une-heure' })).status, 400);
    const ok = await member.post('/api/settings', { agent_name: 'Paul Martin', habitual_start_time: '11:00' });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.data.agent_name, 'Paul Martin');
  });
});

describe('Saisies, verrouillage et annulation', () => {
  test('la réponse à une saisie future est identique à sa relecture', async () => {
    const saved = await member.post('/api/entries', { entry_date: '2099-01-05', expected_hours: 4 });
    const read = await member.get('/api/entries/2099-01-05');
    assert.equal(saved.data.data.delta_hours, read.data.data.delta_hours);
    assert.equal(saved.data.data.delta_hours, 0);
  });

  test('un mois validé est verrouillé, puis modifiable une fois rouvert', async () => {
    assert.equal((await member.post('/api/entries', { entry_date: '2026-10-06', expected_hours: 4, start_time: '10:45', end_time: '14:45' })).status, 200);
    assert.equal((await member.post('/api/targets/2026-10/validate')).status, 200);
    const locked = await member.post('/api/entries', { entry_date: '2026-10-07', expected_hours: 4 });
    assert.equal(locked.status, 409);
    assert.equal((await member.del('/api/entries/2026-10-06')).status, 409);
    assert.equal((await member.post('/api/targets', { year_month: '2026-10', target_hours: 80 })).status, 409);
    assert.equal((await member.post('/api/periods', { label: 'Congés', start_date: '2026-10-19', end_date: '2026-10-23' })).status, 409);

    const undo = await member.post('/api/audit/undo');
    assert.equal(undo.status, 200, "l'annulation de la validation rouvre le mois");
    const summary = await member.get('/api/summary?month=2026-10');
    assert.equal(summary.data.data.current_month.is_validated, false);
    assert.equal((await member.post('/api/entries', { entry_date: '2026-10-07', expected_hours: 4 })).status, 200);
  });

  test('les périodes qui se chevauchent sont refusées ; la suppression est annulable', async () => {
    const first = await member.post('/api/periods', { label: 'Vacances', start_date: '2026-12-21', end_date: '2026-12-24' });
    assert.equal(first.status, 201);
    const overlap = await member.post('/api/periods', { label: 'Autre', start_date: '2026-12-23', end_date: '2026-12-30' });
    assert.equal(overlap.status, 409);
    assert.equal((await member.del(`/api/periods/${first.data.data.id}`)).status, 200);
    assert.equal((await member.post('/api/audit/undo')).status, 200);
    const periods = await member.get('/api/periods');
    assert.equal(periods.data.data.length, 1);
    assert.equal(periods.data.data[0].days_count, 4);
  });

  test('12 écritures simultanées réussissent toutes', async () => {
    const requests = [
      ...Array.from({ length: 6 }, (_, i) =>
        member.post('/api/periods', { label: `P${i}`, start_date: `2027-0${i + 1}-04`, end_date: `2027-0${i + 1}-05` })
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        member.post('/api/regularizations', { reg_date: '2026-11-02', counter_type: 'POSITIVE', operation_type: 'ADD', amount_hours: 1, reason: `R${i}` })
      )
    ];
    const results = await Promise.all(requests);
    assert.deepEqual(results.map((r) => r.status), Array(12).fill(201));
  });
});

describe('Restauration de sauvegarde', () => {
  test("un fichier qui n'est pas une base est refusé et le serveur reste opérationnel", async () => {
    const form = new FormData();
    form.append('database_file', new Blob(['ceci n’est pas une base']), 'photo.db');
    const res = await admin.request('POST', '/api/backup/upload-restore', form);
    assert.equal(res.status, 400);
    assert.equal((await member.get('/api/entries?month=2026-10')).status, 200);
  });

  test('une extension non autorisée est refusée', async () => {
    const form = new FormData();
    form.append('database_file', new Blob(['x']), 'photo.jpg');
    assert.equal((await admin.request('POST', '/api/backup/upload-restore', form)).status, 400);
  });

  test("une vraie sauvegarde est restaurée et l'application continue de fonctionner", async () => {
    const created = await admin.post('/api/backup/create');
    assert.equal(created.status, 201);
    await member.post('/api/entries', { entry_date: '2026-11-03', expected_hours: 4 });
    const restored = await admin.post(`/api/backup/restore/${created.data.data.filename}`);
    assert.equal(restored.status, 200);
    assert.ok(restored.data.safetyBackup.startsWith('safety_pre_restore_'));
    const entry = await member.get('/api/entries/2026-11-03');
    assert.equal(entry.status, 200);
    assert.equal(entry.data.data, null, 'la journée saisie après la sauvegarde a disparu');
  });
});

describe('Protections HTTP', () => {
  test('en-têtes de sécurité, pas de CORS ouvert, pas de X-Powered-By', async () => {
    const res = await anonymous.request('GET', '/api/health', undefined, { origin: 'http://evil.example' });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.match(res.headers.get('content-security-policy') || '', /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  test("une écriture venant d'une autre origine est refusée", async () => {
    const res = await member.post('/api/entries', { entry_date: '2026-11-04', expected_hours: 4 }, { origin: 'http://evil.example' });
    assert.equal(res.status, 403);
  });

  test('route API inconnue → 404 JSON ; corps trop gros → 413 ; JSON invalide → 400', async () => {
    const unknown = await member.get('/api/inconnu');
    assert.equal(unknown.status, 404);
    assert.equal(unknown.data.success, false);
    const big = await anonymous.post('/api/auth/login', { username: 'x'.repeat(200000), password: 'y' });
    assert.equal(big.status, 413);
    const invalid = await anonymous.request('POST', '/api/auth/login', '{pas du json');
    assert.equal(invalid.status, 400);
  });

  test('export CSV du mois', async () => {
    const res = await member.get('/api/export/entries.csv?month=2026-10');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/csv/);
    assert.match(String(res.data), /Date;Arrivée;Départ/);
  });

  test('anti-force brute : 5 échecs bloquent le compte, même avec le bon mot de passe', async () => {
    accountLimiter.clearAll();
    ipLimiter.clearAll();
    registrationLimiter.clearAll();
    const attacker = new Client();
    for (let i = 0; i < 5; i++) {
      assert.equal((await attacker.post('/api/auth/login', { username: 'julie', password: `faux-${i}` })).status, 401);
    }
    const blocked = await attacker.post('/api/auth/login', { username: 'julie', password: 'mot-de-passe-solide' });
    assert.equal(blocked.status, 429);
    accountLimiter.clearAll();
    ipLimiter.clearAll();
  });

  test('la déconnexion invalide la session côté serveur', async () => {
    const tmp = new Client();
    await tmp.post('/api/auth/login', { username: 'julie', password: 'mot-de-passe-solide' });
    const stolen = tmp.cookie;
    assert.equal((await tmp.post('/api/auth/logout')).status, 200);
    const replay = new Client();
    replay.cookie = stolen;
    assert.equal((await replay.get('/api/entries')).status, 401);
  });
});
