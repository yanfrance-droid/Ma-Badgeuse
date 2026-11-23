import React from 'react';
import { formatDuration, formatHours, formatSignedDuration } from '../../utils/format';
import { formatDateFrench } from '../../utils/dates';
import { AlertCircle, Briefcase, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Edit2, Settings, X } from 'lucide-react';
import { ABSENCE_REASONS, absenceLabel } from '../../domain';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Formulaire de pointage du jour (travail ou absence). */
export const DayFormSection: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const {
    todayStr,
    habitualSchedule,
    selectedDate,
    editingEntryDate,
    dayType,
    setDayType,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    breakMinutes,
    setBreakMinutes,
    absenceReasonId,
    setAbsenceReasonId,
    absenceImpact,
    setAbsenceImpact,
    absenceHours,
    setAbsenceHours,
    notes,
    setNotes,
    savingDay,
    formSectionRef,
    existingEntry,
    handleSelectDate,
    handleGoToToday,
    handlePrevDay,
    handleNextDay,
    handleCancelEdit,
    calculatedActual,
    dayDelta,
    handleSaveDay,
    handleDeleteDay,
    openSettings,
    openPeriodModal
  } = app;

  return (
    <>
      {/* ========================================================= */}
      {/* BLOC 3 : LE POINTAGE DU JOUR (TRAVAIL OU ABSENCE AU CHOIX)*/}
      {/* ========================================================= */}
      <section
        ref={formSectionRef}
        className={`scroll-mt-20 bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border transition duration-200 space-y-3.5 ${
          editingEntryDate === selectedDate
            ? 'border-amber-400 ring-2 ring-amber-400/40'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        {/* BANNIÈRE DE MODIFICATION EN COURS OU BADGE CALME DE JOURNÉE DÉJÀ POINTÉE */}
        {editingEntryDate === selectedDate ? (
          <div className="bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-400 text-amber-950 dark:text-amber-200 p-3 rounded-2xl flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2.5">
              <Edit2 className="w-5 h-5 text-amber-700 dark:text-amber-400 animate-pulse shrink-0" />
              <div>
                <span className="font-black text-xs uppercase tracking-wide block">
                  Mode Modification en cours
                </span>
                <span className="text-[11px] text-amber-900 dark:text-amber-300 font-semibold">
                  Vous modifiez la journée du <strong>{selectedDate}</strong>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-slate-700 text-amber-950 dark:text-amber-200 font-bold text-xs rounded-xl border border-amber-300 dark:border-slate-700 shadow-xs flex items-center space-x-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Annuler</span>
            </button>
          </div>
        ) : existingEntry ? (
          <div className="bg-blue-50/80 dark:bg-slate-800/80 border border-blue-200 dark:border-slate-700 text-blue-950 dark:text-blue-200 px-3.5 py-2.5 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-100">
                  Journée déjà enregistrée
                </span>
                <span className="text-[11px] text-slate-600 dark:text-slate-400 block">
                  {existingEntry.status_id
                    ? `Absence : ${absenceLabel(existingEntry)}`
                    : `${formatDuration(existingEntry.actual_hours)} faites (${existingEntry.start_time} - ${existingEntry.end_time})`}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDeleteDay(selectedDate)}
              className="px-2.5 py-1 text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold rounded-xl border border-rose-200 dark:border-rose-900/60 transition"
            >
              🗑️ Supprimer la journée
            </button>
          </div>
        ) : null}

        {/* SÉLECTEUR DE LA DATE & NAVIGATION DANS LE TEMPS */}
        <div className="space-y-1.5 pb-2.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-1.5">
            {/* FLÈCHE JOUR PRÉCÉDENT */}
            <button
              type="button"
              onClick={handlePrevDay}
              title="Jour précédent"
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 transition shrink-0 active:scale-95 shadow-2xs"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* SÉLECTEUR DE DATE NATIF */}
            <div className="relative flex-1">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleSelectDate(e.target.value)}
                className="w-full h-9 px-2 bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-800 dark:hover:bg-slate-700 font-black text-xs sm:text-sm text-slate-900 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 cursor-pointer text-center shadow-2xs"
                title="Cliquer pour choisir n'importe quelle date dans le calendrier"
              />
            </div>

            {/* FLÈCHE JOUR SUIVANT */}
            <button
              type="button"
              onClick={handleNextDay}
              title="Jour suivant"
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 transition shrink-0 active:scale-95 shadow-2xs"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* BOUTON RAPIDE AUJOURD'HUI */}
            {selectedDate === todayStr ? (
              <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-black shrink-0 flex items-center space-x-1">
                <span>✓</span>
                <span>Aujourd'hui</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={handleGoToToday}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shrink-0 flex items-center space-x-1 shadow-xs active:scale-95"
                title="Revenir directement à la journée d'aujourd'hui"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Aujourd'hui</span>
              </button>
            )}
          </div>

          {/* DATE LISIBLE EN FRANÇAIS + STATUT TEMPOREL */}
          <div className="flex items-center justify-between text-xs px-1 font-semibold text-slate-600 dark:text-slate-400">
            <span className="text-slate-800 dark:text-slate-200 font-bold">
              📅 {formatDateFrench(selectedDate)}
            </span>
            {selectedDate !== todayStr && (
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  selectedDate < todayStr
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    : 'bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                }`}
              >
                {selectedDate < todayStr ? 'Jour passé' : 'Jour futur'}
              </span>
            )}
          </div>
        </div>

        {/* RAPPEL DES HORAIRES HABITUELS ET MODIFICATION */}
        <div className="bg-slate-50/90 dark:bg-slate-800/80 px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1.5 truncate">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Horaires habituels :</span>
            <strong className="text-blue-900 dark:text-blue-300 font-black">
              {habitualSchedule.startTime} - {habitualSchedule.endTime} ({formatDuration(habitualSchedule.expectedHours)}/j)
            </strong>
          </div>
          <button
            type="button"
            onClick={() => openSettings('SCHEDULE')}
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-bold text-xs flex items-center space-x-1 shrink-0 ml-2 hover:underline"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Modifier</span>
          </button>
        </div>

        {/* DEUX CHOIX LIMPIDES : J'AI TRAVAILLÉ OU JE N'AI PAS TRAVAILLÉ */}
        <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl">
          <button
            type="button"
            onClick={() => setDayType('WORKED')}
            className={`py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center space-x-1.5 ${
              dayType === 'WORKED'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>J'ai travaillé</span>
          </button>

          <button
            type="button"
            onClick={() => setDayType('ABSENT')}
            className={`py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center space-x-1.5 ${
              dayType === 'ABSENT'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>Absence / Exceptionnel</span>
          </button>
        </div>

        <form onSubmit={handleSaveDay} className="space-y-3">
          {dayType === 'WORKED' ? (
            /* CAS 1 : JOURNÉE TRAVAILLÉE NORMALE */
            <div className="space-y-3">
              {/* HORAIRES D'ARRIVÉE ET DE DÉPART */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase block">
                  Mes horaires réels (arrivée et départ) :
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-0.5">
                      Heure d'arrivée
                    </span>
                    <input
                      type="time"
                      aria-label="Heure d'arrivée"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full h-11 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 font-black text-center text-base text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-0.5">
                      Heure de départ
                    </span>
                    <input
                      type="time"
                      aria-label="Heure de départ"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full h-11 bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 font-black text-center text-base text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* 3. PAUSE REPAS JUSQU'À 1 HEURE ET MODIFIABLE SUR MESURE */}
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                      Pause repas (non payée) :
                    </span>
                    <span className="text-xs font-black text-blue-900 dark:text-blue-300 bg-blue-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-blue-200 dark:border-slate-700">
                      {breakMinutes === 0
                        ? 'Aucune pause (0 min)'
                        : breakMinutes === 60
                        ? '1 h 00 (60 min)'
                        : `${breakMinutes} min`}
                    </span>
                  </div>

                  {/* Boutons rapides jusqu'à 1 heure (60 min) */}
                  <div className="grid grid-cols-5 gap-1">
                    {[0, 15, 30, 45, 60].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setBreakMinutes(m)}
                        className={`py-1.5 rounded-lg text-xs font-bold border transition ${
                          breakMinutes === m
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {m === 60 ? '1h (60m)' : `${m}m`}
                      </button>
                    ))}
                  </div>

                  {/* Ajustement précis et modifiable si besoin */}
                  <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      Ajuster précisément (modifiable) :
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setBreakMinutes((bm) => Math.max(0, bm - 5))}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center active:scale-95"
                      >
                        -5m
                      </button>
                      <input
                        type="number"
                        aria-label="Pause en minutes"
                        min="0"
                        max="180"
                        step="5"
                        value={breakMinutes}
                        onChange={(e) => setBreakMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-14 h-7 text-center font-black text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">min</span>
                      <button
                        type="button"
                        onClick={() => setBreakMinutes((bm) => bm + 5)}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center active:scale-95"
                      >
                        +5m
                      </button>
                    </div>
                  </div>
                </div>

                {/* CALCUL EN DIRECT */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Temps réellement fait : </span>
                    <strong className="text-slate-900 dark:text-slate-100 text-sm font-black">{formatDuration(calculatedActual)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Écart : </span>
                    <span
                      className={`font-black text-sm px-2.5 py-0.5 rounded-lg ${
                        dayDelta > 0
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          : dayDelta < 0
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {formatHours(dayDelta)}
                    </span>
                  </div>
                </div>

                {/* ALERTE DE SÉCURITÉ ANTI-INVERSION HEURE D'ARRIVÉE / DÉPART */}
                {calculatedActual >= 12 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border-2 border-amber-400 rounded-xl text-xs text-amber-950 dark:text-amber-200 flex items-start space-x-2.5 shadow-2xs">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-black text-amber-900 dark:text-amber-300">
                        Attention : durée calculée très élevée ({formatDuration(calculatedActual)}) !
                      </strong>
                      <p className="text-[11px] text-amber-800 dark:text-amber-400 mt-0.5 leading-snug">
                        Avez-vous accidentellement inversé l'heure d'arrivée ({startTime}) et de départ ({endTime}) ?
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* PRÉCISION FACULTATIVE */}
              <div>
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Précision facultative (ex: récurage cantine, livraison...)
                </span>
                <input
                  type="text"
                  placeholder="Note personnelle"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-10 px-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={savingDay}
                className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition active:scale-98 flex items-center justify-center space-x-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {savingDay
                    ? 'Enregistrement...'
                    : existingEntry
                    ? `💾 Mettre à jour cette journée (${selectedDate})`
                    : `Enregistrer ma journée de travail (${selectedDate})`}
                </span>
              </button>
            </div>
          ) : (
            /* CAS 2 : ABSENCE / EXCEPTIONNEL AVEC CHOIX DE L'IMPACT */
            <div className="bg-amber-50/70 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-900/40 space-y-3">
              {/* RACCOURCI POSER PLUSIEURS JOURS / CONGÉS */}
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 p-2.5 rounded-2xl flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">🏖️</span>
                  <div>
                    <span className="font-black text-emerald-950 dark:text-emerald-200 text-xs block">Besoin de poser plusieurs jours à 0 h / congés ?</span>
                    <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-medium">Pour 1 ou 2 semaines de vacances sans pointer jour par jour</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openPeriodModal(selectedDate, selectedDate)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shrink-0 shadow-xs active:scale-95"
                >
                  Poser des jours à 0 h
                </button>
              </div>

              <div>
                <p className="text-xs font-bold text-amber-950 dark:text-amber-200 mb-1.5">
                  1. Choisissez le motif d'absence :
                </p>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-1 bg-white/80 dark:bg-slate-800/80 rounded-xl border border-amber-200 dark:border-slate-700">
                  {ABSENCE_REASONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setAbsenceReasonId(r.id);
                        setAbsenceImpact(r.defaultImpact);
                      }}
                      aria-pressed={absenceReasonId === r.id}
                      className={`p-2 rounded-xl border text-left text-xs font-bold transition ${
                        absenceReasonId === r.id
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="truncate block">{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. COMMENT COMPTE CETTE JOURNÉE ? (LE CHOIX ESSENTIEL) */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-300 dark:border-slate-700 space-y-2.5">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                  2. Comment cette journée doit-elle compter sur vos heures ?
                </span>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAbsenceImpact('COUNTED_AS_WORKED')}
                    className={`p-2.5 rounded-xl border text-center text-xs font-bold transition ${
                      absenceImpact === 'COUNTED_AS_WORKED'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="block text-base">🟢</span>
                    <span className="block mt-0.5 leading-tight text-xs font-black">Validé au mois</span>
                    <span className="text-[9px] font-normal block opacity-80">Compte au contrat</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAbsenceImpact('TO_RECOVER')}
                    className={`p-2.5 rounded-xl border text-center text-xs font-bold transition ${
                      absenceImpact === 'TO_RECOVER'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="block text-base">🔴</span>
                    <span className="block mt-0.5 leading-tight text-xs font-black">À rattraper</span>
                    <span className="text-[9px] font-normal block opacity-80">Je dois les h</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAbsenceImpact('NEUTRAL')}
                    className={`p-2.5 rounded-xl border text-center text-xs font-bold transition ${
                      absenceImpact === 'NEUTRAL'
                        ? 'bg-slate-800 dark:bg-slate-700 text-white border-slate-800 dark:border-slate-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="block text-base">⚪</span>
                    <span className="block mt-0.5 leading-tight text-xs font-black">Neutre</span>
                    <span className="text-[9px] font-normal block opacity-80">Ne change rien</span>
                  </button>
                </div>

                {/* SI À RATTRAPER OU COMPTÉ FAIT : INDIQUER LE VOLUME D'HEURES */}
                {absenceImpact !== 'NEUTRAL' && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {absenceImpact === 'TO_RECOVER' ? 'Nombre d\'heures à devoir :' : 'Nombre d\'heures créditées :'}
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setAbsenceHours((h) => Math.max(0.5, Math.round((h - 0.5) * 10) / 10))}
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold"
                      >
                        -0.5
                      </button>
                      <input
                        type="number"
                        aria-label="Nombre d'heures"
                        step="0.25"
                        min="0.25"
                        max="24"
                        value={absenceHours}
                        onChange={(e) => setAbsenceHours(parseFloat(e.target.value) || 0)}
                        className="w-16 h-8 text-center font-black text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">h</span>
                      <button
                        type="button"
                        onClick={() => setAbsenceHours((h) => Math.round((h + 0.5) * 10) / 10)}
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold"
                      >
                        +0.5
                      </button>
                    </div>
                  </div>
                )}

                {/* CALCUL ET CONSÉQUENCE EN DIRECT IMMÉDIATE */}
                <div className="pt-2 border-t border-amber-200 dark:border-slate-800">
                  {absenceImpact === 'TO_RECOVER' && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-rose-900 dark:text-rose-200">🔴 Conséquence sur vos compteurs :</span>
                        <span className="font-black text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/60 px-2 py-0.5 rounded-lg text-sm">
                          {formatSignedDuration(-absenceHours)}
                        </span>
                      </div>
                      <p className="text-[11px] text-rose-800 dark:text-rose-300 leading-relaxed">
                        Ces <strong>{formatDuration(absenceHours)}</strong> seront automatiquement déduites de vos heures supplémentaires en réserve (ou ajoutées à vos heures à rattraper si votre réserve d'heures sup est insuffisante).
                      </p>
                    </div>
                  )}

                  {absenceImpact === 'COUNTED_AS_WORKED' && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-emerald-900 dark:text-emerald-200">🟢 Conséquence sur vos compteurs :</span>
                        <span className="font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-lg text-sm">
                          + {formatDuration(absenceHours)} faites
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                        Ces <strong>{formatDuration(absenceHours)}</strong> seront comptabilisées dans vos heures faites du mois. Vos compteurs "Je dois" et "On me doit" ne changent pas.
                      </p>
                    </div>
                  )}

                  {absenceImpact === 'NEUTRAL' && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-800 dark:text-slate-200">⚪ Conséquence sur vos compteurs :</span>
                        <span className="font-black text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-lg text-sm">
                          0 h 00
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        Journée neutralisée (0h attendue, 0h faite) : aucun impact sur vos compteurs ni sur les heures du mois.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Précision facultative (ex: grippe, cantine fermée...)
                </span>
                <input
                  type="text"
                  placeholder="Note personnelle"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-10 px-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={savingDay}
                className="w-full h-12 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md transition active:scale-98 flex items-center justify-center space-x-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {savingDay
                    ? 'Enregistrement...'
                    : existingEntry
                    ? `💾 Mettre à jour l'absence (${selectedDate})`
                    : `Enregistrer cette absence (${selectedDate})`}
                </span>
              </button>
            </div>
          )}
        </form>
      </section>
    </>
  );
};
