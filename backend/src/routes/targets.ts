import { Router, Request, Response } from 'express';
import { db } from '../database';
import { logAudit } from '../services/auditService';

export const targetsRouter = Router();

/**
 * GET /api/targets/:year_month?
 * Récupère l'objectif d'un mois ou la liste des objectifs
 */
targetsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const { year_month } = req.query;
    if (year_month) {
      const row = await db.get<any>(`SELECT * FROM monthly_targets WHERE user_id = ? AND year_month = ?`, [userId, year_month]);
      return res.json({ success: true, data: row || null });
    }
    const rows = await db.all<any>(`SELECT * FROM monthly_targets WHERE user_id = ? ORDER BY year_month DESC`, [userId]);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/targets
 * Définit ou ajuste l'objectif mensuel d'un mois
 */
targetsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const { year_month, target_hours, notes } = req.body;
    if (!year_month || target_hours === undefined) {
      return res.status(400).json({ success: false, error: "year_month et target_hours sont requis." });
    }

    const existing = await db.get<any>(`SELECT * FROM monthly_targets WHERE user_id = ? AND year_month = ?`, [userId, year_month]);

    if (existing) {
      await db.run(`
        UPDATE monthly_targets SET target_hours = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND id = ?
      `, [Number(target_hours), notes || null, userId, existing.id]);

      await logAudit(userId, 'monthly_targets', existing.id, 'UPDATE', existing, { year_month, target_hours, notes });
    } else {
      const result = await db.run(`
        INSERT INTO monthly_targets (user_id, year_month, target_hours, notes)
        VALUES (?, ?, ?, ?)
      `, [userId, year_month, Number(target_hours), notes || null]);

      await logAudit(userId, 'monthly_targets', result.lastID, 'INSERT', null, { year_month, target_hours, notes });
    }

    const saved = await db.get<any>(`SELECT * FROM monthly_targets WHERE user_id = ? AND year_month = ?`, [userId, year_month]);
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/targets/:year_month/validate
 * Marque un mois comme validé (RÉVERSIBLE)
 */
targetsRouter.post('/:year_month/validate', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const { year_month } = req.params;
    let target = await db.get<any>(`SELECT * FROM monthly_targets WHERE user_id = ? AND year_month = ?`, [userId, year_month]);

    if (!target) {
      // Créer avec objectif par défaut si inexistant
      const userDefSetting = await db.get<any>(`SELECT setting_value FROM user_settings WHERE user_id = ? AND setting_key = 'default_monthly_target'`, [userId]);
      const defaultHours = userDefSetting ? parseFloat(userDefSetting.setting_value) : 120;
      const resInsert = await db.run(`
        INSERT INTO monthly_targets (user_id, year_month, target_hours, is_validated, validated_at)
        VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
      `, [userId, year_month, defaultHours]);
      target = await db.get<any>(`SELECT * FROM monthly_targets WHERE user_id = ? AND id = ?`, [userId, resInsert.lastID]);
    } else {
      await db.run(`
        UPDATE monthly_targets SET is_validated = 1, validated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ?
      `, [userId, target.id]);
    }

    await logAudit(userId, 'monthly_targets', target.id, 'UPDATE', { is_validated: 0 }, { is_validated: 1 }, `Validation du mois ${year_month}`);
    res.json({ success: true, message: `Mois ${year_month} validé (réversible à tout moment).`, data: target });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/targets/:year_month/unvalidate
 * Dé-valide un mois pour permettre toute correction en toute transparence
 */
targetsRouter.post('/:year_month/unvalidate', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const { year_month } = req.params;
    const target = await db.get<any>(`SELECT * FROM monthly_targets WHERE user_id = ? AND year_month = ?`, [userId, year_month]);
    if (!target) {
      return res.status(404).json({ success: false, error: "Mois introuvable." });
    }

    await db.run(`
      UPDATE monthly_targets SET is_validated = 0, validated_at = NULL WHERE user_id = ? AND id = ?
    `, [userId, target.id]);

    await logAudit(userId, 'monthly_targets', target.id, 'UPDATE', { is_validated: 1 }, { is_validated: 0 }, `Réouverture du mois ${year_month}`);
    res.json({ success: true, message: `Mois ${year_month} réouvert aux modifications sans blocage.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
