import { Router } from 'express';
import { getRecentAuditLogs, undoLastAction } from '../services/auditService';
import { asyncHandler, requireInteger, requireUserId } from '../http';

export const auditRouter = Router();

/** GET /api/audit?limit=50 — historique des modifications du compte (1 à 200 lignes). */
auditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const limit = req.query.limit === undefined ? 50 : requireInteger(req.query.limit, 'La limite', 1, 200);
    res.json({ success: true, data: await getRecentAuditLogs(userId, limit) });
  })
);

/** POST /api/audit/undo — annule la dernière action réversible. */
auditRouter.post(
  '/undo',
  asyncHandler(async (req, res) => {
    const result = await undoLastAction(requireUserId(req));
    res.status(result.success ? 200 : 409).json(result);
  })
);
