import React from 'react';
import { User } from '../../types';
import { useWorkspace } from '../../hooks/useWorkspace';
import type { ThemeControls } from '../../hooks/useTheme';
import { InstallPrompt } from '../InstallPrompt';
import { Toaster } from '../Toaster';
import { AppHeader } from './AppHeader';
import { BottomNav } from './BottomNav';
import { MoreMenu } from './MoreMenu';
import { QuickBadgeBanner } from './QuickBadgeBanner';
import { MonthOverview } from './MonthOverview';
import { CountersSection } from './CountersSection';
import { DayFormSection } from './DayFormSection';
import { ProofBook } from './ProofBook';
import { ShareSection } from './ShareSection';
import { SettingsModal } from './SettingsModal';
import { AdjustmentModal } from './AdjustmentModal';
import { PeriodModal } from './PeriodModal';
import { ShareModal } from './ShareModal';
import { AnnualModal } from './AnnualModal';
import { AnnualPrint } from './AnnualPrint';
import { MonthlyPrint } from './MonthlyPrint';

/** Espace d'un compte connecté : écran principal, fenêtres et relevés imprimables. */
export const Workspace: React.FC<{ currentUser: User; theme: ThemeControls }> = ({ currentUser, theme }) => {
  const app = useWorkspace(currentUser, theme);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 pb-[calc(5.5rem+env(safe-area-inset-bottom))] font-sans transition-colors duration-150">
      <AppHeader app={app} />
      <BottomNav app={app} />
      <MoreMenu app={app} />
      <InstallPrompt />

      {/* CONTENU PRINCIPAL */}
      <main className="max-w-xl mx-auto p-3 space-y-4 no-print">
        <QuickBadgeBanner app={app} />
        <MonthOverview app={app} />
        <CountersSection app={app} />
        <DayFormSection app={app} />
        <ProofBook app={app} />
        <ShareSection app={app} />
      </main>

      <SettingsModal app={app} />
      <AdjustmentModal app={app} />
      <PeriodModal app={app} />
      <ShareModal app={app} />
      <AnnualModal app={app} />

      {/* IMPRESSION : RELEVÉ MENSUEL OU BILAN ANNUEL OFFICIEL */}
      <div className="print-only p-8 text-black bg-white text-xs font-sans max-w-4xl mx-auto">
        {app.printMode === 'ANNUAL' && app.annualSummary ? <AnnualPrint app={app} /> : <MonthlyPrint app={app} />}
      </div>
      <Toaster />
    </div>
  );
};
