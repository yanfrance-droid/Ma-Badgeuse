import React from 'react';
import { Modal } from '../Modal';
import { Check, Copy, Mail, MessageSquare, Phone, Share2, X } from 'lucide-react';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Fenêtre de transmission (WhatsApp, e-mail, SMS, copie). */
export const ShareModal: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const {
    profile,
    setProfile,
    showShareModal,
    setShowShareModal,
    copiedShare,
    saveContacts,
    monthDisplay,
    agentName,
    generateShareMessage,
    handleCopyShareText,
    handleSendWhatsApp,
    handleSendEmail,
    handleSendSMS,
    handleNativeShare
  } = app;

  return (
    <>
      {/* ========================================================= */}
      {/* MODALE DE TRANSMISSION (WHATSAPP, EMAIL, SMS, COPIER)     */}
      {/* ========================================================= */}
      {showShareModal && (
        <Modal
          onClose={() => setShowShareModal(false)}
          labelledBy="share-title"
          className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-5 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 max-h-[92vh] overflow-y-auto"
        >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <div>
                <h3 id="share-title" className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                  <span className="text-lg" aria-hidden="true">📤</span>
                  <span>Transmettre ma feuille de pointage</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mois de {monthDisplay} • {agentName || 'Salarié(e)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                aria-label="Fermer"
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* COORDONNÉES DU RESPONSABLE (ENREGISTRÉES DANS LE COMPTE) */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-100 block">
                Destinataire (responsable, service RH...) :
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label htmlFor="share-phone" className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">
                    Numéro de téléphone (SMS / WhatsApp) :
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" aria-hidden="true" />
                    <input
                      id="share-phone"
                      type="tel"
                      placeholder="Ex: 06 12 34 56 78"
                      value={profile.managerPhone}
                      onChange={(e) => setProfile({ ...profile, managerPhone: e.target.value })}
                      onBlur={saveContacts}
                      className="w-full h-8 pl-8 pr-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="share-email" className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">
                    Adresse e-mail :
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" aria-hidden="true" />
                    <input
                      id="share-email"
                      type="email"
                      placeholder="Ex: rh@employeur.fr"
                      value={profile.managerEmail}
                      onChange={(e) => setProfile({ ...profile, managerEmail: e.target.value })}
                      onBlur={saveContacts}
                      className="w-full h-8 pl-8 pr-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                💡 Ces coordonnées sont enregistrées dans votre compte pour les prochains mois.
              </p>
            </div>

            {/* BOUTONS D'ENVOI DIRECT */}
            <div className="space-y-1.5">
              <span className="font-bold text-slate-800 dark:text-slate-100 block text-xs">Choisir le moyen d'envoi :</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="py-3 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs active:scale-95"
                >
                  <span className="text-lg leading-none">💬</span>
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendEmail}
                  className="py-3 px-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs active:scale-95"
                >
                  <Mail className="w-4 h-4" />
                  <span>Email</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendSMS}
                  className="py-3 px-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs active:scale-95"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>SMS</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyShareText}
                  className={`py-3 px-3 rounded-2xl font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs active:scale-95 ${
                    copiedShare
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white'
                  }`}
                >
                  {copiedShare ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedShare ? 'Copié !' : 'Copier tout'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="py-3 px-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs active:scale-95 col-span-2 sm:col-span-2"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Partager (Menu du téléphone)</span>
                </button>
              </div>
            </div>

            {/* APERÇU DU TEXTE PRÉPARÉ */}
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700 dark:text-slate-200">Aperçu du message transmis :</span>
                <button
                  type="button"
                  onClick={handleCopyShareText}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-semibold text-[11px] flex items-center space-x-1"
                >
                  {copiedShare ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedShare ? 'Copié dans le presse-papier !' : 'Copier'}</span>
                </button>
              </div>
              <textarea
                readOnly
                aria-label="Aperçu du message"
                value={generateShareMessage()}
                rows={9}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl font-mono text-[11px] text-slate-800 dark:text-slate-100 leading-relaxed resize-none focus:outline-hidden"
              />
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition"
              >
                Fermer
              </button>
            </div>
        </Modal>
      )}
    </>
  );
};
