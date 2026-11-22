import React from 'react';
import { DailyEntry, StatusItem } from '../types';
import { ChevronLeft, ChevronRight, CheckCircle2, LockOpen, Sparkles } from 'lucide-react';
import { formatHours, formatSimpleHours } from './CockpitVignette';

interface Props {
  currentMonth: string; // 'YYYY-MM'
  entries: DailyEntry[];
  statuses: StatusItem[];
  isValidated: boolean;
  onMonthChange: (newMonth: string) => void;
  onSelectDate: (dateStr: string) => void;
  onToggleValidate: () => Promise<void>;
}

export const CalendarView: React.FC<Props> = ({
  currentMonth,
  entries,
  statuses,
  isValidated,
  onMonthChange,
  onSelectDate,
  onToggleValidate
}) => {
  const [year, month] = currentMonth.split('-').map(Number);

  // Navigation mois
  const handlePrevMonth = () => {
    const d = new Date(year, month - 2, 1);
    onMonthChange(d.toISOString().slice(0, 7));
  };

  const handleNextMonth = () => {
    const d = new Date(year, month, 1);
    onMonthChange(d.toISOString().slice(0, 7));
  };

  const handleCurrentMonth = () => {
    onMonthChange(new Date().toISOString().slice(0, 7));
  };

  // Création de la grille du mois
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayWeekIndex = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Lundi = 0

  const daysArray: (number | null)[] = [];
  for (let i = 0; i < firstDayWeekIndex; i++) {
    daysArray.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    daysArray.push(d);
  }

  // Map des entrées par date
  const entryMap = new Map<string, DailyEntry>();
  for (const e of entries) {
    entryMap.set(e.entry_date, e);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  return (
    <div className="space-y-3">
      {/* HEADER DE NAVIGATION DU MOIS */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200 flex items-center justify-between">
        <button
          onClick={handlePrevMonth}
          className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition active:scale-95"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center cursor-pointer" onClick={handleCurrentMonth}>
          <h2 className="text-base font-bold text-slate-900 leading-tight">
            {monthNames[month - 1]} {year}
          </h2>
          <span className="text-[11px] text-blue-600 font-semibold">Toucher pour aujourd'hui</span>
        </div>

        <button
          onClick={handleNextMonth}
          className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition active:scale-95"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* BANDEAU DE VALIDATION RÉVERSIBLE DU MOIS */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {isValidated ? (
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <LockOpen className="w-5 h-5" />
            </div>
          )}
          <div>
            <p className="text-xs font-bold text-slate-800">
              {isValidated ? 'Mois validé (clôturé)' : 'Mois ouvert aux pointages'}
            </p>
            <p className="text-[10px] text-slate-500">
              {isValidated ? 'Réversible à tout moment sans blocage' : 'Toujours modifiable'}
            </p>
          </div>
        </div>

        <button
          onClick={onToggleValidate}
          className={`py-1.5 px-3 rounded-xl text-xs font-bold transition shadow-xs ${
            isValidated
              ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {isValidated ? 'Rouvrir le mois' : 'Valider le mois'}
        </button>
      </div>

      {/* GRILLE DU CALENDRIER MOBILE */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200">
        {/* JOURS DE LA SEMAINE */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1 pb-1 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase">
          <span>Lun</span>
          <span>Mar</span>
          <span>Mer</span>
          <span>Jeu</span>
          <span>Ven</span>
          <span>Sam</span>
          <span>Dim</span>
        </div>

        {/* CELLULES DES JOURS */}
        <div className="grid grid-cols-7 gap-1">
          {daysArray.map((dayNum, idx) => {
            if (dayNum === null) {
              return <div key={`empty-${idx}`} className="h-14 sm:h-16 rounded-xl bg-transparent"></div>;
            }

            const dayStr = dayNum.toString().padStart(2, '0');
            const fullDate = `${currentMonth}-${dayStr}`;
            const entry = entryMap.get(fullDate);
            const isToday = fullDate === todayStr;

            const hasEntry = Boolean(entry);
            const delta = entry?.delta_hours || 0;
            const statusColor = entry?.status_color;

            return (
              <button
                key={fullDate}
                onClick={() => onSelectDate(fullDate)}
                className={`h-14 sm:h-16 rounded-xl p-1 flex flex-col justify-between text-left transition border relative ${
                  isToday
                    ? 'border-blue-500 bg-blue-50/50 shadow-xs'
                    : 'border-slate-100 bg-slate-50/60 hover:bg-slate-100'
                }`}
                style={{
                  borderTopColor: statusColor || (isToday ? '#3B82F6' : undefined),
                  borderTopWidth: statusColor ? '4px' : undefined
                }}
              >
                {/* NUMÉRO DU JOUR */}
                <div className="flex items-center justify-between w-full">
                  <span className={`text-[11px] font-bold ${isToday ? 'text-blue-700 font-black' : 'text-slate-700'}`}>
                    {dayNum}
                  </span>
                  {entry?.is_override === 1 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" title="Jour modifié manuellement"></span>
                  )}
                </div>

                {/* HEURES OU STATUT */}
                {hasEntry ? (
                  <div className="space-y-0.5">
                    {entry?.status_label ? (
                      <span
                        className="text-[9px] font-bold block truncate rounded px-1 text-white"
                        style={{ backgroundColor: statusColor || '#0D2B52' }}
                      >
                        {entry.status_label}
                      </span>
                    ) : null}

                    <div className="flex items-center justify-between text-[9px] font-medium leading-none text-slate-600">
                      <span>{entry?.actual_hours || 0}h</span>
                      {delta !== 0 && (
                        <span className={`font-bold ${delta > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-[9px] text-slate-300">-</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
