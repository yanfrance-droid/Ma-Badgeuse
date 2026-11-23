import React from 'react';
import { entriesCsvUrl } from '../../api';
import { formatDuration, formatHours, formatSignedDuration } from '../../utils/format';
import { formatDateFrench } from '../../utils/dates';
import { Download, Edit2, Lock, Trash2 } from 'lucide-react';
import { absenceLabel, noteWithoutReason, reasonOfEntry } from '../../domain';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Livre de preuves : bilan et liste des journées du mois. */
export const ProofBook: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const {
    currentMonth,
    summary,
    entries,
    editingEntryDate,
    handleStartEdit,
    handleDeleteDay,
    isMonthValidated,
    totalWorkedThisMonth,
    totalExpectedThisMonth,
    monthPositiveHours,
    monthNegativeHours,
    monthNetBalance,
    monthDisplay
  } = app;

  return (
    <>
      {/* ========================================================= */}
      {/* BLOC 4 : LE LIVRE DE PREUVES POUR L'EMPLOYEUR             */}
      {/* ========================================================= */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
              <span>📋 Livre de Preuves ({monthDisplay})</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Arrivée • Départ • Pause • Heures faites • Écart daté
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{entries.length} journée(s)</span>
            <a
              href={entriesCsvUrl(currentMonth)}
              download
              className="text-[11px] font-bold text-blue-700 dark:text-blue-300 hover:underline flex items-center gap-1"
              title="Télécharger les journées du mois au format tableur (CSV)"
            >
              <Download className="w-3 h-3" aria-hidden="true" /> Export CSV
            </a>
          </div>
        </div>
        {isMonthValidated && (
          <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" /> Mois validé
            {summary?.current_month.validated_at ? ` le ${new Date(summary.current_month.validated_at).toLocaleDateString('fr-FR')}` : ''} : les journées sont
            verrouillées.
          </p>
        )}

        {/* BILAN DU MOIS PROFESSIONNEL : HEURES FAITES vs DUES */}
        <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold uppercase block">Heures sup faites</span>
              <span className="text-sm font-black text-emerald-800 dark:text-emerald-300">{formatSignedDuration(monthPositiveHours)}</span>
            </div>
            <div>
              <span className="text-[10px] text-rose-700 dark:text-rose-400 font-bold uppercase block">Heures à rattraper</span>
              <span className="text-sm font-black text-rose-800 dark:text-rose-300">{formatSignedDuration(-monthNegativeHours)}</span>
            </div>
            <div>
              <span className="text-[10px] text-blue-700 dark:text-blue-400 font-bold uppercase block">Solde net compensé</span>
              <span
                className={`text-sm font-black inline-block px-2 py-0.5 rounded-lg ${
                  monthNetBalance > 0
                    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60'
                    : monthNetBalance < 0
                    ? 'text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/60'
                    : 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/60'
                }`}
              >
                {formatSignedDuration(monthNetBalance)}
                {monthNetBalance > 0 ? ' (On me doit)' : monthNetBalance < 0 ? ' (Je dois)' : ' (Compensé)'}
              </span>
            </div>
          </div>

          {/* DÉCOMPTE SUR LES JOURS POINTÉS */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
            <span>
              Sur les <strong>{entries.length} jour(s) pointé(s)</strong> : 
              {' '}{formatDuration(totalExpectedThisMonth)} prévues • {formatDuration(totalWorkedThisMonth)} faites
            </span>
            <span className="font-bold">
              Solde net :{' '}
              <strong className={monthNetBalance > 0 ? 'text-emerald-700 dark:text-emerald-400' : monthNetBalance < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-blue-700 dark:text-blue-400'}>
                {monthNetBalance > 0
                  ? `${formatSignedDuration(monthNetBalance)} en votre faveur`
                  : monthNetBalance < 0
                  ? `${formatSignedDuration(monthNetBalance)} à compenser`
                  : '0 h (équilibré)'}
              </strong>
            </span>
          </div>
        </div>

        {/* LISTE DES JOURS AVEC ARRIVÉE, DÉPART ET MOTIFS CLAIRS */}
        <div className="space-y-2">
          {entries.length === 0 ? (
            <div className="p-6 text-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-xs font-semibold">
              Aucune journée enregistrée pour {monthDisplay}.
            </div>
          ) : (
            entries.map((e) => {
              const delta = e.delta_hours || 0;
              const isAbsent = Boolean(e.status_id);
              const isCurrentlyEditing = editingEntryDate === e.entry_date;

              return (
                <div
                  key={e.entry_date}
                  className={`p-3 rounded-2xl border space-y-2 text-xs transition duration-200 ${
                    isCurrentlyEditing
                      ? 'bg-amber-50/90 dark:bg-amber-950/60 border-amber-400 ring-2 ring-amber-400/50 shadow-md'
                      : 'bg-slate-50/90 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
                  }`}
                  style={{
                    borderLeftColor:
                      delta > 0 ? '#10B981' : delta < 0 ? '#F43F5E' : isAbsent ? '#D97706' : '#3B82F6',
                    borderLeftWidth: '5px'
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <strong className="text-slate-900 dark:text-slate-100 text-[13px]">
                        {formatDateFrench(e.entry_date)}
                      </strong>
                      {isAbsent ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          Absence
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          Travaillé
                        </span>
                      )}
                      {isCurrentlyEditing && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 animate-pulse">
                          En cours de modif
                        </span>
                      )}
                    </div>
                    <span
                      className={`font-black text-xs px-2 py-1 rounded-xl whitespace-nowrap shrink-0 ${
                        delta > 0
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          : delta < 0
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                          : 'bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {formatHours(delta)}
                    </span>
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    {/* LIGNE DES HEURES OU MOTIF D'ABSENCE */}
                    <div className="text-slate-600 dark:text-slate-300 text-[11px] space-y-0.5 min-w-0">
                      {isAbsent ? (
                        <div>
                          <span className="font-bold text-amber-900 dark:text-amber-300">
                            {absenceLabel(e)}
                          </span>
                          {noteWithoutReason(e.notes, reasonOfEntry(e)) && (
                            <span className="ml-1 italic">— {noteWithoutReason(e.notes, reasonOfEntry(e))}</span>
                          )}
                          {delta < 0 ? (
                            <span className="ml-1.5 text-rose-700 dark:text-rose-400 font-bold">
                              (À rattraper : {formatDuration(Math.abs(delta))})
                            </span>
                          ) : e.actual_hours > 0 ? (
                            <span className="ml-1.5 text-emerald-700 dark:text-emerald-400 font-bold">
                              (Compté fait : {formatDuration(e.actual_hours)})
                            </span>
                          ) : (
                            <span className="ml-1.5 text-slate-500 dark:text-slate-400 font-medium">
                              (Neutre)
                            </span>
                          )}
                        </div>
                      ) : e.start_time && e.end_time ? (
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          Arrivée : <span className="font-bold text-blue-900 dark:text-blue-300">{e.start_time}</span> • Départ : <span className="font-bold text-blue-900 dark:text-blue-300">{e.end_time}</span>
                          {e.break_minutes > 0 && (
                            <span className="text-slate-400 dark:text-slate-500 ml-1">(pause {e.break_minutes}m)</span>
                          )}
                        </div>
                      ) : (
                        <div className="font-semibold text-slate-700 dark:text-slate-300">Pointage direct</div>
                      )}

                      <div className="text-slate-500 dark:text-slate-400 text-[10px]">
                        Prévu : <strong>{formatDuration(e.expected_hours)}</strong> • Fait : <strong>{formatDuration(e.actual_hours)}</strong>
                        {!e.status_id && e.notes && <span className="italic"> • {e.notes}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(e)}
                        title="Modifier cette journée"
                        className={`h-10 px-3 rounded-xl font-bold text-xs flex items-center space-x-1 transition shadow-xs ${
                          isCurrentlyEditing
                            ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                            : 'bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-slate-700 border border-blue-200 dark:border-slate-700'
                        }`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Modifier</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteDay(e.entry_date)}
                        title="Supprimer la journée"
                        aria-label={`Supprimer la journée du ${formatDateFrench(e.entry_date)}`}
                        className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </>
  );
};
