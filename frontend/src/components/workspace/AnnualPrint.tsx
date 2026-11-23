import React from 'react';
import { formatDuration, formatSignedDuration } from '../../utils/format';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Bilan annuel imprimable. */
export const AnnualPrint: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const { profile, annualSummary, agentName } = app;
  if (!annualSummary) return null;

  return (
    <>
      <div>
        {/* EN-TÊTE FORMEL ANNUEL */}
        <div className="border-b-2 border-slate-900 pb-4 mb-4 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-black uppercase tracking-wide text-slate-900">
              Bilan annuel d'activité et décompte du temps de travail
            </h1>
            <p className="text-xs text-slate-600 font-semibold mt-1">
              Relevé annuel établi par l'agent (septembre à août)
            </p>
            {profile.employerName && <p className="text-xs text-slate-500 italic mt-0.5">Employeur : {profile.employerName}</p>}
          </div>
          <div className="text-right border border-slate-800 p-2.5 rounded bg-slate-50">
            <div className="text-xs font-bold text-slate-600">ANNÉE SCOLAIRE</div>
            <div className="text-base font-black text-slate-900 uppercase">{annualSummary.school_year}</div>
            <div className="text-[10px] text-slate-500 mt-1">Édité le : {new Date().toLocaleDateString('fr-FR')}</div>
          </div>
        </div>

        {/* IDENTIFICATION DE L'AGENT */}
        <div className="grid grid-cols-2 gap-4 mb-4 bg-slate-50 p-3 rounded border border-slate-300 text-xs">
          <div>
            <span className="font-bold text-slate-700 block">Agent / Salarié(e) :</span>
            <span className="text-sm font-black text-slate-900">{agentName}</span>
            {profile.jobTitle && <span className="text-xs text-slate-600 block">{profile.jobTitle}</span>}
            <span className="text-xs text-slate-600 block mt-0.5">Quota annuel de référence : {formatDuration(annualSummary.annual_contract_hours)}</span>
          </div>
          <div>
            <span className="font-bold text-slate-700 block">Année scolaire :</span>
            <span className="text-xs font-bold text-slate-800">Du 1er Septembre {annualSummary.start_year} au 31 Août {annualSummary.end_year}</span>
            <span className="text-[11px] text-slate-600 block mt-0.5">Annualisation du temps de travail</span>
          </div>
        </div>

        {/* SYNTHÈSE DU DÉCOMPTE ANNUEL */}
        <div className="grid grid-cols-4 gap-2 text-center border-2 border-slate-800 p-3 rounded mb-4">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-600 block">Quota contractuel</span>
            <span className="text-base font-black text-slate-900">{formatDuration(annualSummary.annual_contract_hours)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-blue-900 block">Heures réalisées</span>
            <span className="text-base font-black text-blue-900">{formatDuration(annualSummary.total_worked_hours)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-amber-800 block">Reste à faire</span>
            <span className="text-base font-black text-amber-800">{formatDuration(annualSummary.remaining_contract_hours)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-emerald-800 block">Surplus / Heures Sup</span>
            <span className="text-base font-black text-emerald-800">+{formatDuration(annualSummary.overtime_contract_hours)}</span>
          </div>
        </div>

        {/* TABLEAU RÉCAPITULATIF DES 12 MOIS */}
        <table className="w-full text-[10px] border-collapse border border-slate-700 print-table mb-4">
          <thead>
            <tr className="bg-slate-200 text-slate-900 font-black">
              <th className="border border-slate-700 p-1 text-left">Mois</th>
              <th className="border border-slate-700 p-1 text-right">Heures prévues</th>
              <th className="border border-slate-700 p-1 text-right">Heures effectuées</th>
              <th className="border border-slate-700 p-1 text-right">Écart</th>
              <th className="border border-slate-700 p-1 text-center">Jours travaillés</th>
              <th className="border border-slate-700 p-1 text-center">Jours absences / 0h</th>
            </tr>
          </thead>
          <tbody>
            {annualSummary.months.map((m) => (
              <tr key={m.year_month}>
                <td className="border border-slate-700 p-1 font-bold">{m.month_name}</td>
                <td className="border border-slate-700 p-1 text-right">{formatDuration(m.expected_hours)}</td>
                <td className="border border-slate-700 p-1 text-right font-bold">{formatDuration(m.actual_hours)}</td>
                <td className="border border-slate-700 p-1 text-right font-black">
                  {formatSignedDuration(m.delta_hours)}
                </td>
                <td className="border border-slate-700 p-1 text-center">{m.worked_days} j</td>
                <td className="border border-slate-700 p-1 text-center">{m.absence_days} j</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-black">
              <td className="border border-slate-700 p-1">TOTAL ANNUEL</td>
              <td className="border border-slate-700 p-1 text-right">{formatDuration(annualSummary.total_expected_hours)}</td>
              <td className="border border-slate-700 p-1 text-right text-blue-900 font-black">{formatDuration(annualSummary.total_worked_hours)}</td>
              <td className="border border-slate-700 p-1 text-right font-black">
                +{formatDuration(annualSummary.overtime_contract_hours)}
              </td>
              <td className="border border-slate-700 p-1 text-center">{annualSummary.total_worked_days} j</td>
              <td className="border border-slate-700 p-1 text-center">{annualSummary.total_absence_days} j</td>
            </tr>
          </tfoot>
        </table>

        {/* CADRE SIGNATURES ET VISAS POUR L'EMPLOYEUR */}
        <div className="grid grid-cols-2 gap-8 pt-4 border-t-2 border-slate-900 mt-6 page-break-inside-avoid">
          <div className="border border-slate-700 p-4 rounded min-h-[120px] flex flex-col justify-between">
            <div>
              <span className="font-bold text-slate-800 text-xs block uppercase">Visa de l'agent / salarié(e) :</span>
              <p className="text-[10px] text-slate-500 italic mt-0.5">Mention manuscrite "Bon pour accord du bilan annuel" :</p>
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
