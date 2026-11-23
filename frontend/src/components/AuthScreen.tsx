import React, { useEffect, useState } from 'react';
import { SetupStatus, User } from '../types';
import { apiLogin, apiRegister, apiSetupStatus } from '../api';
import { UserCheck, UserPlus, Eye, EyeOff, Clock, AlertCircle, Info } from 'lucide-react';

interface AuthScreenProps {
  onLoginSuccess: (user: User) => void;
}

const INPUT_CLASS =
  'w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

const PasswordField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  invalid?: boolean;
}> = ({ id, label, value, onChange, autoComplete, invalid }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-300 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT_CLASS} pr-10 ${invalid ? 'border-red-500 ring-1 ring-red-500' : ''}`}
          required
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

/**
 * Écran de connexion. La création de compte n'est proposée que pour le tout
 * premier compte (qui devient administrateur) ou si l'administrateur a ouvert
 * l'inscription. Un mot de passe oublié se réinitialise auprès de l'administrateur.
 */
export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    apiSetupStatus()
      .then((s) => {
        setSetup(s);
        if (s.needs_setup) setMode('REGISTER');
      })
      .catch(() => setError('Serveur injoignable. Vérifiez votre connexion au réseau.'));
  }, []);

  const minLength = setup?.password_min_length ?? 10;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      onLoginSuccess(await apiLogin(username.trim(), password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < minLength) {
      setError(`Le mot de passe doit comporter au moins ${minLength} caractères.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      onLoginSuccess(await apiRegister({ username: username.trim(), displayName: displayName.trim(), password }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const canRegister = Boolean(setup?.registration_open);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg mb-3">
            <Clock className="w-9 h-9" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Ma Badgeuse</h1>
          <p className="text-sm text-slate-400 mt-1">
            {setup?.needs_setup ? 'Premier lancement : créez le compte administrateur' : 'Suivi du temps de travail'}
          </p>
        </div>

        {canRegister && !setup?.needs_setup && (
          <div className="flex bg-slate-900/80 p-1 rounded-xl mb-6 border border-slate-700/60" role="tablist">
            {(['LOGIN', 'REGISTER'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                  mode === m ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'LOGIN' ? <UserCheck className="w-4 h-4" aria-hidden="true" /> : <UserPlus className="w-4 h-4" aria-hidden="true" />}
                {m === 'LOGIN' ? 'Se connecter' : 'Nouveau compte'}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div role="alert" className="mb-5 p-3.5 bg-red-950/60 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" aria-hidden="true" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {mode === 'LOGIN' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-username" className="block text-xs font-medium text-slate-300 mb-1">
                Identifiant
              </label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={INPUT_CLASS}
                required
              />
            </div>
            <PasswordField id="login-password" label="Mot de passe" value={password} onChange={setPassword} autoComplete="current-password" />

            <p className="text-xs text-slate-400 flex items-start gap-2">
              <Info className="w-4 h-4 flex-shrink-0 text-slate-500" aria-hidden="true" />
              Mot de passe oublié ? Demandez à l'administrateur de vous donner un mot de passe temporaire.
            </p>

            <button
              type="submit"
              disabled={loading || !setup}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4" aria-hidden="true" />
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="reg-display" className="block text-xs font-medium text-slate-300 mb-1">
                Prénom affiché
              </label>
              <input
                id="reg-display"
                type="text"
                value={displayName}
                maxLength={60}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (!username) setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
                }}
                className={INPUT_CLASS}
                required
              />
            </div>
            <div>
              <label htmlFor="reg-username" className="block text-xs font-medium text-slate-300 mb-1">
                Identifiant de connexion (minuscules, chiffres, . _ -)
              </label>
              <input
                id="reg-username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                maxLength={40}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                className={INPUT_CLASS}
                required
              />
            </div>
            <PasswordField
              id="reg-password"
              label={`Mot de passe (${minLength} caractères minimum)`}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            <PasswordField
              id="reg-confirm"
              label="Confirmer le mot de passe"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              invalid={Boolean(confirmPassword) && password !== confirmPassword}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" aria-hidden="true" />
              {loading ? 'Création...' : setup?.needs_setup ? 'Créer le compte administrateur' : 'Créer mon compte'}
            </button>
          </form>
        )}
      </div>

      <p className="mt-6 max-w-md text-center text-xs text-slate-500">
        Pour protéger les mots de passe sur le réseau, accédez à l'application en HTTPS (voir le guide d'installation).
      </p>
    </div>
  );
};
