import { Router } from 'express';
import { asyncHandler, badRequest, requireId, requireUserId } from '../http';
import {
  createUser,
  deleteUser,
  isRegistrationOpen,
  listUsers,
  resetUserPassword,
  setRegistrationOpen,
  setUserAdmin
} from '../services/authService';

/** Routes d'administration des comptes. Montées derrière requireAuth + requireAdmin. */
export const adminRouter = Router();

adminRouter.get(
  '/users',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await listUsers() });
  })
);

/** Crée un compte pour un membre de la famille, avec un mot de passe à changer à la première connexion. */
adminRouter.post(
  '/users',
  asyncHandler(async (req, res) => {
    const user = await createUser({
      username: req.body?.username,
      displayName: req.body?.displayName,
      password: req.body?.password,
      mustChangePassword: true
    });
    res.status(201).json({ success: true, data: user });
  })
);

/** Génère un mot de passe temporaire (remplace l'ancienne question secrète). */
adminRouter.post(
  '/users/:id/reset-password',
  asyncHandler(async (req, res) => {
    const result = await resetUserPassword(requireId(req.params.id));
    res.json({ success: true, data: { user: result.user, temporary_password: result.temporaryPassword } });
  })
);

adminRouter.put(
  '/users/:id/admin',
  asyncHandler(async (req, res) => {
    if (typeof req.body?.is_admin !== 'boolean') {
      throw badRequest('is_admin doit valoir true ou false.');
    }
    const user = await setUserAdmin(requireUserId(req), requireId(req.params.id), req.body.is_admin);
    res.json({ success: true, data: user });
  })
);

adminRouter.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    await deleteUser(requireUserId(req), requireId(req.params.id));
    res.json({ success: true, message: 'Compte et données associées supprimés.' });
  })
);

adminRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: { registration_open: await isRegistrationOpen() } });
  })
);

adminRouter.put(
  '/settings',
  asyncHandler(async (req, res) => {
    if (typeof req.body?.registration_open !== 'boolean') {
      throw badRequest('registration_open doit valoir true ou false.');
    }
    await setRegistrationOpen(req.body.registration_open);
    res.json({ success: true, data: { registration_open: req.body.registration_open } });
  })
);
