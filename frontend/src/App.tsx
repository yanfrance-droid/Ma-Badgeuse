import React, { useEffect, useState } from 'react';
import { User } from './types';
import { UNAUTHENTICATED_EVENT, apiGetMe, apiLogout } from './api';
import { LEGACY_LOCAL_KEYS, LEGACY_SESSION_KEYS } from './domain';
import { useTheme } from './hooks/useTheme';
import { AuthScreen } from './components/AuthScreen';
import { ChangePasswordForm } from './components/ChangePasswordForm';
import { Toaster, notify } from './components/Toaster';
import { Workspace } from './components/workspace/Workspace';

function clearLegacyStorage(): void {
  try {
    LEGACY_LOCAL_KEYS.forEach((k) => localStorage.removeItem(k));
    LEGACY_SESSION_KEYS.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // Stockage indisponible : rien à nettoyer.
  }
}

/**
 * Point d'entrée : vérifie la session puis affiche la connexion, le changement
 * de mot de passe imposé ou l'espace du compte (`Workspace`).
 */
export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const theme = useTheme();

  useEffect(() => {
    clearLegacyStorage();
    apiGetMe()
      .then(setCurrentUser)
      .finally(() => setIsAuthChecking(false));
  }, []);

  // Session expirée ou révoquée : retour à l'écran de connexion.
  useEffect(() => {
    const onUnauthenticated = () => setCurrentUser(null);
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
  }, []);

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-400">Chargement de votre espace...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <AuthScreen onLoginSuccess={setCurrentUser} />
        <Toaster />
      </>
    );
  }

  if (currentUser.must_change_password) {
    return (
      <>
        <ChangePasswordForm
          variant="screen"
          onDone={async (message) => {
            notify(message, 'success');
            setCurrentUser(await apiGetMe());
          }}
          onLogout={async () => {
            await apiLogout();
            window.location.reload();
          }}
        />
        <Toaster />
      </>
    );
  }

  return <Workspace currentUser={currentUser} theme={theme} />;
};

export default App;
