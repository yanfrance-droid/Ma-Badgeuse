/**
 * Installation de l'application sur l'écran d'accueil (PWA).
 *
 * Chrome n'émet l'événement « beforeinstallprompt » (installation en un geste,
 * plein écran) que si le site est servi en HTTPS. En HTTP sur le réseau local,
 * seul l'ajout manuel « Ajouter à l'écran d'accueil » est possible.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Mémorisé sur l'appareil : 'installed' ou 'dismissed' → la fenêtre n'est plus proposée. */
const INSTALL_STATE_KEY = 'install_prompt_state';
/** Événement pour rouvrir la fenêtre d'installation depuis le menu. */
export const OPEN_INSTALL_EVENT = 'ma-badgeuse:open-install';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((l) => l());
}

export function getInstallState(): string | null {
  try {
    return localStorage.getItem(INSTALL_STATE_KEY);
  } catch {
    return null;
  }
}

export function setInstallState(state: 'installed' | 'dismissed'): void {
  try {
    localStorage.setItem(INSTALL_STATE_KEY, state);
  } catch {
    // Stockage indisponible : la fenêtre pourra être reproposée.
  }
}

/** Application ouverte depuis l'icône installée (plein écran). */
export function isRunningInstalled(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

/** Lance l'installation proposée par Chrome. Renvoie true si l'utilisateur a accepté. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  notifyListeners();
  return outcome === 'accepted';
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * À appeler au démarrage, avant l'affichage : l'événement de Chrome peut arriver
 * avant la connexion de l'utilisateur.
 */
export function initPwa(): void {
  if (isRunningInstalled()) setInstallState('installed');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setInstallState('installed');
    notifyListeners();
  });

  // Service worker sans cache (voir public/sw.js) ; disponible seulement en HTTPS ou sur localhost.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn("Service worker non enregistré :", err));
  }
}
