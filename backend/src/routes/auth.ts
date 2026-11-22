import { Router, Request, Response } from 'express';
import { adminMiddleware } from '../middleware/adminAuth';
import {
  register,
  login,
  getMe,
  logout,
  getSecurityQuestion,
  resetPassword,
  listAllUsers,
  verifyAdminPin,
  changeAdminPin,
  deleteUserByAdmin
} from '../services/authService';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const result = await register(req.body);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const result = await login(req.body);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

authRouter.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.headers['x-auth-token'] as string);
    if (!token) {
      return res.json({ success: true, data: null });
    }
    const user = await getMe(token);
    res.json({ success: true, data: user });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.headers['x-auth-token'] as string);
    if (token) {
      await logout(token);
    }
    res.json({ success: true, message: 'Déconnecté avec succès.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

authRouter.get('/security-question', async (req: Request, res: Response) => {
  try {
    const username = req.query.username as string;
    if (!username) {
      return res.status(400).json({ success: false, error: "Identifiant requis." });
    }
    const result = await getSecurityQuestion(username);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

authRouter.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const result = await resetPassword(req.body);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

authRouter.get('/users', adminMiddleware, async (_req: Request, res: Response) => {
  try {
    const users = await listAllUsers();
    res.json({ success: true, data: users });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

authRouter.post('/verify-admin-pin', async (req: Request, res: Response) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, error: 'Code PIN requis.' });
    }
    const isValid = await verifyAdminPin(pin);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Code PIN administrateur incorrect.' });
    }
    res.json({ success: true, message: 'Mode administrateur déverrouillé.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

authRouter.post('/change-admin-pin', async (req: Request, res: Response) => {
  try {
    const { oldPin, newPin } = req.body;
    await changeAdminPin(oldPin, newPin);
    res.json({ success: true, message: 'Code PIN administrateur modifié avec succès.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

authRouter.delete('/users/:id', adminMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    await deleteUserByAdmin(id);
    res.json({ success: true, message: 'Compte utilisateur et données associés supprimés avec succès.' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});
