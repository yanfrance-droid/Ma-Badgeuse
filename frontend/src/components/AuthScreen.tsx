import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { apiLogin, apiRegister, apiGetSecurityQuestion, apiResetPassword, apiListUsers } from '../api';
import { UserCheck, UserPlus, KeyRound, Eye, EyeOff, ShieldCheck, Clock, AlertCircle, ArrowLeft } from 'lucide-react';

interface AuthScreenProps {
  onLoginSuccess: (user: User) => void;
}

const DEFAULT_QUESTIONS = [
  'Quel est le nom de notre premier animal de compagnie ?',
  'Quelle est la ville de naissance de maman ?',
  'Quel est le plat préféré de la famille ?',
  'Quel est le mot de passe de secours de la famille ?',
  'Autre question personnalisée...'
];

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT'>('LOGIN');
  const [existingUsers, setExistingUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states - Login
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Form states - Register
  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState(DEFAULT_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [regAnswer, setRegAnswer] = useState('');

  // Form states - Forgot password
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [securityQuestionFound, setSecurityQuestionFound] = useState('');
  const [forgotAnswer, setForgotAnswer] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [showForgotConfirmPassword, setShowForgotConfirmPassword] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const users = await apiListUsers();
      setExistingUsers(users);
      if (users.length > 0 && !loginUsername) {
        // Pré-sélectionner le premier utilisateur par défaut
        setLoginUsername(users[0].username);
      }
    } catch {
      // Ignorer
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setError('Veuillez renseigner votre identifiant et votre mot de passe.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiLogin(loginUsername.trim(), loginPassword);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalQuestion = selectedQuestion === 'Autre question personnalisée...' ? customQuestion.trim() : selectedQuestion;

    if (!regUsername.trim() || !regDisplayName.trim() || !regPassword.trim() || !regConfirmPassword.trim()) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Les deux mots de passe ne correspondent pas. Veuillez vérifier votre saisie.');
      return;
    }
    if (!finalQuestion) {
      setError('Veuillez choisir ou rédiger une question de sécurité.');
      return;
    }
    if (!regAnswer.trim()) {
      setError('Veuillez renseigner la réponse à votre question de secours.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await apiRegister({
        username: regUsername.trim(),
        displayName: regDisplayName.trim(),
        password: regPassword,
        securityQuestion: finalQuestion,
        securityAnswer: regAnswer.trim()
      });
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || "Erreur lors de la création de l'espace");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotUsername.trim()) {
      setError('Veuillez entrer votre nom d’utilisateur.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiGetSecurityQuestion(forgotUsername.trim());
      setSecurityQuestionFound(res.security_question);
      setForgotStep(2);
    } catch (err: any) {
      setError(err.message || 'Compte introuvable');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotAnswer.trim() || !forgotNewPassword.trim() || !forgotConfirmPassword.trim()) {
      setError('Veuillez fournir la réponse et confirmer le nouveau mot de passe.');
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setError('Les deux mots de passe ne correspondent pas. Veuillez vérifier votre saisie.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiResetPassword({
        username: forgotUsername.trim(),
        securityAnswer: forgotAnswer.trim(),
        newPassword: forgotNewPassword
      });
      setSuccessMsg('Mot de passe réinitialisé avec succès ! Connexion en cours...');
      setTimeout(() => {
        onLoginSuccess(res.user);
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Réponse de secours incorrecte');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 selection:bg-blue-600 selection:text-white">
      {/* Container Card */}
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-sm">
        
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-500/30 mb-3">
            <Clock className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Ma Badgeuse</h1>
          <p className="text-sm text-slate-400 mt-1">
            Espace de suivi du temps de travail de la famille
          </p>
        </div>

        {/* Navigation Tabs (Connexion / Nouveau Compte) */}
        {mode !== 'FORGOT' && (
          <div className="flex bg-slate-900/80 p-1 rounded-xl mb-6 border border-slate-700/60">
            <button
              type="button"
              onClick={() => { setMode('LOGIN'); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                mode === 'LOGIN'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              Se connecter
            </button>
            <button
              type="button"
              onClick={() => { setMode('REGISTER'); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                mode === 'REGISTER'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Nouveau compte
            </button>
          </div>
        )}

        {/* Alerts */}
        {error && (
          <div className="mb-5 p-3.5 bg-red-950/60 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3.5 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-200 text-sm flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />
            <div className="flex-1">{successMsg}</div>
          </div>
        )}

        {/* ===================== MODE LOGIN ===================== */}
        {mode === 'LOGIN' && (
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Quick avatar badges if accounts exist */}
            {existingUsers.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Choisir un compte existant :
                </label>
                <div className="flex flex-wrap gap-2">
                  {existingUsers.map((u) => {
                    const isSelected = loginUsername.toLowerCase() === u.username.toLowerCase();
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setLoginUsername(u.username);
                          setError(null);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                          isSelected
                            ? 'bg-blue-600/30 text-blue-300 border-blue-500 shadow-sm'
                            : 'bg-slate-700/50 text-slate-300 border-slate-600 hover:bg-slate-700'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                        {u.display_name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Identifiant ou Prénom
              </label>
              <input
                type="text"
                autoComplete="username"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Ex: maman, sarah..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-300">
                  Mot de passe
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('FORGOT');
                    setForgotStep(1);
                    setForgotUsername(loginUsername);
                    setError(null);
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Mot de passe simple..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  tabIndex={-1}
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-700/50 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <p className="text-xs text-slate-400">
                <strong className="text-slate-300">Connexion permanente :</strong> Une fois connecté, vous n'aurez plus besoin de retaper votre mot de passe sur cet appareil.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  Accéder à mon espace
                </>
              )}
            </button>
          </form>
        )}

        {/* ===================== MODE REGISTER ===================== */}
        {mode === 'REGISTER' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Prénom affiché (Ex: Julie, Sarah, Papa...)
              </label>
              <input
                type="text"
                value={regDisplayName}
                onChange={(e) => {
                  setRegDisplayName(e.target.value);
                  if (!regUsername) {
                    setRegUsername(e.target.value.toLowerCase().replace(/\s+/g, ''));
                  }
                }}
                placeholder="Ex: Sarah"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Identifiant de connexion (sans espace, minuscules)
              </label>
              <input
                type="text"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                placeholder="Ex: sarah"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Mot de passe simple
              </label>
              <div className="relative">
                <input
                  type={showRegPassword ? 'text' : 'password'}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Choisissez un mot de passe..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword(!showRegPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  tabIndex={-1}
                >
                  {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <input
                  type={showRegConfirmPassword ? 'text' : 'password'}
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="Retapez votre mot de passe pour confirmer..."
                  className={`w-full bg-slate-900 border ${
                    regConfirmPassword && regPassword !== regConfirmPassword
                      ? 'border-red-500 ring-1 ring-red-500'
                      : 'border-slate-700'
                  } rounded-xl px-4 py-2.5 pr-10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  tabIndex={-1}
                >
                  {showRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {regConfirmPassword && regPassword !== regConfirmPassword && (
                <p className="text-[11px] text-red-400 mt-1">Les mots de passe ne correspondent pas</p>
              )}
            </div>

            {/* Question de secours */}
            <div className="pt-2 border-t border-slate-700/60">
              <label className="block text-xs font-medium text-blue-300 mb-1 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                Question de secours (pour récupérer votre mot de passe)
              </label>
              <select
                value={selectedQuestion}
                onChange={(e) => setSelectedQuestion(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500 mb-2"
              >
                {DEFAULT_QUESTIONS.map((q, idx) => (
                  <option key={idx} value={q}>{q}</option>
                ))}
              </select>

              {selectedQuestion === 'Autre question personnalisée...' && (
                <input
                  type="text"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Rédigez votre question secrète..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-500 text-xs mb-2 focus:outline-none focus:border-blue-500"
                  required
                />
              )}

              <input
                type="text"
                value={regAnswer}
                onChange={(e) => setRegAnswer(e.target.value)}
                placeholder="Réponse secrète (Ex: Médor, Paris...)"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Créer mon espace vierge
                </>
              )}
            </button>
          </form>
        )}

        {/* ===================== MODE FORGOT PASSWORD ===================== */}
        {mode === 'FORGOT' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => { setMode('LOGIN'); setError(null); }}
                className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-sm font-semibold text-white">Récupération de mot de passe</h2>
            </div>

            {forgotStep === 1 ? (
              <form onSubmit={handleForgotStep1} className="space-y-4">
                <p className="text-xs text-slate-400">
                  Entrez votre identifiant pour afficher la question de sécurité configurée lors de votre inscription.
                </p>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nom d'utilisateur
                  </label>
                  <input
                    type="text"
                    value={forgotUsername}
                    onChange={(e) => setForgotUsername(e.target.value)}
                    placeholder="Ex: maman, sarah..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm transition-all"
                >
                  {loading ? 'Recherche...' : 'Continuer'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleForgotStep2} className="space-y-4">
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700">
                  <span className="text-[11px] font-semibold uppercase text-blue-400 tracking-wider block mb-1">
                    Question de sécurité :
                  </span>
                  <p className="text-xs text-white font-medium">
                    {securityQuestionFound}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Votre réponse secrète
                  </label>
                  <input
                    type="text"
                    value={forgotAnswer}
                    onChange={(e) => setForgotAnswer(e.target.value)}
                    placeholder="Votre réponse..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nouveau mot de passe
                  </label>
                  <div className="relative">
                    <input
                      type={showForgotNewPassword ? 'text' : 'password'}
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder="Nouveau mot de passe..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotNewPassword(!showForgotNewPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      tabIndex={-1}
                    >
                      {showForgotNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Confirmer le nouveau mot de passe
                  </label>
                  <div className="relative">
                    <input
                      type={showForgotConfirmPassword ? 'text' : 'password'}
                      value={forgotConfirmPassword}
                      onChange={(e) => setForgotConfirmPassword(e.target.value)}
                      placeholder="Retapez votre nouveau mot de passe..."
                      className={`w-full bg-slate-900 border ${
                        forgotConfirmPassword && forgotNewPassword !== forgotConfirmPassword
                          ? 'border-red-500 ring-1 ring-red-500'
                          : 'border-slate-700'
                      } rounded-xl px-4 py-2.5 pr-10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotConfirmPassword(!showForgotConfirmPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                      tabIndex={-1}
                    >
                      {showForgotConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {forgotConfirmPassword && forgotNewPassword !== forgotConfirmPassword && (
                    <p className="text-[11px] text-red-400 mt-1">Les mots de passe ne correspondent pas</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition-all"
                >
                  {loading ? 'Validation...' : 'Valider et me connecter'}
                </button>
              </form>
            )}
          </div>
        )}

      </div>
      
      {/* Footer Info */}
      <div className="mt-6 text-center text-xs text-slate-500">
        Connexion sécurisée en réseau local & VPN (Tailscale / Wireguard)
      </div>
    </div>
  );
};
