import React from 'react';
import { Clock, MoreHorizontal, Share2 } from 'lucide-react';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Barre de navigation du bas, à portée de pouce. */
export const BottomNav: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const {
    setShowShareModal,
    setShowMoreMenu,
    setShowAnnualModal,
    annualStartYear,
    selectedDate,
    loadAnnualData,
    goToTodayForm,
    openPeriodModal
  } = app;

  return (
    <>
      {/* BARRE DE NAVIGATION DU BAS (accessible au pouce) */}
      <nav
        aria-label="Navigation principale"
        className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)] no-print"
      >
        <div className="max-w-xl mx-auto grid grid-cols-5">
          {(
            [
              { label: 'Pointer', icon: <Clock className="w-6 h-6" aria-hidden="true" />, onClick: goToTodayForm },
              { label: 'Congés', icon: <span className="text-xl leading-6" aria-hidden="true">🏖️</span>, onClick: () => openPeriodModal(selectedDate, selectedDate) },
              {
                label: 'Bilan',
                icon: <span className="text-xl leading-6" aria-hidden="true">🎯</span>,
                onClick: () => {
                  loadAnnualData(annualStartYear);
                  setShowAnnualModal(true);
                }
              },
              { label: 'Envoyer', icon: <Share2 className="w-6 h-6" aria-hidden="true" />, onClick: () => setShowShareModal(true) },
              { label: 'Plus', icon: <MoreHorizontal className="w-6 h-6" aria-hidden="true" />, onClick: () => setShowMoreMenu(true) }
            ] as Array<{ label: string; icon: React.ReactNode; onClick: () => void }>
          ).map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="h-16 flex flex-col items-center justify-center gap-1 text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 text-xs font-bold"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
};
