import React from 'react';
import { Modal } from '../Modal';
import { formatDuration } from '../../utils/format';
import { formatShortDate } from '../../utils/dates';
import { CheckCircle2, Trash2, X } from 'lucide-react';
import { ABSENCE_REASONS } from '../../domain';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Fenêtre « Poser des jours à 0 h / congés » sur plusieurs jours. */
export const PeriodModal: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const {
    habitualSchedule,
    showPeriodModal,
    setShowPeriodModal,
    periodForm,
    setPeriodForm,
    savingPeriod,
    periods,
    handleSavePeriod,
    handleDeletePeriod
  } = app;

  return (
    <>
      {/* ========================================================= */}
      {/* MODALE POUR POSER UNE PÉRIODE (MULTI-JOURS)               */}
      {/* ========================================================= */}
      {showPeriodModal && (
        <Modal
          onClose={() => setShowPeriodModal(false)}
          labelledBy="period-title"
          className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-4.5 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 max-h-[92vh] overflow-y-auto"
        >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <div>
                <h3 id="period-title" className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                  <span className="text-lg">🏖️</span>
                  <span>Poser mes jours à 0 h / Congés / Vacances</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enregistrer des jours à 0h, vacances ou absence sur plusieurs jours en 1 clic
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPeriodModal(false)}
                aria-label="Fermer"
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* PÉRIODES DÉJÀ POSÉES */}
            {periods.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-100 block">Périodes déjà posées ({periods.length}) :</span>
                <ul className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {periods.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                      <span className="min-w-0">
                        <strong className="block truncate">{p.label}</strong>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {formatShortDate(p.start_date)} → {formatShortDate(p.end_date)}/{p.end_date.slice(0, 4)}
                          {p.days_count !== undefined && ` • ${p.days_count} jour(s)`}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeletePeriod(p)}
                        aria-label={`Supprimer la période ${p.label}`}
                        className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg shrink-0"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleSavePeriod} className="space-y-3.5 text-xs">
              {/* DATES DE DÉBUT ET DE FIN */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Du (Date début) :</label>
                  <input
                    type="date"
                    value={periodForm.startDate}
                    onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })}
                    className="w-full h-10 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Au (Date fin) :</label>
                  <input
                    type="date"
                    value={periodForm.endDate}
                    onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })}
                    className="w-full h-10 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              {/* MOTIF D'ABSENCE / CONGÉS */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Motif :</label>
                <select
                  value={periodForm.reasonId}
                  onChange={(e) => {
                    const r = ABSENCE_REASONS.find((item) => item.id === e.target.value) || ABSENCE_REASONS[0];
                    setPeriodForm({
                      ...periodForm,
                      reasonId: r.id,
                      label: r.label,
                      impact: r.defaultImpact
                    });
                  }}
                  className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-800 dark:text-slate-100"
                >
                  {ABSENCE_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* IMPACT SUR LE COMPTEUR */}
              <div className="space-y-1">
                <span className="font-bold text-slate-700 dark:text-slate-200 block">Comment compter ces journées ?</span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPeriodForm({ ...periodForm, impact: 'NEUTRAL' })}
                    className={`p-2 rounded-xl border text-center text-xs font-bold transition ${
                      periodForm.impact === 'NEUTRAL'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="block text-sm">🏖️</span>
                    <span className="block text-[11px] font-black">Jour à 0 h</span>
                    <span className="text-[9px] block opacity-80">0h faite / 0h due</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPeriodForm({ ...periodForm, impact: 'COUNTED_AS_WORKED' })}
                    className={`p-2 rounded-xl border text-center text-xs font-bold transition ${
                      periodForm.impact === 'COUNTED_AS_WORKED'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="block text-sm">🟢</span>
                    <span className="block text-[11px] font-black">Compté travaillé</span>
                    <span className="text-[9px] block opacity-80">Ajoute les heures</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPeriodForm({ ...periodForm, impact: 'TO_RECOVER' })}
                    className={`p-2 rounded-xl border text-center text-xs font-bold transition ${
                      periodForm.impact === 'TO_RECOVER'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="block text-sm">🔴</span>
                    <span className="block text-[11px] font-black">À rattraper</span>
                    <span className="text-[9px] block opacity-80">Heures dues</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium bg-slate-50 dark:bg-slate-800/80 p-2 rounded-xl border border-slate-200 dark:border-slate-700 mt-1">
                  {periodForm.impact === 'NEUTRAL' && "💡 Les jours à 0 h ne comptent ni en heures faites ni en heures dues."}
                  {periodForm.impact === 'COUNTED_AS_WORKED' && `💡 ${formatDuration(habitualSchedule.expectedHours)} par jour seront comptées comme travaillées.`}
                  {periodForm.impact === 'TO_RECOVER' && "💡 Vous devrez rattraper ces heures plus tard sur d'autres journées."}
                </p>
              </div>

              {/* OPTION EXCLURE WEEKENDS */}
              <label className="flex items-start space-x-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={periodForm.skipWeekends}
                  onChange={(e) => setPeriodForm({ ...periodForm, skipWeekends: e.target.checked })}
                  className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-100 block text-xs">
                    Exclure les samedis et dimanches
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    Recommandé pour les écoles et cantines scolaires fermées le week-end.
                  </p>
                </div>
              </label>

              {/* BOUTONS D'ACTION */}
              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowPeriodModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingPeriod}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-md flex items-center justify-center space-x-1.5 text-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{savingPeriod ? 'Enregistrement...' : 'Valider la période'}</span>
                </button>
              </div>
            </form>
        </Modal>
      )}
    </>
  );
};
