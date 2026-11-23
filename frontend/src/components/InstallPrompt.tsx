import React, { useEffect, useState } from 'react';
import { Download, MoreVertical, Smartphone } from 'lucide-react';
import { Modal } from './Modal';
import { notify } from './Toaster';
import {
  OPEN_INSTALL_EVENT,
  getDeferredPrompt,
  getInstallState,
  isAndroid,
  isRunningInstalled,
  promptInstall,
  setInstallState,
  subscribeInstall
} from '../services/pwa';

/** Délai avant de proposer l'ajout manuel quand Chrome ne propose pas l'installation. */
const MANUAL_DELAY_MS = 4000;

/**
 * Fenêtre « Installer l'application » sur Android.
 * - Chrome propose l'installation (HTTPS) : bouton « Installer » natif.
 * - Sinon : explication de l'ajout à l'écran d'accueil par le menu de Chrome.
 * Une fois installée (ou refusée définitivement), elle n'est plus proposée ;
 * elle reste accessible depuis le menu « Plus ».
 */
export const InstallPrompt: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [canPrompt, setCanPrompt] = useState(() => getDeferredPrompt() !== null);

  useEffect(() => {
    if (isRunningInstalled()) return;

    const unsubscribe = subscribeInstall(() => {
      const available = getDeferredPrompt() !== null;
      setCanPrompt(available);
      if (getInstallState() === 'installed') setOpen(false);
      else if (available && !getInstallState()) setOpen(true);
    });

    const onOpenRequest = () => {
      setCanPrompt(getDeferredPrompt() !== null);
      setOpen(true);
    };
    window.addEventListener(OPEN_INSTALL_EVENT, onOpenRequest);

    let timer: number | undefined;
    if (!getInstallState() && isAndroid()) {
      if (getDeferredPrompt()) setOpen(true);
      else timer = window.setTimeout(() => setOpen(!getInstallState()), MANUAL_DELAY_MS);
    }

    return () => {
      unsubscribe();
      window.removeEventListener(OPEN_INSTALL_EVENT, onOpenRequest);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  if (!open) return null;

  const close = () => setOpen(false);

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) {
      setInstallState('installed');
      notify("Application installée : ouvrez-la désormais depuis son icône.", 'success');
      close();
    }
  };

  return (
    <Modal
      onClose={close}
      labelledBy="install-title"
      className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-sm text-slate-700 dark:text-slate-200"
    >
      <div className="flex items-center gap-3">
        <img src="/pwa-192x192.png" alt="" className="w-12 h-12 rounded-2xl shadow" />
        <div>
          <h2 id="install-title" className="text-base font-black text-slate-900 dark:text-slate-100">
            Installer Ma Badgeuse
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Une icône sur votre écran d'accueil, comme une application.</p>
        </div>
      </div>

      {canPrompt ? (
        <button
          type="button"
          onClick={handleInstall}
          className="w-full h-12 rounded-2xl bg-blue-600 active:bg-blue-700 text-white font-bold flex items-center justify-center gap-2"
        >
          <Download className="w-5 h-5" aria-hidden="true" />
          Installer l'application
        </button>
      ) : (
        <ol className="space-y-2.5 text-sm">
          <li className="flex items-start gap-2.5">
            <span className="w-6 h-6 shrink-0 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center">1</span>
            <span>
              Touchez le menu de Chrome <MoreVertical className="inline w-4 h-4 -mt-0.5" aria-label="trois points" /> en haut à droite.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="w-6 h-6 shrink-0 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center">2</span>
            <span>
              Choisissez <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="w-6 h-6 shrink-0 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center">3</span>
            <span>Confirmez avec <strong>« Ajouter »</strong>, puis ouvrez Ma Badgeuse depuis son icône.</span>
          </li>
        </ol>
      )}

      {!canPrompt && (
        <button
          type="button"
          onClick={() => {
            setInstallState('installed');
            close();
          }}
          className="w-full h-12 rounded-2xl bg-blue-600 active:bg-blue-700 text-white font-bold flex items-center justify-center gap-2"
        >
          <Smartphone className="w-5 h-5" aria-hidden="true" />
          C'est fait
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={close} className="h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">
          Plus tard
        </button>
        <button
          type="button"
          onClick={() => {
            setInstallState('dismissed');
            close();
          }}
          className="h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 font-bold text-sm text-slate-500 dark:text-slate-400"
        >
          Ne plus proposer
        </button>
      </div>
    </Modal>
  );
};
