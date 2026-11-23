import React from 'react';
import { formatDuration, formatPlanningHours } from '../../utils/format';
import { ChevronLeft, ChevronRight, Lock, RotateCcw, Unlock } from 'lucide-react';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Navigation entre les mois, quota annuel et objectif du mois. */
export const MonthOverview: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const {
    todayMonth,
    currentMonth,
    setShowAnnualModal,
    annualSummary,
    annualStartYear,
    monthlyTargetInput,
    targetInputStr,
    setTargetInputStr,
    savingTarget,
    selectedDate,
    loadAnnualData,
    handleSelectMonth,
    handlePrevMonth,
    handleNextMonth,
    handleCurrentMonth,
    handleSaveMonthlyTarget,
    isMonthValidated,
    handleToggleMonthValidation,
    openPeriodModal,
    totalWorkedThisMonth,
    targetThisMonth,
    monthProgressPercent,
    monthRemainingHours,
    monthOvertimeHours,
    cpDaysThisMonth,
    monthDisplay
  } = app;

  return (
    <>
      {/* ========================================================= */}
      {/* BLOC 1 : NAVIGATION MOIS PAR MOIS & OBJECTIF DU MOIS      */}
      {/* ========================================================= */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
        {/* BARRE DE CHANGEMENT DE MOIS */}
        <div className="flex items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            title="Mois précédent"
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center space-x-1 transition active:scale-95 shadow-2xs"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Précédent</span>
          </button>

          {/* SÉLECTEUR DIRECT DE MOIS & RETOUR AU MOIS EN COURS */}
          <div className="flex items-center space-x-1.5">
            <input
              type="month"
              value={currentMonth}
              onChange={(e) => handleSelectMonth(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 font-black text-sm text-slate-900 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs text-center"
              title="Cliquer pour choisir un mois directement dans le calendrier"
            />
            {currentMonth !== todayMonth && (
              <button
                type="button"
                onClick={handleCurrentMonth}
                className="px-2 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold text-xs border border-blue-200 dark:border-blue-800 transition active:scale-95 flex items-center space-x-1"
                title="Revenir au mois en cours"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Ce mois</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            title="Mois suivant"
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center space-x-1 transition active:scale-95 shadow-2xs"
          >
            <span className="hidden sm:inline">Suivant</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* BADGE CONGÉS / JOURS À 0H POSÉS CE MOIS */}
        {cpDaysThisMonth > 0 && (
          <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1.5 rounded-2xl text-xs text-emerald-900 dark:text-emerald-200 font-bold">
            <span className="flex items-center space-x-1.5">
              <span>🏖️</span>
              <span>Jours à 0 h / congés en {monthDisplay} : <strong>{cpDaysThisMonth} jour{cpDaysThisMonth > 1 ? 's' : ''}</strong></span>
            </span>
            <button
              type="button"
              onClick={() => openPeriodModal(selectedDate, selectedDate)}
              className="text-[11px] text-emerald-700 hover:text-emerald-950 dark:text-emerald-400 dark:hover:text-emerald-300 underline font-semibold"
            >
              + Ajouter des jours à 0h
            </button>
          </div>
        )}

        {/* CARTE QUOTA ANNUEL SCOLAIRE (SEPTEMBRE À AOÛT) AVEC DÉCOMPTE D'HEURES */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-2xl p-3 border-2 border-amber-300 dark:border-amber-800/60 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="flex items-start sm:items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
              🎯
            </div>
            <div>
              <div className="flex items-center space-x-1.5 flex-wrap">
                <span className="text-xs font-black text-amber-950 dark:text-amber-200 uppercase tracking-tight">
                  Quota Annuel Scolaire ({annualSummary ? annualSummary.school_year : `${annualStartYear} - ${annualStartYear + 1}`})
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-300 font-extrabold">
                  Sept. - Août
                </span>
              </div>
              <p className="text-xs text-amber-900 dark:text-amber-300 font-bold mt-0.5">
                {annualSummary ? (
                  annualSummary.remaining_contract_hours > 0 ? (
                    <>
                      <strong>{formatDuration(annualSummary.total_worked_hours)}</strong> faites sur <strong>{formatDuration(annualSummary.annual_contract_hours)}</strong> • Reste <strong className="text-amber-700 dark:text-amber-400 font-black">{formatDuration(annualSummary.remaining_contract_hours)}</strong> à faire
                    </>
                  ) : (
                    <>
                      🎉 Quota de <strong>{formatDuration(annualSummary.annual_contract_hours)}</strong> complété ! (<strong>+{formatDuration(annualSummary.overtime_contract_hours)}</strong> de surplus)
                    </>
                  )
                ) : (
                  'Chargement du décompte annuel...'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              loadAnnualData(annualStartYear);
              setShowAnnualModal(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-xs active:scale-95 transition flex items-center justify-center space-x-1 shrink-0 self-end sm:self-auto"
          >
            <span>Voir le bilan</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* BARRE DE PROGRESSION DU MOIS (OBJECTIF PLANNING vs EFFECTUÉ) */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50/70 dark:from-slate-900/90 dark:to-slate-800/90 rounded-3xl p-4 border-2 border-blue-300 dark:border-blue-900/60 shadow-sm space-y-3.5">
          {/* ENCART PRINCIPAL TRÈS VISIBLE : HEURES DEMANDÉES AU PLANNING */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border-2 border-blue-500 dark:border-blue-600 shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <span className="text-xs font-black text-blue-950 dark:text-blue-200 uppercase tracking-tight flex items-center space-x-1.5">
                <span className="text-base">🎯</span>
                <span>Heures demandées au planning ({monthDisplay}) :</span>
              </span>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                {isMonthValidated
                  ? 'Mois validé : rouvrez-le pour modifier les journées ou l’objectif.'
                  : 'Objectif de votre planning (ex : 88h ou 46h39)'}
              </p>
              <button
                type="button"
                onClick={handleToggleMonthValidation}
                className={`mt-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${
                  isMonthValidated
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600'
                }`}
              >
                {isMonthValidated ? <Lock className="w-3 h-3" aria-hidden="true" /> : <Unlock className="w-3 h-3" aria-hidden="true" />}
                {isMonthValidated ? 'Mois validé — rouvrir' : 'Valider et verrouiller le mois'}
              </button>
            </div>

            {/* RÉGLAGE GRAND FORMAT TRÈS VISIBLE ET CONFORTABLE SUR MOBILE */}
            <div className="flex items-center space-x-2 self-end sm:self-auto">
              <button
                type="button"
                disabled={isMonthValidated || savingTarget}
                aria-label="Diminuer l'objectif de 5 heures"
                onClick={() => {
                  const val = Math.max(0, Math.round((monthlyTargetInput - 5) * 100) / 100);
                  handleSaveMonthlyTarget(val);
                }}
                className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-2 border-slate-300 dark:border-slate-700 font-black text-slate-800 dark:text-slate-200 text-base flex items-center justify-center active:scale-95 shadow-xs"
                title="Diminuer de 5 heures"
              >
                -5
              </button>

              <div className="flex items-center bg-blue-50 dark:bg-slate-800 border-2 border-blue-600 dark:border-blue-500 rounded-xl px-2.5 h-11 shadow-inner" title="Tapez vos heures du planning (ex: 88 ou 46h39)">
                <input
                  type="text"
                  aria-label="Heures demandées au planning ce mois-ci"
                  disabled={isMonthValidated || savingTarget}
                  value={targetInputStr}
                  onChange={(e) => setTargetInputStr(e.target.value)}
                  onBlur={() => handleSaveMonthlyTarget(targetInputStr)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveMonthlyTarget(targetInputStr);
                    }
                  }}
                  placeholder="46h39"
                  className="w-24 h-8 text-center font-black text-xl text-blue-950 dark:text-blue-100 bg-transparent focus:outline-none"
                />
              </div>

              <button
                type="button"
                disabled={isMonthValidated || savingTarget}
                aria-label="Augmenter l'objectif de 5 heures"
                onClick={() => {
                  const val = Math.round((monthlyTargetInput + 5) * 100) / 100;
                  handleSaveMonthlyTarget(val);
                }}
                className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-2 border-slate-300 dark:border-slate-700 font-black text-slate-800 dark:text-slate-200 text-base flex items-center justify-center active:scale-95 shadow-xs"
                title="Augmenter de 5 heures"
              >
                +5
              </button>
            </div>
          </div>

          {/* BARRE DE PROGRESSION VISUELLE */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-bold text-blue-950 dark:text-blue-200 px-1">
              <span>Progression : <strong>{formatDuration(totalWorkedThisMonth)}</strong> faites sur <strong>{formatPlanningHours(targetThisMonth)}</strong></span>
              <span className="text-blue-700 dark:text-blue-300 font-black bg-white dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-slate-700 text-xs shadow-2xs">
                {monthProgressPercent}% effectué
              </span>
            </div>
            <div className="w-full bg-blue-200/80 dark:bg-slate-700 rounded-full h-4 overflow-hidden p-0.5 shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  totalWorkedThisMonth >= targetThisMonth
                    ? 'bg-emerald-500'
                    : 'bg-blue-600'
                }`}
                style={{ width: `${monthProgressPercent}%` }}
              />
            </div>
          </div>

          {/* LES 3 TUILLES GRAND FORMAT */}
          <div className="grid grid-cols-3 gap-2.5 text-center pt-1 text-xs">
            <div className="bg-white dark:bg-slate-800/90 p-2.5 rounded-2xl border-2 border-blue-200 dark:border-slate-700 shadow-2xs">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase tracking-tight">Demandé planning</span>
              <strong className="text-base font-black text-slate-900 dark:text-slate-100">{formatPlanningHours(targetThisMonth)}</strong>
            </div>
            <div className="bg-white dark:bg-slate-800/90 p-2.5 rounded-2xl border-2 border-blue-400 dark:border-blue-500/80 shadow-2xs">
              <span className="text-[10px] text-blue-700 dark:text-blue-300 block font-bold uppercase tracking-tight">Effectué</span>
              <strong className="text-base font-black text-blue-700 dark:text-blue-300">{formatDuration(totalWorkedThisMonth)}</strong>
            </div>
            <div className="bg-white dark:bg-slate-800/90 p-2.5 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800/60 shadow-2xs">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase tracking-tight">
                {totalWorkedThisMonth >= targetThisMonth ? 'Heures en rab' : 'Reste à faire'}
              </span>
              <strong
                className={`text-base font-black ${
                  totalWorkedThisMonth >= targetThisMonth
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-indigo-700 dark:text-indigo-300'
                }`}
              >
                {totalWorkedThisMonth >= targetThisMonth
                  ? `+${formatDuration(monthOvertimeHours)}`
                  : `${formatDuration(monthRemainingHours)}`}
              </strong>
            </div>
          </div>

          {/* EXPLICATION SIMPLE SOUS LA JAUGE */}
          <p className="text-[11px] text-blue-950 dark:text-blue-200 font-medium leading-snug bg-blue-100/70 dark:bg-slate-800/80 p-2.5 rounded-xl border border-blue-200 dark:border-slate-700">
            💡 <strong>Suivi de votre mois :</strong> Sur vos <strong>{formatPlanningHours(targetThisMonth)}</strong> demandées au planning pour le mois, vous avez effectué <strong>{formatDuration(totalWorkedThisMonth)}</strong> ({monthProgressPercent}%). {totalWorkedThisMonth >= targetThisMonth ? `Objectif atteint avec +${formatDuration(monthOvertimeHours)} de rab !` : `Il vous reste ${formatDuration(monthRemainingHours)} à effectuer d'ici la fin du mois.`}
          </p>
        </div>
      </section>
    </>
  );
};
