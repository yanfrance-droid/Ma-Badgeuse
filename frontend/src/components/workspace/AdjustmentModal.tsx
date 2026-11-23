import React from 'react';
import { Modal } from '../Modal';
import { formatHours } from '../../utils/format';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Fenêtre de règlement ou d'ajout sur un compteur. */
export const AdjustmentModal: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const { todayStr, summary, habitualSchedule, settleModal, setSettleModal, handleConfirmSettle } = app;

  return (
    <>
      {/* ========================================================= */}
      {/* MODALE D'AJUSTEMENT : RAJOUTER OU DÉDUIRE DU COMPTEUR     */}
      {/* ========================================================= */}
      {settleModal.isOpen && (
        <Modal
          onClose={() => setSettleModal({ ...settleModal, isOpen: false })}
          labelledBy="settle-title"
          className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-3.5 text-xs text-slate-700 dark:text-slate-200 max-h-[92vh] overflow-y-auto"
        >
            {/* EN-TÊTE MODALE AVEC ONGLET AJOUT vs DÉDUCTION */}
            <div className="space-y-2">
              <h3 id="settle-title" className="text-base font-black text-slate-900 dark:text-slate-100 leading-tight">
                {settleModal.type === 'POSITIVE'
                  ? (settleModal.operation === 'ADD' ? '➕ Rajouter des heures supplémentaires' : '✓ Régler des heures supplémentaires')
                  : (settleModal.operation === 'ADD' ? '➕ Rajouter des heures à rattraper' : '✓ Rattraper des heures dues')}
              </h3>

              {/* ONGLET DE SÉLECTION D'OPÉRATION */}
              <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setSettleModal({ ...settleModal, operation: 'ADD', amountToSettle: habitualSchedule.expectedHours, reason: settleModal.type === 'POSITIVE' ? 'Report solde heures sup' : 'Report heures à rattraper' })}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition ${
                    settleModal.operation === 'ADD'
                      ? (settleModal.type === 'POSITIVE' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-rose-600 text-white shadow-xs')
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  ➕ Rajouter
                </button>
                <button
                  type="button"
                  onClick={() => setSettleModal({ ...settleModal, operation: 'SETTLE', amountToSettle: settleModal.totalDue, reason: settleModal.type === 'POSITIVE' ? 'Payé sur ma fiche de paie' : 'Heures rattrapées' })}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition ${
                    settleModal.operation === 'SETTLE'
                      ? 'bg-slate-800 dark:bg-slate-700 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  ✓ Déduire / Régler
                </button>
              </div>
            </div>

            <div className={`p-2.5 rounded-xl border ${
              settleModal.type === 'POSITIVE'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-200'
            }`}>
              <span className="opacity-80 block text-[11px] font-semibold">
                {settleModal.type === 'POSITIVE' ? 'Compteur « On me doit » actuel :' : 'Compteur « Je dois » actuel :'}
              </span>
              <strong className="text-base font-black">
                {settleModal.type === 'POSITIVE'
                  ? formatHours(summary?.total_positive_balance || 0)
                  : formatHours(-Math.abs(summary?.total_negative_balance || 0))}
              </strong>
            </div>

            <form onSubmit={handleConfirmSettle} className="space-y-3">
              <div>
                <label className="font-bold block mb-1 text-slate-800 dark:text-slate-200">
                  {settleModal.operation === 'ADD'
                    ? "Combien d'heures voulez-vous rajouter ?"
                    : "Combien d'heures voulez-vous déduire ?"}
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    aria-label="Nombre d'heures"
                    step="0.25"
                    min="0.25"
                    max={settleModal.operation === 'ADD' ? 999 : Math.abs(settleModal.totalDue) || undefined}
                    value={settleModal.amountToSettle}
                    onChange={(e) =>
                      setSettleModal({
                        ...settleModal,
                        amountToSettle: parseFloat(e.target.value) || 0
                      })
                    }
                    className="w-full h-11 px-3 bg-white dark:bg-slate-800 rounded-xl border border-blue-400 dark:border-blue-500 font-black text-xl text-blue-950 dark:text-blue-100 text-center"
                    required
                  />
                  <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">heures</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 italic">
                  {settleModal.operation === 'ADD'
                    ? (settleModal.type === 'POSITIVE'
                        ? "Ces heures viendront alimenter votre crédit d'heures sup (ou compenser vos éventuelles heures dues)."
                        : "Ces heures viendront alimenter votre total d'heures à rattraper.")
                    : "Exemple : sur 4h, si vous tapez 2h, il en restera 2h sur votre compteur !"}
                </p>
              </div>

              <div>
                <label className="font-bold block mb-1 text-slate-800 dark:text-slate-200">Motif (Preuve)</label>
                <input
                  type="text"
                  placeholder={
                    settleModal.operation === 'ADD'
                      ? (settleModal.type === 'POSITIVE' ? "Ex: Report d'heures sup, fête de l'école..." : "Ex: Dette initiale à rattraper, absence convenue...")
                      : (settleModal.type === 'POSITIVE' ? "Ex: Payé sur paie de novembre" : "Ex: Rattrapé samedi matin")
                  }
                  value={settleModal.reason}
                  onChange={(e) =>
                    setSettleModal({ ...settleModal, reason: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="font-bold block mb-1 text-slate-800 dark:text-slate-200">Date</label>
                <input
                  type="date"
                  aria-label="Date de l'opération"
                  max={settleModal.operation === 'SETTLE' ? todayStr : undefined}
                  value={settleModal.date}
                  onChange={(e) =>
                    setSettleModal({ ...settleModal, date: e.target.value })
                  }
                  className="w-full h-10 px-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100"
                  required
                />
              </div>

              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setSettleModal({ ...settleModal, isOpen: false })}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-2.5 rounded-xl text-white font-bold transition shadow-md ${
                    settleModal.operation === 'ADD'
                      ? (settleModal.type === 'POSITIVE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700')
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {settleModal.operation === 'ADD' ? "Valider l'ajout" : 'Valider la déduction'}
                </button>
              </div>
            </form>
        </Modal>
      )}
    </>
  );
};
