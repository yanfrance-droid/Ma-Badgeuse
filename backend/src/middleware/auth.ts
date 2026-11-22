import { Request, Response, NextFunction } from 'express';
import { getMe } from '../services/authService';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.headers['x-auth-token'] as string);

    if (!token) {
      return res.status(401).json({ success: false, error: 'Non authentifié. Veuillez vous connecter.' });
    }

    const user = await getMe(token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Session expirée ou invalide. Veuillez vous reconnecter.' });
    }

    req.userId = user.id;
    req.user = user;
    next();
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Erreur authentification.' });
  }
}
