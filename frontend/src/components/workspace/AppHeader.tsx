import React from 'react';
import { RotateCcw } from 'lucide-react';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** En-tête compact : mois affiché, annulation, accès au compte. */
export const AppHeader: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const { currentUser, setShowMoreMenu, handleUndo, monthDisplay } = app;

  return (
    <>
      {/* EN-TÊTE COMPACT (téléphone) : titre, annulation, compte */}
      <header className="sticky top-0 z-40 bg-[#0D2B52] dark:bg-slate-900 text-white px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] shadow-md flex items-center justify-between gap-2 no-print border-b border-blue-950/40 dark:border-slate-800">
        <div className="min-w-0">
          <h1 className="text-base font-black tracking-tight leading-none">🕒 Ma Badgeuse</h1>
          <p className="text-xs text-blue-200 dark:text-slate-400 mt-1 font-medium truncate">{monthDisplay}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleUndo}
            aria-label="Annuler ma dernière modification"
            className="h-11 px-3 rounded-2xl bg-blue-900/90 dark:bg-slate-800 active:bg-blue-800 text-blue-100 flex items-center gap-1.5 text-xs font-bold border border-blue-700/60 dark:border-slate-700"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Annuler</span>
          </button>
          <button
            type="button"
            onClick={() => setShowMoreMenu(true)}
            aria-label={`Compte de ${currentUser.display_name} et autres actions`}
            className="h-11 w-11 rounded-full bg-blue-600 active:bg-blue-700 text-white font-black text-base flex items-center justify-center border-2 border-blue-300/60"
          >
            {(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}
          </button>
        </div>
      </header>
    </>
  );
};
