import React, { useEffect, useState } from 'react';
import { AlertTriangle, Download, HardDrive, RefreshCw, ShieldCheck, ShieldAlert, Trash2, UserPlus, Users, KeyRound } from 'lucide-react';
import { BackupItem, DatabaseStatus, User } from '../types';
import {
  apiCreateUser,
  apiDeleteUser,
  apiGetAdminSettings,
  apiListUsers,
  apiResetUserPassword,
  apiSetRegistrationOpen,
  apiSetUserAdmin,
  backupDownloadUrl,
  createBackupNow,
  exportCurrentDatabaseUrl,
  fetchBackupList,
  fetchDatabaseStatus,
  restoreBackup,
  triggerOptimizeDatabase,
  triggerResetServerAll,
  uploadRestoreBackup
} from '../api';
import { notify } from './Toaster';

interface Props {
  currentUser: User;
}

const CARD = 'bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5';
const SMALL_INPUT = 'w-full h-8 px-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 text-xs';

/**
 * Administration du serveur, visible uniquement par les comptes administrateurs
 * (le serveur vérifie lui-même le rôle à chaque requête).
 */
export const AdminPanel: React.FC<Props> = ({ currentUser }) => {
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [resetInput, setResetInput] = useState('');
  const [newUser, setNewUser] = useState({ username: '', displayName: '', password: '' });
  const [lastTemporaryPassword, setLastTemporaryPassword] = useState<{ username: string; password: string } | null>(null);

  const refresh = async () => {
    try {
      const [status, list, accounts, settings] = await Promise.all([
        fetchDatabaseStatus(),
        fetchBackupList(),
        apiListUsers(),
        apiGetAdminSettings()
      ]);
      setDbStatus(status);
      setBackups(list);
      setUsers(accounts);
      setRegistrationOpen(settings.registration_open);
    } catch (err) {
      notify(`Erreur de chargement de l'administration : ${(err as Error).message}`, 'error');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  /** Exécute une action en bloquant les boutons, avec message de résultat. */
  const run = async (key: string, action: () => Promise<string | void>, reloadApp = false) => {
    setBusy(key);
    try {
      const message = await action();
      if (message) notify(message, 'success');
      if (reloadApp) {
        // Après une restauration ou un effacement, tout l'état affiché est périmé.
        window.setTimeout(() => window.location.reload(), 1200);
        return;
      }
      await refresh();
    } catch (err) {
      notify(`Erreur : ${(err as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const integrityBadge = !dbStatus
    ? { text: 'Vérification...', cls: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300' }
    : dbStatus.integrityOk
    ? { text: 'Base saine', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800' }
    : { text: 'Problème détecté', cls: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800' };

  return (
    <div className="space-y-4">
      {/* 1. SANTÉ DE LA BASE */}
      <div className={CARD}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            {dbStatus && !dbStatus.integrityOk ? <ShieldAlert className="w-4 h-4 text-rose-600" aria-hidden="true" /> : <ShieldCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />}
            État de la base
          </span>
          <span className={`text-[11px] font-black px-2 py-0.5 rounded-full border ${integrityBadge.cls}`}>● {integrityBadge.text}</span>
        </div>
        {dbStatus && !dbStatus.integrityOk && (
          <p className="text-[11px] text-rose-700 dark:text-rose-300">Détail : {dbStatus.integrity}. Restaurez une sauvegarde récente.</p>
        )}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
            Taille : <strong>{dbStatus ? `${dbStatus.databaseSizeKb} Ko` : '…'}</strong>
          </div>
          <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
            Journées : <strong>{dbStatus ? dbStatus.totalEntries : '…'}</strong> • Comptes : <strong>{dbStatus ? dbStatus.totalUsers : '…'}</strong>
          </div>
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('optimize', async () => (await triggerOptimizeDatabase()).message)}
          className="w-full py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-slate-700 flex items-center justify-center gap-1.5 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          {busy === 'optimize' ? 'Optimisation...' : 'Optimiser et compacter la base'}
        </button>
      </div>

      {/* 2. SAUVEGARDES */}
      <div className={CARD}>
        <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <HardDrive className="w-4 h-4 text-blue-600" aria-hidden="true" />
          Sauvegardes
        </span>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Le serveur fait une sauvegarde par jour et garde les 14 dernières, plus les 20 dernières sauvegardes de sécurité (avant restauration ou effacement).
          {dbStatus?.lastBackupDate && <> Dernière : {new Date(dbStatus.lastBackupDate).toLocaleString('fr-FR')}.</>}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={exportCurrentDatabaseUrl}
            download
            className="py-2.5 px-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 text-xs text-center"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Télécharger la base
          </a>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('backup', async () => `Sauvegarde ${(await createBackupNow()).filename} créée.`)}
            className="py-2.5 px-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 disabled:opacity-50 text-white font-bold rounded-xl text-xs"
          >
            {busy === 'backup' ? 'Création...' : '➕ Sauvegarde serveur'}
          </button>
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 block">Sauvegardes sur le serveur ({backups.length}) :</span>
          {backups.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic">Aucune sauvegarde.</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {backups.map((b) => (
                <li key={b.filename} className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-[11px]">
                  <div className="min-w-0">
                    <span className="font-bold block truncate" title={b.filename}>{b.filename}</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {new Date(b.createdAt).toLocaleString('fr-FR')} • {Math.round(b.sizeBytes / 1024)} Ko
                      {b.isAuto && ' • auto'}
                      {b.isSafety && ' • sécurité'}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <a href={backupDownloadUrl(b.filename)} download className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 font-bold text-[11px]" aria-label={`Télécharger ${b.filename}`}>
                      ⬇
                    </a>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        if (!window.confirm(`Restaurer « ${b.filename} » ?\n\nToutes les données actuelles seront remplacées. Une sauvegarde de sécurité sera faite avant.`)) return;
                        run('restore', async () => (await restoreBackup(b.filename)).message, true);
                      }}
                      className="px-2 py-1 bg-slate-100 hover:bg-blue-50 dark:bg-slate-700 text-blue-700 dark:text-blue-300 rounded-lg font-bold text-[11px] border border-slate-200 dark:border-slate-600 disabled:opacity-50"
                    >
                      Restaurer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!restoreFile) return;
            if (!window.confirm(`Importer « ${restoreFile.name} » ?\n\nLe fichier sera vérifié avant de remplacer les données actuelles. Une sauvegarde de sécurité sera faite avant.`)) return;
            run('upload', async () => (await uploadRestoreBackup(restoreFile)).message, true);
          }}
          className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2"
        >
          <label htmlFor="restore-file" className="text-[11px] font-bold text-slate-700 dark:text-slate-200 block">
            Restaurer depuis un fichier (.sqlite) :
          </label>
          <input id="restore-file" type="file" accept=".sqlite,.db" onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)} className="w-full text-xs" />
          <button type="submit" disabled={!restoreFile || busy !== null} className="w-full py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs">
            {busy === 'upload' ? 'Vérification et restauration...' : 'Importer et restaurer'}
          </button>
        </form>
      </div>

      {/* 3. COMPTES */}
      <div className={CARD}>
        <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-blue-600" aria-hidden="true" />
          Comptes ({users.length})
        </span>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={registrationOpen}
            disabled={busy !== null}
            onChange={(e) => {
              const open = e.target.checked;
              run('registration', async () => {
                await apiSetRegistrationOpen(open);
                return open ? "Inscription ouverte : toute personne sur le réseau peut créer un compte." : 'Inscription fermée.';
              });
            }}
          />
          Autoriser la création libre de comptes depuis l'écran de connexion
        </label>

        {lastTemporaryPassword && (
          <div role="status" className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
            Mot de passe temporaire de <strong>{lastTemporaryPassword.username}</strong> :{' '}
            <code className="font-mono font-black select-all">{lastTemporaryPassword.password}</code>
            <br />
            Transmettez-le de vive voix ; il devra être changé à la première connexion. Il ne sera plus affiché.
          </div>
        )}

        <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {users.map((u) => {
            const isSelf = u.id === currentUser.id;
            return (
              <li key={u.id} className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <strong className="block">
                      {u.display_name} {u.is_admin && <span className="text-[10px] px-1.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">admin</span>}
                      {isSelf && <span className="text-[10px] text-slate-400"> (vous)</span>}
                    </strong>
                    <span className="text-[11px] text-slate-500 font-mono">@{u.username}</span>
                    {u.must_change_password && <span className="text-[10px] text-amber-700 dark:text-amber-300"> • mot de passe à changer</span>}
                  </div>
                </div>
                {!isSelf && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        if (!window.confirm(`Générer un mot de passe temporaire pour ${u.display_name} ?\nSes appareils seront déconnectés.`)) return;
                        run('reset-pw', async () => {
                          const result = await apiResetUserPassword(u.id);
                          setLastTemporaryPassword({ username: u.username, password: result.temporary_password });
                          return `Mot de passe temporaire généré pour ${u.display_name}.`;
                        });
                      }}
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 font-bold text-[11px] flex items-center gap-1 disabled:opacity-50"
                    >
                      <KeyRound className="w-3 h-3" aria-hidden="true" /> Mot de passe temporaire
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        run('admin', async () => {
                          await apiSetUserAdmin(u.id, !u.is_admin);
                          return u.is_admin ? `${u.display_name} n'est plus administrateur.` : `${u.display_name} est maintenant administrateur.`;
                        })
                      }
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 font-bold text-[11px] disabled:opacity-50"
                    >
                      {u.is_admin ? 'Retirer admin' : 'Rendre admin'}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        if (!window.confirm(`Supprimer définitivement le compte de ${u.display_name} (@${u.username}) et toutes ses données ?\nCette action ne peut pas être annulée (sauf restauration d'une sauvegarde).`)) return;
                        run('delete', async () => {
                          await apiDeleteUser(u.id);
                          return `Compte de ${u.display_name} supprimé.`;
                        });
                      }}
                      className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 rounded-lg text-[11px] font-bold border border-rose-200 dark:border-rose-900 flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" /> Supprimer
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            run('create', async () => {
              const created = await apiCreateUser(newUser);
              setNewUser({ username: '', displayName: '', password: '' });
              return `Compte ${created.username} créé. Le mot de passe devra être changé à la première connexion.`;
            });
          }}
          className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5"
        >
          <span className="text-[11px] font-bold flex items-center gap-1">
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> Créer un compte
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <input aria-label="Prénom affiché" placeholder="Prénom affiché" value={newUser.displayName} onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })} className={SMALL_INPUT} required />
            <input
              aria-label="Identifiant"
              placeholder="identifiant"
              autoCapitalize="none"
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })}
              className={SMALL_INPUT}
              required
            />
          </div>
          <input
            aria-label="Mot de passe provisoire"
            placeholder="Mot de passe provisoire (10 caractères min.)"
            type="text"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            className={SMALL_INPUT}
            required
            minLength={10}
          />
          <button type="submit" disabled={busy !== null} className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs">
            Créer le compte
          </button>
        </form>
      </div>

      {/* 4. ZONE DANGEREUSE */}
      <div className="bg-rose-50/80 dark:bg-rose-950/40 p-3.5 rounded-2xl border-2 border-rose-300 dark:border-rose-900 space-y-2 text-rose-950 dark:text-rose-200">
        <span className="font-black text-xs flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-rose-600" aria-hidden="true" />
          Effacer les données de TOUS les comptes
        </span>
        <p className="text-[11px] leading-snug">
          Efface les pointages, périodes, régularisations, objectifs et historiques de tous les comptes. Les comptes et leurs réglages sont conservés. Une sauvegarde de sécurité est faite avant.
        </p>
        <label htmlFor="reset-server" className="text-[11px] font-bold block">
          Tapez exactement <code className="font-mono">RESET_SERVEUR</code> pour confirmer :
        </label>
        <input id="reset-server" type="text" value={resetInput} onChange={(e) => setResetInput(e.target.value)} className={`${SMALL_INPUT} font-mono text-center`} autoComplete="off" />
        <button
          type="button"
          disabled={resetInput !== 'RESET_SERVEUR' || busy !== null}
          onClick={() => {
            if (!window.confirm('Dernière confirmation : effacer les données de tous les comptes ?')) return;
            run('reset-server', async () => {
              const res = await triggerResetServerAll(resetInput);
              setResetInput('');
              return `${res.message}\nSauvegarde de sécurité : ${res.safetyBackup}`;
            }, true);
          }}
          className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          {busy === 'reset-server' ? 'Effacement...' : 'Effacer les données de tous les comptes'}
        </button>
      </div>
    </div>
  );
};
