import React, { useState, useEffect } from 'react';
import { StatusItem } from '../types';
import { Settings, Save, Download, Upload, Database, RefreshCw, Palette, ShieldCheck, Check } from 'lucide-react';
import { createBackupNow, fetchBackupList, restoreBackup, updateStatus, createStatus } from '../api';

interface Props {
  statuses: StatusItem[];
  onRefreshStatuses: () => Promise<void>;
  onRefreshAll: () => Promise<void>;
}

export const SettingsAndBackup: React.FC<Props> = ({
  statuses,
  onRefreshStatuses,
  onRefreshAll
}) => {
  const [backups, setBackups] = useState<Array<{ filename: string; sizeBytes: number; createdAt: string }>>([]);
  const [loadingBackup, setLoadingBackup] = useState<boolean>(false);
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null);
  const [statusColor, setStatusColor] = useState<string>('');
  const [statusLabel, setStatusLabel] = useState<string>('');
  const [statusRule, setStatusRule] = useState<string>('MAINTAINED');

  // Nouveau statut
  const [newCode, setNewCode] = useState<string>('');
  const [newLabel, setNewLabel] = useState<string>('');
  const [newColor, setNewColor] = useState<string>('#4B5563');
  const [newRule, setNewRule] = useState<string>('NEUTRAL');

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    try {
      const list = await fetchBackupList();
      setBackups(list);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateBackup = async () => {
    setLoadingBackup(true);
    try {
      await createBackupNow();
      alert("Sauvegarde créée avec succès sur le serveur Proxmox !");
      await loadBackups();
    } catch (err: any) {
      alert("Erreur lors de la sauvegarde : " + err.message);
    } finally {
      setLoadingBackup(false);
    }
  };

  const handleRestore = async (filename: string) => {
    if (confirm(`Voulez-vous vraiment restaurer la sauvegarde ${filename} ?\n(Une copie de sécurité automatique sera créée avant)`)) {
      setLoadingBackup(true);
      try {
        await restoreBackup(filename);
        alert("Base restaurée avec succès !");
        await onRefreshAll();
      } catch (err: any) {
        alert("Erreur lors de la restauration : " + err.message);
      } finally {
        setLoadingBackup(false);
      }
    }
  };

  const handleUploadRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (confirm(`Importer et restaurer le fichier ${file.name} ?`)) {
      const formData = new FormData();
      formData.append('database_file', file);
      setLoadingBackup(true);
      try {
        const res = await fetch('/api/backup/upload-restore', {
          method: 'POST',
          body: formData
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        alert("Fichier SQLite restauré avec succès !");
        await onRefreshAll();
      } catch (err: any) {
        alert("Erreur lors de l'import : " + err.message);
      } finally {
        setLoadingBackup(false);
      }
    }
  };

  const handleStartEditStatus = (st: StatusItem) => {
    setEditingStatusId(st.id);
    setStatusColor(st.color_hex);
    setStatusLabel(st.label);
    setStatusRule(st.accounting_rule);
  };

  const handleSaveStatus = async (id: number) => {
    try {
      await updateStatus(id, {
        color_hex: statusColor,
        label: statusLabel,
        accounting_rule: statusRule as any
      });
      setEditingStatusId(null);
      await onRefreshStatuses();
      await onRefreshAll();
    } catch (err: any) {
      alert("Erreur de mise à jour du statut : " + err.message);
    }
  };

  const handleCreateNewStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel || !newCode) return;
    try {
      await createStatus({
        code: newCode.toUpperCase().replace(/\s+/g, '_'),
        label: newLabel,
        color_hex: newColor,
        accounting_rule: newRule
      });
      setNewLabel('');
      setNewCode('');
      await onRefreshStatuses();
      await onRefreshAll();
    } catch (err: any) {
      alert("Erreur lors de la création du statut : " + err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. GESTION DES SAUVEGARDES SQLITE */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3">
        <div className="flex items-center space-x-2">
          <Database className="w-5 h-5 text-blue-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">Sauvegardes & Sécurité des données</h3>
            <p className="text-xs text-slate-500">Base SQLite en mode WAL (Zéro perte)</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <a
            href="/api/backup/export-current"
            download
            className="py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-xs text-center"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Télécharger .sqlite</span>
          </a>

          <button
            onClick={handleCreateBackup}
            disabled={loadingBackup}
            className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
          >
            <Save className="w-4 h-4 text-slate-600 shrink-0" />
            <span>Point de snapshot</span>
          </button>
        </div>

        {/* RESTAURATION PAR FICHIER UPLOADÉ */}
        <div className="pt-2 border-t border-slate-100">
          <label className="flex items-center justify-center space-x-2 w-full py-2 px-3 border border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer text-xs font-semibold text-slate-700 transition">
            <Upload className="w-4 h-4 text-slate-500" />
            <span>Restaurer depuis un fichier .sqlite local</span>
            <input type="file" accept=".sqlite,.db" onChange={handleUploadRestore} className="hidden" />
          </label>
        </div>

        {/* LISTE DES SAUVEGARDES EXISTANTES SUR LE SERVEUR */}
        {backups.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] font-bold text-slate-500 uppercase">
              Sauvegardes disponibles sur Proxmox ({backups.length})
            </p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {backups.map((b) => (
                <div
                  key={b.filename}
                  className="p-2 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                >
                  <div className="truncate pr-2">
                    <p className="font-semibold text-slate-800 truncate">{b.filename}</p>
                    <p className="text-[10px] text-slate-400">
                      {Math.round(b.sizeBytes / 1024)} Ko • {b.createdAt.slice(0, 16).replace('T', ' ')}
                    </p>
                  </div>
                  <div className="flex items-center space-x-1 shrink-0">
                    <a
                      href={`/api/backup/download/${b.filename}`}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      title="Télécharger"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleRestore(b.filename)}
                      className="px-2 py-1 bg-amber-100 text-amber-800 rounded font-bold text-[10px]"
                    >
                      Restaurer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. CONFIGURATION DES 9 STATUTS & RÈGLES COMPTABLES */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3">
        <div className="flex items-center space-x-2">
          <Palette className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">Catalogue des Statuts & Règles</h3>
            <p className="text-xs text-slate-500">Personnalisez les couleurs et les modalités de calcul</p>
          </div>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {statuses.map((st) => (
            <div
              key={st.id}
              className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2 text-xs"
            >
              {editingStatusId === st.id ? (
                /* MODE ÉDITION DU STATUT */
                <div className="space-y-2 bg-white p-2.5 rounded-lg border border-blue-300">
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={statusColor}
                      onChange={(e) => setStatusColor(e.target.value)}
                      className="w-8 h-8 rounded border-none cursor-pointer"
                    />
                    <input
                      type="text"
                      value={statusLabel}
                      onChange={(e) => setStatusLabel(e.target.value)}
                      className="flex-1 h-8 px-2 border border-slate-300 rounded font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                      Règle comptable
                    </label>
                    <select
                      value={statusRule}
                      onChange={(e) => setStatusRule(e.target.value)}
                      className="w-full h-8 px-2 border border-slate-300 rounded text-xs font-semibold"
                    >
                      <option value="MAINTAINED">MAINTAINED (Maintien de salaire / Écart 0)</option>
                      <option value="NEUTRAL">NEUTRAL (Neutralisé / 0h attendue et 0h faite)</option>
                      <option value="DEDUCTED">DEDUCTED (Déduit / Écart négatif)</option>
                      <option value="UNPAID">UNPAID (Congé sans solde / Non payé)</option>
                      <option value="VARIABLE">VARIABLE (Heures libres / Vacances scolaires)</option>
                    </select>
                  </div>

                  <div className="flex justify-end space-x-1 pt-1">
                    <button
                      onClick={() => setEditingStatusId(null)}
                      className="px-2 py-1 text-slate-500 rounded text-xs font-semibold"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={() => handleSaveStatus(st.id)}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold"
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>
              ) : (
                /* MODE AFFICHAGE DU STATUT */
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-4 h-4 rounded-full border border-black/10 shrink-0"
                      style={{ backgroundColor: st.color_hex }}
                    ></span>
                    <div>
                      <span className="font-bold text-slate-800">{st.label}</span>
                      <span className="text-[10px] text-slate-400 block">
                        Règle : <strong className="text-slate-600">{st.accounting_rule}</strong>
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleStartEditStatus(st)}
                    className="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    Modifier
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* AJOUT D'UN STATUT SUPPLÉMENTAIRE */}
        <form onSubmit={handleCreateNewStatus} className="pt-2 border-t border-slate-100 space-y-2 text-xs">
          <p className="font-bold text-slate-700">Ajouter un statut personnalisé</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Code (ex: FORMATION)"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="h-8 px-2 bg-slate-50 rounded-lg border border-slate-200 font-semibold uppercase"
            />
            <input
              type="text"
              placeholder="Libellé affiché"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="h-8 px-2 bg-slate-50 rounded-lg border border-slate-200 font-semibold"
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-8 h-8 rounded border-none cursor-pointer"
            />
            <select
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              className="flex-1 h-8 px-2 bg-slate-50 border border-slate-200 rounded text-xs font-semibold"
            >
              <option value="MAINTAINED">MAINTAINED</option>
              <option value="NEUTRAL">NEUTRAL</option>
              <option value="DEDUCTED">DEDUCTED</option>
              <option value="UNPAID">UNPAID</option>
            </select>
            <button
              type="submit"
              className="px-3 h-8 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900"
            >
              Ajouter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
