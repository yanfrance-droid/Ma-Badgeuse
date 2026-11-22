import { Router, Request, Response } from 'express';
import { getRecentAuditLogs, undoLastAction } from '../services/auditService';

export const auditRouter = Router();

/**
 * GET /api/audit
 * Liste les journaux d'audit récents
 */
auditRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const limit = Number(req.query.limit) || 50;
    const logs = await getRecentAuditLogs(userId, limit);
    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/audit/undo
 * Annuler la dernière action effectuée
 */
auditRouter.post('/undo', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const result = await undoLastAction(userId);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
