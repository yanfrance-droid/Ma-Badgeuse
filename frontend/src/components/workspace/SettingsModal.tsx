import React from 'react';
import { ChangePasswordForm } from '../ChangePasswordForm';
import { AdminPanel } from '../AdminPanel';
import { Modal } from '../Modal';
import { notify } from '../Toaster';
import { formatDuration } from '../../utils/format';
import {
  Bell,
  BellRing,
  CheckCircle2,
  History,
  Monitor,
  Moon,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  X
} from 'lucide-react';
import { computeReminderTimeFromEnd } from '../../services/notificationService';
import { ACTION_LABELS, ENTITY_LABELS, SettingsTab, auditDetail } from '../../domain';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Fenêtre des réglages : horaires, compte, historique, administration. */
export const SettingsModal: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const {
    currentUser,
    appTheme,
    handleChangeTheme,
    habitualForm,
    setHabitualForm,
    profileForm,
    setProfileForm,
    savingHabitual,
    showSettingsModal,
    setShowSettingsModal,
    settingsTab,
    resetConfirmationInput,
    setResetConfirmationInput,
    isResetting,
    auditLogs,
    loadingAudit,
    reminderConfig,
    notificationPermission,
    testingNotification,
    updateReminderConfig,
    handleToggleReminder,
    handleTestReminder,
    handleUndo,
    selectSettingsTab,
    handleSaveHabitualSchedule,
    handleResetMyPersonalData
  } = app;

  return (
    <>
      {/* ========================================================= */}
      {/* MODALE : RÉGLAGES (HORAIRES, COMPTE, HISTORIQUE, ADMIN)   */}
      {/* ========================================================= */}
      {showSettingsModal && (
        <Modal
          onClose={() => setShowSettingsModal(false)}
          labelledBy="settings-title"
          className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs text-slate-700 dark:text-slate-200 max-h-[92vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <div className="flex items-center space-x-2">
              <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <div>
                <h3 id="settings-title" className="text-base font-black text-slate-900 dark:text-slate-100 leading-tight">
                  Réglages
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {currentUser.display_name} (@{currentUser.username}){currentUser.is_admin ? ' • administrateur' : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSettingsModal(false)}
              aria-label="Fermer les réglages"
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* ONGLETS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-2xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700" role="tablist">
            {(
              [
                { id: 'SCHEDULE', label: 'Horaires' },
                { id: 'ACCOUNT', label: 'Mon compte' },
                { id: 'HISTORY', label: 'Historique' },
                ...(currentUser.is_admin ? [{ id: 'ADMIN', label: 'Administration' }] : [])
              ] as Array<{ id: SettingsTab; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={settingsTab === tab.id}
                onClick={() => selectSettingsTab(tab.id)}
                className={`py-2 rounded-xl font-bold text-xs transition ${
                  settingsTab === tab.id
                    ? tab.id === 'ADMIN'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-blue-950 dark:text-blue-200 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ONGLET 1 : HORAIRES, IDENTITÉ, RAPPELS, THÈME */}
          {settingsTab === 'SCHEDULE' && (
            <form onSubmit={handleSaveHabitualSchedule} className="space-y-3.5">
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed bg-blue-50/60 dark:bg-slate-800/60 p-2.5 rounded-xl border border-blue-100 dark:border-slate-700">
                Ces horaires sont proposés par défaut pour chaque nouvelle journée. Ils sont enregistrés sur le serveur et suivent votre compte sur tous vos appareils.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2">
                  <label htmlFor="profile-agent" className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Nom et prénom (relevés imprimés) :
                  </label>
                  <input
                    id="profile-agent"
                    type="text"
                    maxLength={120}
                    placeholder={currentUser.display_name}
                    value={profileForm.agentName}
                    onChange={(e) => setProfileForm({ ...profileForm, agentName: e.target.value })}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="profile-employer" className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Employeur (facultatif) :
                  </label>
                  <input
                    id="profile-employer"
                    type="text"
                    maxLength={120}
                    placeholder="Ex : Mairie de ..."
                    value={profileForm.employerName}
                    onChange={(e) => setProfileForm({ ...profileForm, employerName: e.target.value })}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="profile-job" className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Poste (facultatif) :
                  </label>
                  <input
                    id="profile-job"
                    type="text"
                    maxLength={120}
                    placeholder="Ex : Agent de restauration scolaire"
                    value={profileForm.jobTitle}
                    onChange={(e) => setProfileForm({ ...profileForm, jobTitle: e.target.value })}
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="habit-start" className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Arrivée habituelle :
                  </label>
                  <input
                    id="habit-start"
                    type="time"
                    value={habitualForm.startTime}
                    onChange={(e) => setHabitualForm({ ...habitualForm, startTime: e.target.value })}
                    className="w-full h-11 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 font-black text-center text-base text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="habit-end" className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Départ habituel :
                  </label>
                  <input
                    id="habit-end"
                    type="time"
                    value={habitualForm.endTime}
                    onChange={(e) => setHabitualForm({ ...habitualForm, endTime: e.target.value })}
                    className="w-full h-11 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 font-black text-center text-base text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-200">Pause repas habituelle :</span>
                  <span className="font-black text-blue-900 dark:text-blue-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-blue-200 dark:border-slate-700">
                    {habitualForm.breakMinutes} min
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {[0, 15, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setHabitualForm({ ...habitualForm, breakMinutes: m })}
                      className={`py-1.5 rounded-lg text-xs font-bold border transition ${
                        habitualForm.breakMinutes === m
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
                <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <label htmlFor="habit-break" className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Autre durée (minutes) :
                  </label>
                  <input
                    id="habit-break"
                    type="number"
                    min="0"
                    max="180"
                    step="5"
                    value={habitualForm.breakMinutes}
                    onChange={(e) => setHabitualForm({ ...habitualForm, breakMinutes: Math.min(180, Math.max(0, parseInt(e.target.value, 10) || 0)) })}
                    className="w-16 h-7 text-center font-black text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="habit-expected" className="font-bold text-slate-700 dark:text-slate-200">
                    Heures attendues par jour :
                  </label>
                  <span className="font-black text-blue-900 dark:text-blue-300 bg-blue-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-blue-200 dark:border-slate-700">
                    {formatDuration(habitualForm.expectedHours)}
                  </span>
                </div>
                <input
                  id="habit-expected"
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  value={habitualForm.expectedHours}
                  onChange={(e) => setHabitualForm({ ...habitualForm, expectedHours: parseFloat(e.target.value) || 0 })}
                  className="w-full h-9 text-center font-black text-base bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                  required
                />
              </div>

              {/* RAPPELS */}
              <div className="bg-amber-50/70 dark:bg-slate-800/60 p-3 rounded-2xl border border-amber-200/90 dark:border-amber-900/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Bell className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-100 text-xs block">Rappel d'oubli de pointage</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">Notification sur cet appareil, application ouverte</span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reminderConfig.enabled}
                      onChange={(e) => handleToggleReminder(e.target.checked)}
                      className="sr-only peer"
                      aria-label="Activer le rappel de pointage"
                    />
                    <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {reminderConfig.enabled && (
                  <div className="space-y-2.5 pt-2 border-t border-amber-200/60 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Quand me rappeler ?</span>
                      <span className="text-[11px] font-black text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800">
                        Rappel à{' '}
                        {reminderConfig.mode === 'AFTER_END' ? computeReminderTimeFromEnd(habitualForm.endTime, reminderConfig.delayMinutes) : reminderConfig.time}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {[15, 30, 45, 60].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() =>
                            updateReminderConfig({
                              ...reminderConfig,
                              mode: 'AFTER_END',
                              delayMinutes: mins,
                              time: computeReminderTimeFromEnd(habitualForm.endTime, mins)
                            })
                          }
                          className={`py-1 rounded-lg text-xs font-bold border transition ${
                            reminderConfig.mode === 'AFTER_END' && reminderConfig.delayMinutes === mins
                              ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          +{mins} min
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                      <label htmlFor="reminder-time" className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                        Ou une heure fixe :
                      </label>
                      <input
                        id="reminder-time"
                        type="time"
                        value={reminderConfig.time}
                        onChange={(e) => updateReminderConfig({ ...reminderConfig, mode: 'CUSTOM_TIME', time: e.target.value })}
                        className="h-7 px-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-bold text-xs text-center"
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-amber-200/50 dark:border-slate-700">
                      <span className="text-[10px] text-slate-600 dark:text-slate-400 italic">
                        {notificationPermission === 'granted' ? 'Notifications autorisées' : 'Autorisation requise'}
                      </span>
                      <button
                        type="button"
                        disabled={testingNotification}
                        onClick={handleTestReminder}
                        className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-slate-700 text-amber-900 dark:text-amber-200 text-[11px] font-bold rounded-xl border border-amber-300 dark:border-slate-700 flex items-center space-x-1"
                      >
                        <BellRing className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{testingNotification ? 'Envoi...' : 'Tester'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* THÈME */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-slate-800 dark:text-slate-100 text-xs block">Thème d'affichage</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'LIGHT', label: 'Clair', Icon: Sun, active: 'bg-amber-500 text-white border-amber-600' },
                      { id: 'DARK', label: 'Sombre', Icon: Moon, active: 'bg-indigo-600 text-white border-indigo-700' },
                      { id: 'SYSTEM', label: 'Automatique', Icon: Monitor, active: 'bg-emerald-600 text-white border-emerald-700' }
                    ] as const
                  ).map(({ id, label, Icon, active }) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={appTheme === id}
                      onClick={() => handleChangeTheme(id)}
                      className={`py-2 px-1.5 rounded-xl border flex flex-col items-center justify-center space-y-1 transition text-xs font-bold ${
                        appTheme === id
                          ? `${active} shadow-xs`
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={savingHabitual}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold transition shadow-md flex items-center justify-center space-x-1"
                >
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>{savingHabitual ? 'Enregistrement...' : 'Enregistrer'}</span>
                </button>
              </div>
            </form>
          )}

          {/* ONGLET 2 : MON COMPTE */}
          {settingsTab === 'ACCOUNT' && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" aria-hidden="true" />
                  Changer mon mot de passe
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Vos autres appareils seront déconnectés.</p>
                <ChangePasswordForm variant="inline" onDone={(message) => notify(message, 'success')} />
              </div>

              <div className="bg-rose-50/80 dark:bg-rose-950/40 p-4 rounded-2xl border-2 border-rose-200 dark:border-rose-900/60 space-y-2.5 text-rose-950 dark:text-rose-200">
                <span className="font-black text-xs flex items-center gap-1.5 text-rose-800 dark:text-rose-300">
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  Effacer mes données ({currentUser.display_name})
                </span>
                <p className="text-[11px] leading-snug">
                  Efface vos pointages, périodes, régularisations, objectifs mensuels et votre historique. Vos réglages et votre compte sont conservés, les autres comptes ne sont pas touchés. Une sauvegarde de sécurité est faite sur le serveur avant l'effacement.
                </p>
                <label htmlFor="reset-my-data" className="text-[11px] font-bold block">
                  Pour confirmer, tapez <code className="font-mono font-black">RESET</code> :
                </label>
                <input
                  id="reset-my-data"
                  type="text"
                  autoComplete="off"
                  value={resetConfirmationInput}
                  onChange={(e) => setResetConfirmationInput(e.target.value)}
                  className="w-full h-8 px-2.5 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-xl font-mono font-bold text-xs text-center"
                />
                <button
                  type="button"
                  disabled={resetConfirmationInput.trim() !== 'RESET' || isResetting}
                  onClick={handleResetMyPersonalData}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white font-black rounded-xl text-xs flex items-center justify-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{isResetting ? 'Effacement en cours...' : 'Effacer mes données'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ONGLET 3 : HISTORIQUE DES MODIFICATIONS */}
          {settingsTab === 'HISTORY' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-blue-600" aria-hidden="true" />
                  Mes 100 dernières modifications
                </span>
                <button type="button" onClick={handleUndo} className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-600 font-bold text-[11px] flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" aria-hidden="true" /> Annuler la dernière
                </button>
              </div>
              {loadingAudit ? (
                <p className="text-[11px] text-slate-400 italic">Chargement...</p>
              ) : auditLogs.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">Aucune modification enregistrée.</p>
              ) : (
                <ul className="space-y-1 max-h-[55vh] overflow-y-auto pr-1">
                  {auditLogs.map((log) => (
                    <li
                      key={log.id}
                      className={`p-2 rounded-xl border text-[11px] ${
                        log.undone_at
                          ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400 line-through'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong>
                          {ACTION_LABELS[log.action_type] ?? log.action_type} • {ENTITY_LABELS[log.entity_name] ?? log.entity_name}
                        </strong>
                        <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString('fr-FR')}</span>
                      </div>
                      {auditDetail(log) && <div className="text-slate-600 dark:text-slate-300">{auditDetail(log)}</div>}
                      {log.reason && <div className="text-slate-500 dark:text-slate-400 italic">{log.reason}</div>}
                      {log.undone_at && <div className="no-underline text-slate-500">Annulée le {new Date(log.undone_at).toLocaleString('fr-FR')}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ONGLET 4 : ADMINISTRATION (le serveur vérifie le rôle) */}
          {settingsTab === 'ADMIN' && currentUser.is_admin && <AdminPanel currentUser={currentUser} />}
        </Modal>
      )}
    </>
  );
};
