import React from 'react';
import { Modal } from '../Modal';
import { formatDuration, formatPlanningHours, formatSignedDuration } from '../../utils/format';
import { ChevronLeft, ChevronRight, Edit2, Lock, Printer, X } from 'lucide-react';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Fenêtre du bilan annuel scolaire (septembre à août). */
export const AnnualModal: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const {
    currentMonth,
    showAnnualModal,
    setShowAnnualModal,
    annualSummary,
    annualStartYear,
    annualTargetStr,
    setAnnualTargetStr,
    isEditingAnnualTarget,
    setIsEditingAnnualTarget,
    isSavingAnnualTarget,
    handleSelectMonth,
    handleSaveAnnualTarget,
    handleChangeAnnualYear,
    handlePrintAnnual
  } = app;

  return (
    <>
      {/* ========================================================= */}
      {/* MODALE DU BILAN ANNUEL SCOLAIRE (SEPTEMBRE À AOÛT)         */}
      {/* ========================================================= */}
      {showAnnualModal && (
        <Modal
          onClose={() => setShowAnnualModal(false)}
          labelledBy="annual-title"
          className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 max-h-[92vh] overflow-y-auto"
        >
            {/* EN-TÊTE MODALE */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl shadow-xs shrink-0 font-bold" aria-hidden="true">
                  🎯
                </div>
                <div>
                  <h3 id="annual-title" className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 leading-tight">
                    Bilan & Décompte Annuel Scolaire
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Période du 1er septembre au 31 août • Suivi du contrat annualisé
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setShowAnnualModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SÉLECTEUR D'ANNÉE SCOLAIRE */}
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 p-2 rounded-2xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => handleChangeAnnualYear(-1)}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 font-bold text-xs text-slate-700 dark:text-slate-200 shadow-2xs border border-slate-200 dark:border-slate-600 transition flex items-center space-x-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{annualStartYear - 1} - {annualStartYear}</span>
              </button>

              <div className="text-center px-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 dark:text-slate-500 block">
                  Année scolaire
                </span>
                <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                  {annualSummary ? annualSummary.school_year : `${annualStartYear} - ${annualStartYear + 1}`}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleChangeAnnualYear(1)}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 font-bold text-xs text-slate-700 dark:text-slate-200 shadow-2xs border border-slate-200 dark:border-slate-600 transition flex items-center space-x-1"
              >
                <span>{annualStartYear + 1} - {annualStartYear + 2}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* QUOTA ANNUEL CONTRACTUEL MODIFIABLE */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/80 p-3.5 rounded-2xl border border-blue-200 dark:border-blue-900/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="text-xs font-black text-blue-950 dark:text-blue-200 uppercase tracking-tight flex items-center space-x-1.5">
                  <span>📋</span>
                  <span>Mon Quota Contractuel Annuel :</span>
                </span>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                  Nombre d'heures prévues à votre contrat pour l'année scolaire (ex: 800h, 950h, 1200h)
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                {isEditingAnnualTarget ? (
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="text"
                      aria-label="Quota annuel en heures"
                      value={annualTargetStr}
                      onChange={(e) => setAnnualTargetStr(e.target.value)}
                      placeholder="800h"
                      className="w-24 h-9 px-2.5 rounded-xl border-2 border-blue-500 bg-white dark:bg-slate-900 font-black text-center text-sm text-slate-900 dark:text-slate-100 shadow-inner"
                    />
                    <button
                      type="button"
                      disabled={isSavingAnnualTarget}
                      onClick={handleSaveAnnualTarget}
                      className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition"
                    >
                      {isSavingAnnualTarget ? '...' : 'Valider'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingAnnualTarget(false);
                        setAnnualTargetStr(formatPlanningHours(annualSummary?.annual_contract_hours ?? 0));
                      }}
                      className="h-9 px-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 font-bold text-xs text-slate-700 dark:text-slate-200"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span className="px-3 py-1.5 bg-blue-600 text-white font-black text-base rounded-xl shadow-xs">
                      {annualSummary ? formatPlanningHours(annualSummary.annual_contract_hours) : '…'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditingAnnualTarget(true)}
                      className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs shadow-2xs transition flex items-center space-x-1"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Modifier</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* BANDEAU PRINCIPAL DE DÉCOMPTE & PROGRESSION */}
            {annualSummary && (
              <div className="space-y-3">
                <div
                  className={`p-4 rounded-3xl border-2 shadow-sm ${
                    annualSummary.remaining_contract_hours > 0
                      ? 'bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-amber-500/15 border-amber-400 dark:border-amber-700'
                      : 'bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-emerald-500/15 border-emerald-400 dark:border-emerald-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                      <span>{annualSummary.remaining_contract_hours > 0 ? '⏳' : '🎉'}</span>
                      <span>État du décompte annuel</span>
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-black ${
                        annualSummary.remaining_contract_hours > 0
                          ? 'bg-amber-500 text-white'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {annualSummary.progress_percent}% réalisé
                    </span>
                  </div>

                  {annualSummary.remaining_contract_hours > 0 ? (
                    <div>
                      <div className="text-xl sm:text-2xl font-black text-amber-950 dark:text-amber-200">
                        Il vous reste {formatDuration(annualSummary.remaining_contract_hours)} à effectuer
                      </div>
                      <p className="text-xs text-amber-900 dark:text-amber-300 font-medium mt-0.5">
                        Vous avez validé <strong>{formatDuration(annualSummary.total_worked_hours)}</strong> sur vos <strong>{formatDuration(annualSummary.annual_contract_hours)}</strong> contractuelles d'ici le 31 août {annualSummary.end_year}.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="text-xl sm:text-2xl font-black text-emerald-950 dark:text-emerald-200">
                        Objectif contractuel atteint ! (+{formatDuration(annualSummary.overtime_contract_hours)} de surplus)
                      </div>
                      <p className="text-xs text-emerald-900 dark:text-emerald-300 font-medium mt-0.5">
                        Félicitations ! Vous avez dépassé votre quota annuel contractuel de <strong>{formatDuration(annualSummary.annual_contract_hours)}</strong>.
                      </p>
                    </div>
                  )}

                  {/* BARRE DE PROGRESSION */}
                  <div className="mt-3.5 space-y-1">
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-4 rounded-full overflow-hidden shadow-inner p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          annualSummary.remaining_contract_hours > 0
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                            : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        }`}
                        style={{ width: `${annualSummary.progress_percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 px-0.5">
                      <span>0h (1er Septembre)</span>
                      <span>{formatDuration(annualSummary.total_worked_hours)} faites</span>
                      <span>{formatDuration(annualSummary.annual_contract_hours)} (31 Août)</span>
                    </div>
                  </div>
                </div>

                {/* 4 CARTES MÉTRIQUES CLÉS */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 p-3 rounded-2xl text-center">
                    <span className="text-[10px] uppercase font-black text-blue-900 dark:text-blue-300 block">
                      Total Réalisé
                    </span>
                    <span className="text-base sm:text-lg font-black text-blue-950 dark:text-blue-100 block mt-0.5">
                      {formatDuration(annualSummary.total_worked_hours)}
                    </span>
                    <span className="text-[10px] text-blue-700 dark:text-blue-400 font-medium">heures travaillées</span>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-3 rounded-2xl text-center">
                    <span className="text-[10px] uppercase font-black text-amber-900 dark:text-amber-300 block">
                      Reste à faire
                    </span>
                    <span className="text-base sm:text-lg font-black text-amber-950 dark:text-amber-100 block mt-0.5">
                      {formatDuration(annualSummary.remaining_contract_hours)}
                    </span>
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">d'ici fin août</span>
                  </div>

                  <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-3 rounded-2xl text-center">
                    <span className="text-[10px] uppercase font-black text-emerald-900 dark:text-emerald-300 block">
                      Heures Sup / Surplus
                    </span>
                    <span className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-300 block mt-0.5">
                      +{formatDuration(annualSummary.overtime_contract_hours)}
                    </span>
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">cumulées</span>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 rounded-2xl text-center">
                    <span className="text-[10px] uppercase font-black text-slate-700 dark:text-slate-300 block">
                      Jours Travaillés
                    </span>
                    <span className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 block mt-0.5">
                      {annualSummary.total_worked_days} j
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      ({annualSummary.total_absence_days} j congés/0h)
                    </span>
                  </div>
                </div>

                {/* TABLEAU DES 12 MOIS (SEPTEMBRE À AOÛT) */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-tight text-slate-800 dark:text-slate-200">
                      📅 Répartition Mois par Mois (Septembre à Août)
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                      Cliquer sur "Voir" pour basculer sur un mois
                    </span>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-[11px] sticky top-0 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="p-2 sm:p-2.5">Mois</th>
                            <th className="p-2 sm:p-2.5 text-right">Prévu</th>
                            <th className="p-2 sm:p-2.5 text-right">Fait</th>
                            <th className="p-2 sm:p-2.5 text-right">Écart</th>
                            <th className="p-2 sm:p-2.5 text-center hidden sm:table-cell">Jours</th>
                            <th className="p-2 sm:p-2.5 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {annualSummary.months.map((m) => {
                            const isCurrent = m.year_month === currentMonth;
                            return (
                              <tr
                                key={m.year_month}
                                className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${
                                  isCurrent ? 'bg-blue-50/70 dark:bg-blue-950/30 font-bold' : ''
                                }`}
                              >
                                <td className="p-2 sm:p-2.5">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="font-bold text-slate-900 dark:text-slate-100">
                                      {m.month_name}
                                    </span>
                                    {isCurrent && (
                                      <span className="px-1.5 py-0.2 rounded-md bg-blue-600 text-white text-[9px] font-black uppercase">
                                        Mois actif
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2 sm:p-2.5 text-right text-slate-600 dark:text-slate-400">
                                  {formatDuration(m.expected_hours)}
                                </td>
                                <td className="p-2 sm:p-2.5 text-right font-black text-slate-900 dark:text-slate-100">
                                  {formatDuration(m.actual_hours)}
                                </td>
                                <td className="p-2 sm:p-2.5 text-right font-black">
                                  <span
                                    className={
                                      m.delta_hours > 0 ? 'text-emerald-600 dark:text-emerald-400' : m.delta_hours < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                                    }
                                  >
                                    {formatSignedDuration(m.delta_hours)}
                                  </span>
                                  {m.is_validated && (
                                    <Lock className="w-3 h-3 inline ml-1 text-emerald-600" aria-label="Mois validé" />
                                  )}
                                </td>
                                <td className="p-2 sm:p-2.5 text-center text-[11px] text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                                  {m.worked_days} j trav. • {m.absence_days} j congés
                                </td>
                                <td className="p-2 sm:p-2.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSelectMonth(m.year_month);
                                      setShowAnnualModal(false);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/60 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 font-bold text-[11px] transition shadow-2xs active:scale-95"
                                  >
                                    Voir ➔
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-100 dark:bg-slate-800/80 font-black border-t-2 border-slate-300 dark:border-slate-700">
                          <tr>
                            <td className="p-2 sm:p-2.5 text-slate-900 dark:text-slate-100">
                              TOTAL ANNUEL (12 MOIS)
                            </td>
                            <td className="p-2 sm:p-2.5 text-right text-slate-600 dark:text-slate-300">
                              {formatDuration(annualSummary.total_expected_hours)}
                            </td>
                            <td className="p-2 sm:p-2.5 text-right text-blue-700 dark:text-blue-300 text-sm">
                              {formatDuration(annualSummary.total_worked_hours)}
                            </td>
                            <td className="p-2 sm:p-2.5 text-right text-slate-900 dark:text-slate-100">
                              {annualSummary.overtime_contract_hours > 0 ? (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  +{formatDuration(annualSummary.overtime_contract_hours)}
                                </span>
                              ) : (
                                <span className="text-slate-600 dark:text-slate-400">0 h</span>
                              )}
                            </td>
                            <td className="p-2 sm:p-2.5 text-center text-[11px] text-slate-700 dark:text-slate-300 hidden sm:table-cell">
                              {annualSummary.total_worked_days} j • {annualSummary.total_absence_days} j
                            </td>
                            <td className="p-2 sm:p-2.5"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* BOUTONS D'ACTION DU BAS DE LA MODALE */}
            <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handlePrintAnnual}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer le bilan annuel</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAnnualModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition"
              >
                Fermer
              </button>
            </div>
        </Modal>
      )}
    </>
  );
};
