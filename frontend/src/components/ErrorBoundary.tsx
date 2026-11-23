import React from 'react';

interface State {
  error: Error | null;
}

/**
 * Évite l'écran blanc en cas d'erreur d'affichage : message clair et bouton
 * de rechargement. Les données sont sur le serveur, rien n'est perdu.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Erreur d’affichage', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-white">
        <div role="alert" className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-3 text-center">
          <h1 className="text-lg font-bold">Un problème d'affichage est survenu</h1>
          <p className="text-sm text-slate-300">Vos données sont enregistrées sur le serveur. Rechargez la page pour continuer.</p>
          <p className="text-xs text-slate-500 font-mono break-words">{this.state.error.message}</p>
          <button type="button" onClick={() => window.location.reload()} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm">
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
