import { Router, Request, Response } from 'express';
import { db } from '../database';

export const settingsRouter = Router();

/**
 * GET /api/settings
 * Récupère tous les paramètres de configuration
 */
settingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const rows = await db.all<any>(`SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?`, [userId]);
    const settings: Record<string, string> = {
      habitual_start_time: '10:45',
      habitual_end_time: '14:45',
      habitual_break_minutes: '0',
      habitual_expected_hours: '4.0',
      default_monthly_target: '120',
      annual_target_hours: '800'
    };
    for (const r of rows) {
      settings[r.setting_key] = r.setting_value;
    }
    res.json({ success: true, data: settings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/settings
 * Enregistre ou met à jour des paramètres
 */
settingsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const updates = req.body;
    if (typeof updates !== 'object' || updates === null) {
      return res.status(400).json({ success: false, error: 'Données invalides.' });
    }

    for (const [key, value] of Object.entries(updates)) {
      await db.run(
        `INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at) 
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id, setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`,
        [userId, key, String(value)]
      );
    }

    const rows = await db.all<any>(`SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?`, [userId]);
    const settings: Record<string, string> = {};
    for (const r of rows) {
      settings[r.setting_key] = r.setting_value;
    }
    res.json({ success: true, data: settings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
