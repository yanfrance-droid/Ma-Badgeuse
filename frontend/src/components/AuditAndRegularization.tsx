import React, { useState, useEffect } from 'react';
import { AuditLogItem, RegularizationItem } from '../types';
import { History, Plus, Trash2, ArrowUpRight, ArrowDownRight, RotateCcw, ShieldCheck } from 'lucide-react';
import { createRegularization, deleteRegularization, fetchAuditLogs, fetchRegularizations, triggerUndo } from '../api';
import { formatHours } from './CockpitVignette';

interface Props {
  initialCounterType?: 'POSITIVE' | 'NEGATIVE';
  onRefreshSummary: () => Promise<void>;
}

export const AuditAndRegularization: React.FC<Props> = ({
  initialCounterType = 'POSITIVE',
  onRefreshSummary
}) => {
  const [activeTab, setActiveTab] = useState<'REGULARIZATIONS' | 'AUDIT'>('REGULARIZATIONS');

  // Régularisations
  const [regs, setRegs] = useState<RegularizationItem[]>([]);
  const [counterType, setCounterType] = useState<'POSITIVE' | 'NEGATIVE'>(initialCounterType);
  const [regDate, setRegDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [amountHours, setAmountHours] = useState<number>(7.0);
  const [reason, setReason] = useState<string>('');
  const [submittingReg, setSubmittingReg] = useState<boolean>(false);

  // Audit logs
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loadingUndo, setLoadingUndo] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    try {
      const [r, l] = await Promise.all([
        fetchRegularizations(),
        fetchAuditLogs(40)
      ]);
      setRegs(r);
      setLogs(l);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleAddReg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert("Veuillez obligatoirement renseigner un motif pour la régularisation.");
      return;
    }

    setSubmittingReg(true);
    try {
      await createRegularization({
        reg_date: regDate,
        counter_type: counterType,
        amount_hours: amountHours,
        reason: reason.trim()
      });
      setReason('');
      await loadData();
      await onRefreshSummary();
    } catch (err: any) {
      alert("Erreur lors de la régularisation : " + err.message);
    } finally {
      setSubmittingReg(false);
    }
  };

  const handleDeleteReg = async (id: number) => {
    if (confirm("Voulez-vous supprimer cette ligne de régularisation ?")) {
      try {
        await deleteRegularization(id);
        await loadData();
        await onRefreshSummary();
      } catch (err: any) {
        alert("Erreur : " + err.message);
      }
    }
  };

  const handleUndo = async () => {
    setLoadingUndo(true);
    try {
      const res = await triggerUndo();
      alert(res.message);
      await loadData();
      await onRefreshSummary();
    } catch (err: any) {
      alert("Impossible d'annuler : " + err.message);
    } finally {
      setLoadingUndo(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* SÉLECTEUR D'ONGLET */}
      <div className="flex bg-slate-200/80 p-1 rounded-2xl">
        <button
          onClick={() => setActiveTab('REGULARIZATIONS')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'REGULARIZATIONS'
              ? 'bg-white text-blue-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Régularisations & Récupérations
        </button>
        <button
          onClick={() => setActiveTab('AUDIT')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'AUDIT'
              ? 'bg-white text-blue-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Journal d'Audit (Traçabilité)
        </button>
      </div>

      {activeTab === 'REGULARIZATIONS' ? (
        <div className="space-y-4">
          {/* FORMULAIRE NOUVELLE RÉGULARISATION */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
              <Plus className="w-4 h-4 text-blue-600" />
              <span>Enregistrer une régularisation de compteur</span>
            </h3>

            <form onSubmit={handleAddReg} className="space-y-3 text-xs text-slate-700">
              {/* CHOIX DU COMPTEUR */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCounterType('POSITIVE')}
                  className={`p-2.5 rounded-xl border text-left transition flex items-center space-x-2 ${
                    counterType === 'POSITIVE'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs font-bold">Compteur Positif</p>
                    <p className="text-[10px] text-emerald-800">Heures sup payées / repos</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setCounterType('NEGATIVE')}
                  className={`p-2.5 rounded-xl border text-left transition flex items-center space-x-2 ${
                    counterType === 'NEGATIVE'
                      ? 'bg-rose-50 border-rose-500 text-rose-950 font-bold ring-2 ring-rose-500/20'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <ArrowDownRight className="w-4 h-4 text-rose-600 shrink-0" />
                  <div>
                    <p className="text-xs font-bold">Compteur Négatif</p>
                    <p className="text-[10px] text-rose-800">Heures rattrapées</p>
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1">Date d'effet</label>
                  <input
                    type="date"
                    value={regDate}
                    onChange={(e) => setRegDate(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 rounded-xl border border-slate-200 font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Heures déduites</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    value={amountHours}
                    onChange={(e) => setAmountHours(parseFloat(e.target.value) || 0)}
                    className="w-full h-10 px-3 bg-slate-50 rounded-xl border border-slate-200 font-bold text-slate-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Motif formel (Obligatoire)</label>
                <input
                  type="text"
                  placeholder="Ex: Paiement de 5h sur la fiche de paie d'octobre 2026"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 rounded-xl border border-slate-200"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submittingReg}
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition"
              >
                {submittingReg ? 'Enregistrement...' : 'Valider la régularisation'}
              </button>
            </form>
          </div>

          {/* LISTE DES RÉGULARISATIONS */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
              Historique des régularisations passées
            </h4>
            {regs.length === 0 ? (
              <p className="text-xs text-slate-400 bg-white p-4 rounded-xl border border-slate-200 text-center">
                Aucune régularisation enregistrée à ce jour.
              </p>
            ) : (
              regs.map((r) => (
                <div
                  key={r.id}
                  className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs text-xs"
                >
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        r.counter_type === 'POSITIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {r.counter_type === 'POSITIVE' ? 'Sur Positif' : 'Sur Négatif'}
                      </span>
                      <span className="font-black text-slate-800">
                        {r.amount_hours} h
                      </span>
                      <span className="text-slate-400">• {r.reg_date}</span>
                    </div>
                    <p className="text-slate-600 font-medium mt-1">{r.reason}</p>
                  </div>

                  <button
                    onClick={() => handleDeleteReg(r.id)}
                    className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* ONGLET AUDIT LOGS */
        <div className="space-y-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Journal d'Audit</h3>
              <p className="text-xs text-slate-500">Traçabilité complète de chaque action</p>
            </div>
            <button
              onClick={handleUndo}
              disabled={loadingUndo}
              className="py-1.5 px-3 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold transition flex items-center space-x-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Annuler la dernière action (Undo)</span>
            </button>
          </div>

          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="bg-white p-3 rounded-xl border border-slate-200 text-xs shadow-xs space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-[10px]">
                  <span>#{log.id} • {log.created_at}</span>
                  <span className="font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                    {log.action_type}
                  </span>
                </div>
                <p className="font-bold text-slate-800">
                  {log.entity_name} (ID: {log.entity_id})
                </p>
                {log.reason && (
                  <p className="text-blue-800 font-medium italic">« {log.reason} »</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
