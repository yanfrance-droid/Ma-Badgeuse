import React from 'react';
import { Modal } from '../Modal';
import { OPEN_INSTALL_EVENT, isRunningInstalled } from '../../services/pwa';
import { Download, History, LogOut, Monitor, Moon, Printer, Settings, ShieldCheck, Sun, UserCheck } from 'lucide-react';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Menu « Plus » : réglages, historique, compte, impression, thème, installation, déconnexion. */
export const MoreMenu: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const {
    currentUser,
    appTheme,
    handleCycleTheme,
    showMoreMenu,
    setShowMoreMenu,
    handleLogout,
    handlePrintMonthly,
    openSettings
  } = app;

  return (
    <>
      {/* MENU « PLUS » */}
      {showMoreMenu && (
        <Modal
          onClose={() => setShowMoreMenu(false)}
          labelledBy="more-title"
          placement="bottom"
          className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-t-3xl px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl border-t border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100"
        >
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mb-3" aria-hidden="true" />
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="w-11 h-11 rounded-full bg-blue-600 text-white font-black text-lg flex items-center justify-center">
              {(currentUser.display_name || currentUser.username).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 id="more-title" className="font-black truncate">{currentUser.display_name}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                @{currentUser.username}
                {currentUser.is_admin ? ' • administrateur' : ''}
              </p>
            </div>
          </div>
          <ul className="py-1">
            {(
              [
                { label: 'Réglages et horaires', icon: <Settings className="w-5 h-5" />, onClick: () => openSettings('SCHEDULE') },
                { label: 'Historique des modifications', icon: <History className="w-5 h-5" />, onClick: () => openSettings('HISTORY') },
                { label: 'Mon compte et mot de passe', icon: <UserCheck className="w-5 h-5" />, onClick: () => openSettings('ACCOUNT') },
                ...(currentUser.is_admin
                  ? [{ label: 'Administration', icon: <ShieldCheck className="w-5 h-5 text-amber-600" />, onClick: () => openSettings('ADMIN') }]
                  : []),
                { label: 'Imprimer ou enregistrer le relevé (PDF)', icon: <Printer className="w-5 h-5" />, onClick: handlePrintMonthly },
                {
                  label: `Thème : ${appTheme === 'LIGHT' ? 'clair' : appTheme === 'DARK' ? 'sombre' : 'automatique'}`,
                  icon: appTheme === 'LIGHT' ? <Sun className="w-5 h-5" /> : appTheme === 'DARK' ? <Moon className="w-5 h-5" /> : <Monitor className="w-5 h-5" />,
                  onClick: handleCycleTheme,
                  keepOpen: true
                },
                ...(!isRunningInstalled()
                  ? [{ label: "Installer l'application", icon: <Download className="w-5 h-5" />, onClick: () => window.dispatchEvent(new Event(OPEN_INSTALL_EVENT)) }]
                  : []),
                { label: 'Se déconnecter', icon: <LogOut className="w-5 h-5 text-rose-600" />, onClick: handleLogout }
              ] as Array<{ label: string; icon: React.ReactNode; onClick: () => void; keepOpen?: boolean }>
            ).map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => {
                    if (!item.keepOpen) setShowMoreMenu(false);
                    item.onClick();
                  }}
                  className="w-full min-h-[52px] flex items-center gap-3 px-2 rounded-2xl text-left text-[15px] font-semibold active:bg-slate-100 dark:active:bg-slate-800"
                >
                  <span className="text-slate-500 dark:text-slate-400" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
};
