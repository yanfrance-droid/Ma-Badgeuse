import { Router } from 'express';
import { asyncHandler, HttpError, requireUserId } from '../http';
import { requireAuth } from '../middleware/auth';
import {
  authenticate,
  changePassword,
  countUsers,
  createSession,
  createUser,
  deleteSession,
  isRegistrationOpen,
  revokeSessions
} from '../services/authService';
import {
  accountLimiter,
  clearSessionCookie,
  clientIp,
  ipLimiter,
  readSessionToken,
  registrationLimiter,
  setSessionCookie
} from '../security';
import { PASSWORD_MIN_LENGTH } from '../defaults';

export const authRouter = Router();

/**
 * GET /api/auth/setup-status
 * Indique à l'écran de connexion s'il faut créer le premier compte
 * et si l'inscription libre est ouverte.
 */
authRouter.get(
  '/setup-status',
  asyncHandler(async (_req, res) => {
    const needsSetup = (await countUsers()) === 0;
    res.json({
      success: true,
      data: {
        needs_setup: needsSetup,
        registration_open: needsSetup || (await isRegistrationOpen()),
        password_min_length: PASSWORD_MIN_LENGTH
      }
    });
  })
);

/**
 * POST /api/auth/register
 * Possible uniquement pour créer le premier compte (qui devient administrateur)
 * ou quand l'administrateur a ouvert l'inscription.
 */
authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const ip = clientIp(req);
    registrationLimiter.check(ip);
    const needsSetup = (await countUsers()) === 0;
    if (!needsSetup && !(await isRegistrationOpen())) {
      throw new HttpError(403, "L'inscription est fermée. Demandez à l'administrateur de créer votre compte.");
    }
    const user = await createUser({
      username: req.body?.username,
      displayName: req.body?.displayName,
      password: req.body?.password
    });
    registrationLimiter.fail(ip);
    const token = await createSession(user.id);
    setSessionCookie(req, res, token);
    res.status(201).json({ success: true, data: { user } });
  })
);

/** POST /api/auth/login */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const ip = clientIp(req);
    const accountKey = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase().slice(0, 100) : '';
    ipLimiter.check(ip);
    accountLimiter.check(accountKey);
    try {
      const user = await authenticate(req.body?.username, req.body?.password);
      accountLimiter.reset(accountKey);
      const token = await createSession(user.id);
      setSessionCookie(req, res, token);
      res.json({ success: true, data: { user } });
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
        ipLimiter.fail(ip);
        accountLimiter.fail(accountKey);
      }
      throw err;
    }
  })
);

/** GET /api/auth/me — renvoie l'utilisateur connecté, ou null. */
authRouter.get('/me', (req, res) => {
  res.json({ success: true, data: req.user || null });
});

/** POST /api/auth/logout */
authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await deleteSession(readSessionToken(req));
    clearSessionCookie(req, res);
    res.json({ success: true, message: 'Déconnecté.' });
  })
);

/**
 * POST /api/auth/change-password
 * Change le mot de passe du compte connecté et déconnecte ses autres appareils.
 */
authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const key = `change-password:${userId}`;
    accountLimiter.check(key);
    try {
      await changePassword(userId, req.body?.currentPassword, req.body?.newPassword);
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) accountLimiter.fail(key);
      throw err;
    }
    accountLimiter.reset(key);
    await revokeSessions(userId, readSessionToken(req));
    res.json({ success: true, message: 'Mot de passe modifié. Vos autres appareils ont été déconnectés.' });
  })
);
