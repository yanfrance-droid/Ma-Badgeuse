import React, { useState, useEffect } from 'react';
import { DailyEntry, StatusItem } from '../types';
import { X, Clock, Calendar, Check, AlertCircle, Trash2 } from 'lucide-react';
import { formatHours } from './CockpitVignette';

interface Props {
  isOpen: boolean;
  dateStr: string;
  initialEntry: DailyEntry | null;
  statuses: StatusItem[];
  onClose: () => void;
  onSave: (entryData: any) => Promise<void>;
  onDelete: (dateStr: string) => Promise<void>;
}

export const DayEntryModal: React.FC<Props> = ({
  isOpen,
  dateStr,
  initialEntry,
  statuses,
  onClose,
  onSave,
  onDelete
}) => {
  const [expectedHours, setExpectedHours] = useState<number>(7.0);
  const [startTime, setStartTime] = useState<string>('08:00');
  const [endTime, setEndTime] = useState<string>('15:30');
  const [breakMinutes, setBreakMinutes] = useState<number>(30);
  const [manualOverride, setManualOverride] = useState<boolean>(false);
  const [manualHours, setManualHours] = useState<string>('7.0');
  const [statusId, setStatusId] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [auditReason, setAuditReason] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (initialEntry) {
      setExpectedHours(initialEntry.expected_hours || 0);
      setStartTime(initialEntry.start_time || '08:00');
      setEndTime(initialEntry.end_time || '15:30');
      setBreakMinutes(initialEntry.break_minutes || 0);
      setManualOverride(Boolean(initialEntry.manual_actual_override));
      setManualHours(initialEntry.actual_hours ? initialEntry.actual_hours.toString() : '0');
      setStatusId(initialEntry.status_id || null);
      setNotes(initialEntry.notes || '');
    } else {
      setExpectedHours(7.0);
      setStartTime('08:00');
      setEndTime('15:30');
      setBreakMinutes(30);
      setManualOverride(false);
      setManualHours('7.0');
      setStatusId(null);
      setNotes('');
    }
    setAuditReason('');
  }, [initialEntry, dateStr, isOpen]);

  if (!isOpen) return null;

  // Calcul dynamique des heures réelles
  let calculatedHours = 0;
  if (manualOverride) {
    calculatedHours = parseFloat(manualHours) || 0;
  } else if (startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    let durMin = endMin >= startMin ? endMin - startMin : 24 * 60 - startMin + endMin;
    durMin = Math.max(0, durMin - (breakMinutes || 0));
    calculatedHours = Math.round((durMin / 60) * 100) / 100;
  }

  // Écart estimé
  const delta = Math.round((calculatedHours - expectedHours) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        entry_date: dateStr,
        expected_hours: expectedHours,
        start_time: manualOverride ? null : startTime,
        end_time: manualOverride ? null : endTime,
        break_minutes: manualOverride ? 0 : breakMinutes,
        manual_actual_hours: manualOverride ? parseFloat(manualHours) : null,
        status_id: statusId,
        notes: notes.trim() || null,
        audit_reason: auditReason.trim() || undefined
      });
      onClose();
    } catch (err: any) {
      alert("Erreur lors de l'enregistrement : " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Voulez-vous vraiment effacer le pointage du ${dateStr} ?`)) {
      setSaving(true);
      try {
        await onDelete(dateStr);
        onClose();
      } catch (err: any) {
        alert("Erreur lors de la suppression : " + err.message);
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl animate-in fade-in slide-in-from-bottom-4">
        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-sm">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Pointage du {dateStr}
              </h2>
              <p className="text-xs text-slate-500">Saisie simple & calcul immédiat</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENU FORMULAIRE DÉFILABLE */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 space-y-4 text-slate-700">
          {/* 1. HEURES PRÉVUES / ATTENDUES AU PLANNING */}
          <div className="bg-blue-50/60 p-3.5 rounded-2xl border border-blue-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-blue-900 uppercase tracking-wide">
                1. Heures attendues au planning
              </label>
              <span className="text-xs font-bold text-blue-700 bg-white px-2 py-0.5 rounded-md border border-blue-200">
                {expectedHours} h
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setExpectedHours((h) => Math.max(0, Math.round((h - 0.5) * 10) / 10))}
                className="w-10 h-10 rounded-xl bg-white text-blue-800 font-bold border border-blue-200 shadow-xs flex items-center justify-center active:scale-95"
              >
                -0.5
              </button>
              <input
                type="number"
                step="0.25"
                min="0"
                max="24"
                value={expectedHours}
                onChange={(e) => setExpectedHours(parseFloat(e.target.value) || 0)}
                className="flex-1 h-10 px-3 bg-white rounded-xl border border-blue-200 text-center font-bold text-blue-950 focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setExpectedHours((h) => Math.round((h + 0.5) * 10) / 10)}
                className="w-10 h-10 rounded-xl bg-white text-blue-800 font-bold border border-blue-200 shadow-xs flex items-center justify-center active:scale-95"
              >
                +0.5
              </button>
            </div>
          </div>

          {/* 2. MODE DE SAISIE DES HEURES EFFECTUÉES */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                2. Heures réellement faites
              </label>
              <button
                type="button"
                onClick={() => setManualOverride(!manualOverride)}
                className="text-[11px] font-semibold text-blue-600 underline"
              >
                {manualOverride ? "Basculer vers Arrivée / Départ" : "Saisir une durée directe"}
              </button>
            </div>

            {!manualOverride ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Arrivée
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full h-11 px-3 bg-white rounded-xl border border-slate-300 font-bold text-base text-slate-800 text-center focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                      Départ
                    </label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full h-11 px-3 bg-white rounded-xl border border-slate-300 font-bold text-base text-slate-800 text-center focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    Pause non payée (minutes)
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[0, 15, 30, 45].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setBreakMinutes(m)}
                        className={`py-1.5 text-xs font-semibold rounded-lg border transition ${
                          breakMinutes === m
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Durée totale directe (en heures décimales)
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max="24"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  className="w-full h-11 px-3 bg-white rounded-xl border border-slate-300 font-bold text-lg text-blue-900 text-center focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* SYNTHÈSE DU CALCUL EN DIRECT */}
            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 font-medium">Temps calculé : </span>
                <span className="font-bold text-slate-800 text-sm">{calculatedHours} h</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Écart : </span>
                <span className={`font-black text-sm px-2 py-0.5 rounded-md ${
                  delta > 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : delta < 0
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-800'
                }`}>
                  {formatHours(delta)}
                </span>
              </div>
            </div>
          </div>

          {/* 3. SÉLECTION DU STATUT (9 STATUTS PALETTE) */}
          <div>
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wide block mb-1.5">
              3. Statut de la journée
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-1 bg-slate-50 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setStatusId(null)}
                className={`flex items-center space-x-2 p-2 rounded-xl border text-left text-xs transition ${
                  statusId === null
                    ? 'bg-blue-600 text-white border-blue-600 font-bold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="w-3 h-3 rounded-full bg-slate-300 shrink-0"></span>
                <span className="truncate">Jour standard / Travaillé</span>
              </button>

              {statuses.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusId(st.id)}
                  className={`flex items-center space-x-2 p-2 rounded-xl border text-left text-xs transition ${
                    statusId === st.id
                      ? 'ring-2 ring-blue-500 font-bold bg-white'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                  style={{
                    borderLeftColor: st.color_hex,
                    borderLeftWidth: '6px'
                  }}
                >
                  <span className="truncate">{st.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. NOTES ET COMMENTAIRE */}
          <div>
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wide block mb-1">
              4. Note personnelle (optionnel)
            </label>
            <input
              type="text"
              placeholder="Ex: Remplacement cantine maternelle, retard bus..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* MOTIF DE MODIF (POUR L'HISTORIQUE D'AUDIT) */}
          {initialEntry && (
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Motif de la modification (pour l'historique)
              </label>
              <input
                type="text"
                placeholder="Ex: Correction heure de départ"
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                className="w-full h-9 px-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-700"
              />
            </div>
          )}

          {/* ACTIONS PIED DE MODALE */}
          <div className="pt-2 flex items-center space-x-2">
            {initialEntry && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center hover:bg-rose-100 active:scale-95 transition shrink-0"
                title="Supprimer"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md active:scale-98 transition flex items-center justify-center space-x-2"
            >
              <Check className="w-5 h-5" />
              <span>{saving ? 'Enregistrement...' : 'Enregistrer le pointage'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
