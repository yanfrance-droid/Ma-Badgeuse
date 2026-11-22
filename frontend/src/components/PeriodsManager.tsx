import React, { useState } from 'react';
import { PeriodItem, StatusItem } from '../types';
import { CalendarRange, Plus, Trash2, AlertTriangle, Check, ShieldCheck, Copy } from 'lucide-react';
import { checkPeriodConflicts, createPeriod, deletePeriod } from '../api';

interface Props {
  periods: PeriodItem[];
  statuses: StatusItem[];
  onRefresh: () => Promise<void>;
}

export const PeriodsManager: React.FC<Props> = ({ periods, statuses, onRefresh }) => {
  const [showModal, setShowModal] = useState<boolean>(false);
  const [label, setLabel] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [statusId, setStatusId] = useState<number | null>(1); // Congé payé par défaut
  const [notes, setNotes] = useState<string>('');
  const [colorHex, setColorHex] = useState<string>('#0D2B52');

  // État du conflit anti-écrasement
  const [conflictData, setConflictData] = useState<{
    has_conflicts: boolean;
    conflicted_days: Array<{ entry_date: string; expected_hours: number; actual_hours: number; status_label?: string }>;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const resetForm = () => {
    setLabel('');
    setStartDate('');
    setEndDate('');
    setStatusId(1);
    setNotes('');
    setColorHex('#0D2B52');
    setConflictData(null);
    setShowModal(false);
  };

  const handlePreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label || !startDate || !endDate) {
      alert("Veuillez renseigner le libellé, la date de début et la date de fin.");
      return;
    }

    setLoading(true);
    try {
      // 1. Vérification des conflits avec les jours modifiés manuellement
      const conflicts = await checkPeriodConflicts(startDate, endDate);
      if (conflicts.has_conflicts && conflicts.conflicted_days.length > 0) {
        // Déclencher la modale d'alerte anti-écrasement
        setConflictData(conflicts);
      } else {
        // Aucun conflit : appliquer directement
        await applyPeriod(true);
      }
    } catch (err: any) {
      alert("Erreur lors de la vérification : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const applyPeriod = async (preserveOverrides: boolean) => {
    setLoading(true);
    try {
      await createPeriod({
        label,
        start_date: startDate,
        end_date: endDate,
        status_id: statusId,
        color_hex: colorHex,
        notes,
        preserve_overrides: preserveOverrides
      });
      await onRefresh();
      resetForm();
    } catch (err: any) {
      alert("Erreur lors de la création de la période : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, periodLabel: string) => {
    if (confirm(`Supprimer la période "${periodLabel}" ? (Les jours resteront dans votre planning)`)) {
      try {
        await deletePeriod(id);
        await onRefresh();
      } catch (err: any) {
        alert("Erreur lors de la suppression : " + err.message);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* HEADER & AJOUT */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900 leading-tight">
            Périodes & Absences
          </h2>
          <p className="text-xs text-slate-500">
            Vacances scolaires, congés et fermetures de l'école
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center space-x-1.5 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle période</span>
        </button>
      </div>

      {/* RAPPEL SUR LES VACANCES SCOLAIRES */}
      <div className="bg-blue-50/70 border border-blue-200 p-3.5 rounded-2xl text-xs text-blue-900 flex items-start space-x-2.5">
        <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Priorité de vos journées :</span>
          <p className="mt-0.5 text-blue-800 leading-relaxed">
            Vos modifications individuelles priment toujours sur une période. Même pendant les vacances scolaires, vous pouvez librement saisir vos heures de nettoyage ou d'entretien.
          </p>
        </div>
      </div>

      {/* LISTE DES PÉRIODES ENREGISTRÉES */}
      <div className="space-y-2">
        {periods.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200">
            <CalendarRange className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold">Aucune période définie</p>
            <p className="text-xs mt-1">Créez une période pour renseigner vos congés ou vacances en bloc.</p>
          </div>
        ) : (
          periods.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-200 flex items-center justify-between"
              style={{ borderLeftColor: p.status_color || '#0D2B52', borderLeftWidth: '6px' }}
            >
              <div>
                <h3 className="text-sm font-bold text-slate-900">{p.label}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Du <span className="font-semibold text-slate-700">{p.start_date}</span> au{' '}
                  <span className="font-semibold text-slate-700">{p.end_date}</span>
                </p>
                {p.status_label && (
                  <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    {p.status_label}
                  </span>
                )}
              </div>

              <button
                onClick={() => handleDelete(p.id, p.label)}
                className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 flex items-center justify-center transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* MODALE DE CRÉATION DE PÉRIODE */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-base font-bold text-slate-900">Nouvelle Période</h3>
              <button onClick={resetForm} className="text-xs font-semibold text-slate-400">Fermer</button>
            </div>

            <form onSubmit={handlePreSubmit} className="space-y-3 text-xs text-slate-700">
              <div>
                <label className="font-bold text-slate-800 block mb-1">Nom de la période</label>
                <input
                  type="text"
                  placeholder="Ex: Vacances d'été, Fermeture Toussaint"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Date de début</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Date de fin</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full h-10 px-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Statut appliqué</label>
                <select
                  value={statusId || ''}
                  onChange={(e) => setStatusId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-10 px-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold"
                >
                  {statuses.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.label} ({st.accounting_rule})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Commentaires</label>
                <input
                  type="text"
                  placeholder="Notes facultatives"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition flex items-center justify-center space-x-2"
              >
                <Check className="w-5 h-5" />
                <span>{loading ? 'Vérification...' : 'Enregistrer la période'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODALE CRITIQUE ANTI-ÉCRASEMENT */}
      {conflictData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl border-2 border-amber-500 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center space-x-3 text-amber-600">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 leading-tight">
                  Protection Anti-Écrasement
                </h3>
                <p className="text-xs text-amber-800 font-semibold">
                  {conflictData.conflicted_days.length} journée(s) déjà personnalisée(s) !
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Vous avez déjà modifié manuellement certaines journées comprises dans cette période :
            </p>

            {/* LISTE DES JOURS EN CONFLIT */}
            <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200">
              {conflictData.conflicted_days.map((cd) => (
                <div key={cd.entry_date} className="flex items-center justify-between text-xs p-1 bg-white rounded-lg border border-slate-100">
                  <span className="font-bold text-slate-800">{cd.entry_date}</span>
                  <span className="text-slate-500">
                    Fait : <strong className="text-blue-700">{cd.actual_hours}h</strong>
                  </span>
                </div>
              ))}
            </div>

            <p className="text-xs font-bold text-slate-800">
              Que souhaitez-vous faire ?
            </p>

            <div className="space-y-2">
              <button
                onClick={() => applyPeriod(true)}
                disabled={loading}
                className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center space-x-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Conserver mes journées personnalisées (Recommandé)</span>
              </button>

              <button
                onClick={() => applyPeriod(false)}
                disabled={loading}
                className="w-full py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold text-xs transition"
              >
                Écraser tout et forcer le statut de la période
              </button>

              <button
                onClick={() => setConflictData(null)}
                className="w-full py-2 text-center text-xs font-semibold text-slate-400 hover:text-slate-600"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
