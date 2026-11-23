import React, { useEffect, useRef } from 'react';

interface Props {
  onClose: () => void;
  /** id du titre de la fenêtre, lu par les lecteurs d'écran. */
  labelledBy: string;
  className: string;
  children: React.ReactNode;
  /** 'bottom' : panneau qui monte du bas de l'écran (menus sur téléphone). */
  placement?: 'center' | 'bottom';
}

/**
 * Fenêtre modale accessible : rôle dialog, fermeture avec Échap,
 * focus placé dans la fenêtre puis rendu à l'élément d'origine.
 */
export const Modal: React.FC<Props> = ({ onClose, labelledBy, className, children, placement = 'center' }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/70 backdrop-blur-xs no-print ${
        placement === 'bottom' ? 'items-end' : 'items-center p-3'
      }`}
      onClick={(e) => {
        // Menus du bas : toucher le fond sombre les ferme. Les formulaires ne se ferment
        // pas ainsi, pour ne pas perdre une saisie par un toucher maladroit.
        if (placement === 'bottom' && e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className={`${className} focus:outline-none`}>
        {children}
      </div>
    </div>
  );
};
