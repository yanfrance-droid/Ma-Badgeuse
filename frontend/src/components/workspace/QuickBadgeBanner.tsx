import React from 'react';
import { formatDuration } from '../../utils/format';
import { Zap } from 'lucide-react';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Bandeau « Aujourd'hui non pointé » avec enregistrement en un geste. */
export const QuickBadgeBanner: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const {
    todayStr,
    todayMonth,
    currentMonth,
    entries,
    habitualSchedule,
    quickBadgingToday,
    handleQuickBadgeToday
  } = app;

  return (
    <>
      {/* BANDEAU POINTAGE RAPIDE D'AUJOURD'HUI */}
      {(() => {
        const dayNum = new Date().getDay();
        const isWeekday = dayNum >= 1 && dayNum <= 5;
        const isTodayRecorded = entries.some((e) => e.entry_date === todayStr);
        if (!isWeekday || isTodayRecorded || currentMonth !== todayMonth) return null;

        return (
          <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-400 rounded-3xl p-3.5 space-y-3 shadow-xs animate-in fade-in">
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <strong className="text-sm font-black text-amber-950 dark:text-amber-200">Aujourd'hui non pointé</strong>
                <p className="text-xs text-amber-900 dark:text-amber-300 font-medium mt-0.5">
                  Avez-vous fait vos {formatDuration(habitualSchedule.expectedHours)} ({habitualSchedule.startTime} - {habitualSchedule.endTime}) ?
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={quickBadgingToday}
              onClick={handleQuickBadgeToday}
              className="w-full h-12 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white font-black text-sm transition shadow-md flex items-center justify-center gap-1.5"
            >
              <span>{quickBadgingToday ? 'Validation...' : 'Oui, valider ma journée en 1 clic ⚡'}</span>
            </button>
          </div>
        );
      })()}
    </>
  );
};
