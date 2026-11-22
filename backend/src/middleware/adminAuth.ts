import { Request, Response, NextFunction } from 'express';
import { verifyAdminPin } from '../services/authService';

/**
 * Middleware vérifiant que la requête contient un code PIN administrateur valide.
 * Le code PIN peut être transmis via :
 * - Le header HTTP : 'x-admin-pin'
 * - Le corps de la requête : req.body.adminPin
 * - Le paramètre de requête : req.query.adminPin
 */
export async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const pin = (req.headers['x-admin-pin'] as string) || (req.body?.adminPin as string) || (req.query?.adminPin as string);

    if (!pin) {
      return res.status(403).json({
        success: false,
        error: "Accès refusé : Cette opération nécessite les droits d'administrateur (Code PIN manquant)."
      });
    }

    const isValid = await verifyAdminPin(pin);
    if (!isValid) {
      return res.status(403).json({
        success: false,
        error: "Accès refusé : Code PIN administrateur incorrect."
      });
    }

    next();
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Erreur vérification administrateur.' });
  }
}
