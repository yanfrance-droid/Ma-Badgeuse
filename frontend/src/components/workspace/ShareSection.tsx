import React from 'react';
import { Check, Copy, Mail, MessageSquare, Printer, Share2 } from 'lucide-react';
import type { WorkspaceModel } from '../../hooks/useWorkspace';

/** Encart « Transmettre ma feuille de pointage ». */
export const ShareSection: React.FC<{ app: WorkspaceModel }> = ({ app }) => {
  const {
    setShowShareModal,
    copiedShare,
    handlePrintMonthly,
    monthDisplay,
    handleCopyShareText,
    handleSendWhatsApp,
    handleSendEmail,
    handleSendSMS
  } = app;

  return (
    <>
      {/* ========================================================= */}
      {/* BLOC 5 : TRANSMETTRE & EXPORTER MA FEUILLE DE POINTAGE     */}
      {/* ========================================================= */}
      <section className="bg-gradient-to-br from-[#0D2B52] to-indigo-950 text-white rounded-3xl p-4.5 shadow-md border border-blue-900/40 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-sm font-black tracking-tight flex items-center space-x-2">
              <span className="text-base">📤</span>
              <span>Transmettre ma feuille de pointage</span>
            </h2>
            <p className="text-[11px] text-blue-200">
              Envoyez votre récapitulatif de {monthDisplay} à votre responsable.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center space-x-1.5 border border-white/20 active:scale-95"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Options</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            onClick={handleSendWhatsApp}
            className="py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex flex-col items-center justify-center space-y-1 transition active:scale-95 shadow-xs"
            title="Envoyer le pointage directement par WhatsApp"
          >
            <span className="text-base">💬</span>
            <span>WhatsApp</span>
          </button>

          <button
            onClick={handleSendEmail}
            className="py-2.5 px-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex flex-col items-center justify-center space-y-1 transition active:scale-95 shadow-xs"
            title="Préparer un e-mail officiel complet"
          >
            <Mail className="w-4 h-4" />
            <span>Par Email</span>
          </button>

          <button
            onClick={handleSendSMS}
            className="py-2.5 px-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex flex-col items-center justify-center space-y-1 transition active:scale-95 shadow-xs"
            title="Envoyer un résumé par SMS"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Par SMS</span>
          </button>

          <button
            onClick={handleCopyShareText}
            className={`py-2.5 px-3 rounded-2xl font-bold text-xs flex flex-col items-center justify-center space-y-1 transition active:scale-95 shadow-xs ${
              copiedShare
                ? 'bg-emerald-500 text-white'
                : 'bg-white/15 hover:bg-white/25 text-white border border-white/20'
            }`}
            title="Copier tout le texte pour le coller où vous voulez"
          >
            {copiedShare ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
            <span>{copiedShare ? 'Copié !' : 'Copier'}</span>
          </button>
        </div>

        <div className="pt-1 flex items-center justify-between text-[11px] text-blue-200/90 border-t border-white/10">
          <span>📋 Récapitulatif du mois</span>
          <button
            type="button"
            onClick={handlePrintMonthly}
            className="text-white hover:underline flex items-center space-x-1 font-bold"
          >
            <Printer className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />
            <span>Imprimer le relevé du mois</span>
          </button>
        </div>
      </section>
    </>
  );
};
