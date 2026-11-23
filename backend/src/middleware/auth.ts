import { Request, Response, NextFunction } from 'express';
import { getUserFromSession } from '../services/authService';
import { readSessionToken } from '../security';
import { HttpError } from '../http';

/** Charge l'utilisateur de la session si elle existe, sans rien imposer. */
export async function loadSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await getUserFromSession(readSessionToken(req));
    if (user) {
      req.user = user;
      req.userId = user.id;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Exige une session valide. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new HttpError(401, 'Session expirée ou absente. Veuillez vous connecter.', 'UNAUTHENTICATED'));
    return;
  }
  next();
}

/**
 * Bloque l'accès aux données tant qu'un changement de mot de passe est exigé
 * (mot de passe temporaire donné par l'administrateur, ou mot de passe trop court).
 */
export function requirePasswordUpToDate(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.must_change_password) {
    next(new HttpError(403, 'Vous devez changer votre mot de passe avant de continuer.', 'PASSWORD_CHANGE_REQUIRED'));
    return;
  }
  next();
}
