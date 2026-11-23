import React from 'react';
import { formatDuration, formatHours, formatPlanningHours, formatSignedDuration } from '../../utils/format';
import { formatShortDate } from '../../utils/dates';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Compteurs « On me doit » / « Je dois » et règlements du mois. */
export const CountersSection: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const {
    currentMonth,
    summary,
    loadState,
    habitualSchedule,
    regularizationsList,
    showAllRegularizations,
    setShowAllRegularizations,
    handleOpenAdjustment,
    handleDeleteRegularization,
    targetThisMonth,
    monthDisplay
  } = app;

  return (
    <>
      {/* ========================================================= */}
      {/* BLOC 2 : LES 2 COMPTEURS GÉANTS ("ON ME DOIT" vs "JE DOIS") */}
      {/* ========================================================= */}
      <section className="bg-slate-900 text-white rounded-3xl p-4 shadow-xl border border-slate-800 space-y-3">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center justify-between border-b border-slate-800 pb-2">
          <span>Mes soldes d'heures (Surplus vs À rattraper)</span>
          <span
            className={`text-xs ${loadState === 'ok' ? 'text-emerald-400' : loadState === 'error' ? 'text-rose-400' : 'text-slate-400'}`}
            role="status"
          >
            {loadState === 'ok' ? '● À jour' : loadState === 'error' ? '● Erreur de chargement' : '● Chargement...'}
          </span>
        </div>

        {/* RAPPEL : DIFFÉRENCE AVEC L'OBJECTIF DU MOIS */}
        <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-2.5 text-[11px] text-slate-300 leading-snug">
          💡 <strong>Règle simple :</strong> vos heures normales ({habitualSchedule.startTime} - {habitualSchedule.endTime} ={' '}
          {formatDuration(habitualSchedule.expectedHours)}) avancent votre <strong>objectif du mois ({formatPlanningHours(targetThisMonth)})</strong>. Ces compteurs ne
          comptent <strong>que les heures faites en plus du prévu</strong> et les <strong>heures d'absence à rattraper</strong>.
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* COMPTEUR POSITIF : ON ME DOIT */}
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-1.5 text-emerald-400">
                <ArrowUpRight className="w-4 h-4" />
                <span className="text-xs font-black uppercase tracking-tight">On me doit</span>
              </div>
              <p className="text-[10px] text-emerald-200/80 font-medium mt-0.5">
                Uniquement surplus en rab
              </p>
              <div className="text-2xl sm:text-3xl font-black text-emerald-300 mt-1.5 tracking-tight">
                {formatHours(summary?.total_positive_balance || 0)}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleOpenAdjustment('POSITIVE', 'ADD')}
                className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition text-center shadow-xs active:scale-95 flex items-center justify-center space-x-1"
                title="Rajouter manuellement des heures sup (report de solde, mission non pointée...)"
              >
                <span>➕ Rajouter</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenAdjustment('POSITIVE', 'SETTLE')}
                className="py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 rounded-xl text-xs font-bold transition text-center shadow-xs active:scale-95"
                title="Déduire des heures supplémentaires payées ou récupérées"
              >
                <span>✓ C'est réglé</span>
              </button>
            </div>
          </div>

          {/* COMPTEUR NÉGATIF : JE DOIS */}
          <div className="bg-rose-950/60 border border-rose-500/40 rounded-2xl p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-1.5 text-rose-400">
                <ArrowDownRight className="w-4 h-4" />
                <span className="text-xs font-black uppercase tracking-tight">Je dois</span>
              </div>
              <p className="text-[10px] text-rose-200/80 font-medium mt-0.5">
                Uniquement heures à rattraper
              </p>
              <div className="text-2xl sm:text-3xl font-black text-rose-300 mt-1.5 tracking-tight">
                {formatHours(-Math.abs(summary?.total_negative_balance || 0))}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleOpenAdjustment('NEGATIVE', 'ADD')}
                className="py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black transition text-center shadow-xs active:scale-95 flex items-center justify-center space-x-1"
                title="Rajouter manuellement des heures dues / à rattraper (report antérieur...)"
              >
                <span>➕ Rajouter</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenAdjustment('NEGATIVE', 'SETTLE')}
                className="py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 rounded-xl text-xs font-bold transition text-center shadow-xs active:scale-95"
                title="Déduire des heures rattrapées"
              >
                <span>✓ C'est rattrapé</span>
              </button>
            </div>
          </div>
        </div>

        {/* BANDEAU EXPLICATIF : TRANSPARENCE DES COMPTEURS */}
        {summary && ((summary.gross_positive_hours || 0) > 0 || (summary.gross_negative_hours || 0) > 0) && (
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-2.5 text-[11px] text-slate-300 flex items-center justify-between">
            <div>
              <span className="text-slate-400 font-medium">Cumul total :</span>{' '}
              <strong className="text-emerald-300">{formatSignedDuration(summary.gross_positive_hours || 0)}</strong> sup •{' '}
              <strong className="text-rose-300">{formatSignedDuration(-(summary.gross_negative_hours || 0))}</strong> absence
            </div>
            <div>
              {(summary.gross_positive_hours || 0) > 0 && (summary.gross_negative_hours || 0) > 0 ? (
                <span className="text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-600/40">
                  ✓ Déduction automatique appliquée
                </span>
              ) : (
                <span className="text-slate-400 font-medium">Solde direct</span>
              )}
            </div>
          </div>
        )}

        {/* LISTE DES RÈGLEMENTS MANUELS FILTRÉS PAR LE MOIS ACTIF */}
        {(() => {
          const monthRegularizations = regularizationsList.filter((r) => r.reg_date?.startsWith(currentMonth));
          const displayList = showAllRegularizations ? regularizationsList : monthRegularizations;

          if (displayList.length === 0 && !showAllRegularizations && regularizationsList.length === 0) {
            return null;
          }

          return (
            <div className="bg-slate-800/90 border border-amber-500/40 rounded-2xl p-3 text-xs text-amber-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px] uppercase tracking-wide text-amber-400">
                  ⚖️ Règlements {showAllRegularizations ? 'historiques complets' : `de ${monthDisplay}`} ({displayList.length}) :
                </span>
                {regularizationsList.length > monthRegularizations.length && (
                  <button
                    type="button"
                    onClick={() => setShowAllRegularizations(!showAllRegularizations)}
                    className="text-[10px] text-blue-300 hover:text-white underline font-semibold transition"
                  >
                    {showAllRegularizations
                      ? `Afficher seulement ${monthDisplay}`
                      : `Voir tout l'historique (${regularizationsList.length})`}
                  </button>
                )}
              </div>

              {displayList.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">
                  Aucun règlement manuel enregistré pour le mois de {monthDisplay}.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {displayList.map((r) => {
                    const isAdd = r.operation_type === 'ADD';
                    let badge = '';
                    let badgeClass = '';

                    const amount = formatDuration(r.amount_hours);
                    if (r.counter_type === 'POSITIVE') {
                      if (isAdd) {
                        badge = `➕ +${amount} ajoutées au crédit`;
                        badgeClass = 'text-emerald-300 font-black';
                      } else {
                        badge = `✓ -${amount} payées / réglées`;
                        badgeClass = 'text-emerald-400 font-bold';
                      }
                    } else {
                      if (isAdd) {
                        badge = `➕ -${amount} de dette ajoutée`;
                        badgeClass = 'text-rose-300 font-black';
                      } else {
                        badge = `✓ +${amount} rattrapées / déduites`;
                        badgeClass = 'text-rose-400 font-bold';
                      }
                    }

                    return (
                      <div key={r.id} className="flex items-center justify-between bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700/60 text-xs">
                        <span>
                          📅 {formatShortDate(r.reg_date)} : <strong className={badgeClass}>{badge}</strong> <span className="opacity-75">({r.reason})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteRegularization(r)}
                          className="px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-bold transition active:scale-95"
                        >
                          Annuler
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </section>
    </>
  );
};
