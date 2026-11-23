import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../http';

/**
 * Réserve une route aux comptes administrateurs.
 * Remplace l'ancien code PIN partagé : le droit est porté par le compte connecté.
 * À placer après requireAuth.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.is_admin) {
    next(new HttpError(403, 'Accès refusé : cette opération est réservée aux administrateurs.'));
    return;
  }
  next();
}
