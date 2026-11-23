import React from 'react';
import { formatDuration, formatHours, formatPlanningHours, formatSignedDuration } from '../../utils/format';
import { formatDateFrench } from '../../utils/dates';
import { absenceLabel, noteWithoutReason, reasonOfEntry } from '../../domain';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Relevé mensuel imprimable. */
export const MonthlyPrint: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const {
    summary,
    entries,
    habitualSchedule,
    profile,
    targetThisMonth,
    monthPositiveHours,
    monthNegativeHours,
    monthNetBalance,
    monthDisplay,
    agentName
  } = app;

  return (
    <>
      <div>
        {/* EN-TÊTE FORMEL */}
        <div className="border-b-2 border-slate-900 pb-4 mb-4 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-black uppercase tracking-wide text-slate-900">
              Relevé mensuel d'activité et décompte du temps de travail
            </h1>
            <p className="text-xs text-slate-600 font-semibold mt-1">
              Relevé des heures de présence établi par l'agent
            </p>
            {profile.employerName && <p className="text-xs text-slate-500 italic mt-0.5">Employeur : {profile.employerName}</p>}
          </div>
          <div className="text-right border border-slate-800 p-2.5 rounded bg-slate-50">
            <div className="text-xs font-bold text-slate-600">PÉRIODE CONCERNÉE</div>
            <div className="text-base font-black text-slate-900 uppercase">{monthDisplay}</div>
            <div className="text-[10px] text-slate-500 mt-1">Date d'édition : {new Date().toLocaleDateString('fr-FR')}</div>
          </div>
        </div>

        {/* IDENTIFICATION DE L'AGENT & HORAIRES DE RÉFÉRENCE */}
        <div className="grid grid-cols-2 gap-4 mb-4 bg-slate-50 p-3 rounded border border-slate-300 text-xs">
          <div>
            <span className="font-bold text-slate-700 block">Agent / Salarié(e) :</span>
            <span className="text-sm font-black text-slate-900">{agentName}</span>
            {profile.jobTitle && <span className="text-xs text-slate-600 block">{profile.jobTitle}</span>}
            <span className="text-xs text-slate-600 block mt-0.5">Référence : {formatDuration(habitualSchedule.expectedHours)} par jour travaillé</span>
          </div>
          <div>
            <span className="font-bold text-slate-700 block">Horaires contractuels habituels :</span>
            <span className="text-xs font-bold text-slate-800">
              {habitualSchedule.startTime} - {habitualSchedule.endTime}
              {habitualSchedule.breakMinutes > 0 ? ` (pause décomptée : ${habitualSchedule.breakMinutes} min)` : ''}
            </span>
            <span className="text-[11px] text-slate-600 block mt-0.5">Volume cible mensuel : {formatPlanningHours(targetThisMonth)}</span>
          </div>
        </div>

        {/* RÉCAPITULATIF SYNTHÉTIQUE DU MOIS */}
        <div className="grid grid-cols-4 gap-2 text-center border-2 border-slate-800 p-2.5 rounded mb-4">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-600 block">Base planning</span>
            <span className="text-base font-black text-slate-900">{formatPlanningHours(targetThisMonth)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-emerald-800 block">Heures sup faites</span>
            <span className="text-base font-black text-emerald-800">{formatSignedDuration(monthPositiveHours)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-rose-800 block">Heures dues</span>
            <span className="text-base font-black text-rose-800">{formatSignedDuration(-monthNegativeHours)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-blue-900 block">Solde net du mois</span>
            <span className="text-base font-black text-blue-900">{formatSignedDuration(monthNetBalance)}</span>
          </div>
        </div>

        {/* SOLDES CUMULÉS HISTORIQUES GLOBAUX (DISTINCT DU MOIS) */}
        <div className="grid grid-cols-2 gap-3 mb-4 bg-slate-50 p-2.5 rounded border border-slate-300 text-xs">
          <div className="flex items-center justify-between px-2">
            <span className="font-semibold text-slate-700">Cumul historique Heures Sup (dû par l'employeur) :</span>
            <strong className="text-emerald-700 font-black">{formatHours(summary?.total_positive_balance || 0)}</strong>
          </div>
          <div className="flex items-center justify-between px-2">
            <span className="font-semibold text-slate-700">Cumul historique À rattraper (dû à l'employeur) :</span>
            <strong className="text-rose-700 font-black">{formatHours(-Math.abs(summary?.total_negative_balance || 0))}</strong>
          </div>
        </div>

        {/* TABLEAU DÉTAILLÉ DU MOIS */}
        <table className="w-full text-[10px] border-collapse border border-slate-700 print-table mb-4">
          <thead>
            <tr className="bg-slate-200 text-slate-900 font-black">
              <th className="border border-slate-700 p-1 text-left">Date</th>
              <th className="border border-slate-700 p-1 text-left">Jour</th>
              <th className="border border-slate-700 p-1 text-center">Arrivée</th>
              <th className="border border-slate-700 p-1 text-center">Départ</th>
              <th className="border border-slate-700 p-1 text-center">Pause</th>
              <th className="border border-slate-700 p-1 text-right">Prévu</th>
              <th className="border border-slate-700 p-1 text-right">Fait</th>
              <th className="border border-slate-700 p-1 text-right">Écart</th>
              <th className="border border-slate-700 p-1 text-left">Statut / Motif</th>
              <th className="border border-slate-700 p-1 text-left">Observations</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const delta = e.delta_hours || 0;
              const dayName = formatDateFrench(e.entry_date).split(' ')[0];
              const observation = e.status_id ? noteWithoutReason(e.notes, reasonOfEntry(e)) : e.notes || '';

              return (
                <tr key={e.entry_date} className={e.status_id ? 'bg-slate-50' : ''}>
                  <td className="border border-slate-700 p-1 font-mono font-bold whitespace-nowrap">{e.entry_date}</td>
                  <td className="border border-slate-700 p-1 font-semibold">{dayName}</td>
                  <td className="border border-slate-700 p-1 text-center">{e.start_time || '—'}</td>
                  <td className="border border-slate-700 p-1 text-center">{e.end_time || '—'}</td>
                  <td className="border border-slate-700 p-1 text-center">{e.break_minutes > 0 ? `${e.break_minutes}m` : '0'}</td>
                  <td className="border border-slate-700 p-1 text-right font-medium">{formatDuration(e.expected_hours)}</td>
                  <td className="border border-slate-700 p-1 text-right font-bold">{formatDuration(e.actual_hours)}</td>
                  <td className="border border-slate-700 p-1 text-right font-black">
                    {formatHours(delta)}
                  </td>
                  <td className="border border-slate-700 p-1 font-semibold">{e.status_id ? absenceLabel(e) : e.actual_hours > 0 ? 'Travaillé' : 'Repos'}</td>
                  <td className="border border-slate-700 p-1 italic text-slate-600">{observation}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* CADRE SIGNATURES ET VISAS POUR L'EMPLOYEUR */}
        <div className="grid grid-cols-2 gap-8 pt-4 border-t-2 border-slate-900 mt-6 page-break-inside-avoid">
          <div className="border border-slate-700 p-4 rounded min-h-[120px] flex flex-col justify-between">
            <div>
              <span className="font-bold text-slate-800 text-xs block uppercase">Visa de l'agent / salarié(e) :</span>
              <p className="text-[10px] text-slate-500 italic mt-0.5">Mention manuscrite "Bon pour accord des heures effectuées" :</p>
            </div>
            <div className="text-[10px] text-slate-600 pt-8 border-t border-dashed border-slate-300 flex justify-between">
              <span>Date : ...........................</span>
              <span>Signature :</span>
            </div>
          </div>

          <div className="border border-slate-700 p-4 rounded min-h-[120px] flex flex-col justify-between">
            <div>
              <span className="font-bold text-slate-800 text-xs block uppercase">Visa de l'Employeur / Responsable :</span>
              <p className="text-[10px] text-slate-500 italic mt-0.5">Cachet de la mairie / de l'établissement et signature :</p>
            </div>
            <div className="text-[10px] text-slate-600 pt-8 border-t border-dashed border-slate-300 flex justify-between">
              <span>Date : ...........................</span>
              <span>Signature & Cachet :</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
