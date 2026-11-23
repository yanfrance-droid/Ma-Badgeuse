import React, { useState } from 'react';
import { apiChangePassword } from '../api';
import { KeyRound } from 'lucide-react';

const MIN_LENGTH = 10;

interface Props {
  /** Affichage plein écran (changement obligatoire) ou intégré aux réglages. */
  variant: 'screen' | 'inline';
  onDone: (message: string) => void;
  onLogout?: () => void;
}

/**
 * Changement de mot de passe. Obligatoire après un mot de passe temporaire
 * donné par l'administrateur, ou si l'ancien mot de passe est trop court.
 */
export const ChangePasswordForm: React.FC<Props> = ({ variant, onDone, onLogout }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < MIN_LENGTH) {
      setError(`Le nouveau mot de passe doit comporter au moins ${MIN_LENGTH} caractères.`);
      return;
    }
    if (next !== confirm) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const message = await apiChangePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      onDone(message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const dark = variant === 'screen';
  const inputClass = dark
    ? 'w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500'
    : 'w-full h-9 px-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 text-sm';
  const labelClass = dark ? 'block text-xs font-medium text-slate-300 mb-1' : 'block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1';

  const form = (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div role="alert" className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-200 text-xs">
          {error}
        </div>
      )}
      <div>
        <label htmlFor={`${variant}-current-pw`} className={labelClass}>
          Mot de passe actuel {variant === 'screen' ? '(ou mot de passe temporaire)' : ''}
        </label>
        <input id={`${variant}-current-pw`} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label htmlFor={`${variant}-new-pw`} className={labelClass}>
          Nouveau mot de passe ({MIN_LENGTH} caractères minimum)
        </label>
        <input id={`${variant}-new-pw`} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} required />
      </div>
      <div>
        <label htmlFor={`${variant}-confirm-pw`} className={labelClass}>
          Confirmer le nouveau mot de passe
        </label>
        <input id={`${variant}-confirm-pw`} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} required />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm transition"
      >
        {saving ? 'Enregistrement...' : 'Changer mon mot de passe'}
      </button>
    </form>
  );

  if (variant === 'inline') return form;

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <KeyRound className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Choisissez un nouveau mot de passe</h1>
            <p className="text-xs text-slate-400">Votre mot de passe actuel est temporaire ou trop court.</p>
          </div>
        </div>
        {form}
        {onLogout && (
          <button type="button" onClick={onLogout} className="w-full text-xs text-slate-400 hover:text-white underline">
            Se déconnecter
          </button>
        )}
      </div>
    </div>
  );
};
