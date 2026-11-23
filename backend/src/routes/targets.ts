import { Router } from 'express';
import { db } from '../database';
import { logAudit } from '../services/auditService';
import { getUserNumberSetting } from '../services/settingsService';
import { asyncHandler, conflict, notFound, optionalString, requireNumber, requireUserId, requireYearMonth } from '../http';

export const targetsRouter = Router();

const MAX_MONTH_HOURS = 744; // 31 jours × 24 h

/** GET /api/targets?year_month=AAAA-MM */
targetsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    if (req.query.year_month !== undefined) {
      const ym = requireYearMonth(req.query.year_month, 'Le mois');
      const row = await db.get(`SELECT * FROM monthly_targets WHERE user_id = ? AND year_month = ?`, [userId, ym]);
      res.json({ success: true, data: row || null });
      return;
    }
    const rows = await db.all(`SELECT * FROM monthly_targets WHERE user_id = ? ORDER BY year_month DESC`, [userId]);
    res.json({ success: true, data: rows });
  })
);

/** POST /api/targets — définit l'objectif d'heures d'un mois. */
targetsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const ym = requireYearMonth(req.body?.year_month, 'Le mois');
    const targetHours = requireNumber(req.body?.target_hours, "L'objectif d'heures", 0, MAX_MONTH_HOURS);
    const notes = optionalString(req.body?.notes, 'La note', 500);

    const saved = await db.transaction(async () => {
      const existing = await db.get<any>(`SELECT * FROM monthly_targets WHERE user_id = ? AND year_month = ?`, [userId, ym]);
      if (existing?.is_validated) {
        throw conflict(`Le mois ${ym} est validé. Rouvrez-le avant de modifier son objectif.`);
      }
      if (existing) {
        await db.run(`UPDATE monthly_targets SET target_hours = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
          targetHours,
          notes,
          existing.id
        ]);
        await logAudit(userId, 'monthly_targets', existing.id, 'UPDATE', existing, { year_month: ym, target_hours: targetHours, notes }, `Objectif de ${ym}`);
      } else {
        const result = await db.run(`INSERT INTO monthly_targets (user_id, year_month, target_hours, notes) VALUES (?, ?, ?, ?)`, [
          userId,
          ym,
          targetHours,
          notes
        ]);
        await logAudit(userId, 'monthly_targets', result.lastID, 'INSERT', null, { year_month: ym, target_hours: targetHours, notes }, `Objectif de ${ym}`);
      }
      return db.get(`SELECT * FROM monthly_targets WHERE user_id = ? AND year_month = ?`, [userId, ym]);
    });
    res.json({ success: true, data: saved });
  })
);

/**
 * POST /api/targets/:year_month/validate
 * Valide le mois : plus aucune saisie, période ou régularisation ne peut le
 * modifier tant qu'il n'est pas rouvert.
 */
targetsRouter.post(
  '/:year_month/validate',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const ym = requireYearMonth(req.params.year_month, 'Le mois');
    const saved = await db.transaction(async () => {
      const existing = await db.get<any>(`SELECT * FROM monthly_targets WHERE user_id = ? AND year_month = ?`, [userId, ym]);
      if (existing?.is_validated) {
        return existing;
      }
      if (existing) {
        await db.run(`UPDATE monthly_targets SET is_validated = 1, validated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [existing.id]);
        await logAudit(userId, 'monthly_targets', existing.id, 'UPDATE', existing, { year_month: ym, is_validated: 1 }, `Validation du mois ${ym}`);
        return db.get(`SELECT * FROM monthly_targets WHERE id = ?`, [existing.id]);
      }
      const defaultHours = await getUserNumberSetting(userId, 'default_monthly_target');
      const result = await db.run(
        `INSERT INTO monthly_targets (user_id, year_month, target_hours, is_validated, validated_at) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)`,
        [userId, ym, defaultHours]
      );
      await logAudit(userId, 'monthly_targets', result.lastID, 'INSERT', null, { year_month: ym, target_hours: defaultHours, is_validated: 1 }, `Validation du mois ${ym}`);
      return db.get(`SELECT * FROM monthly_targets WHERE id = ?`, [result.lastID]);
    });
    res.json({ success: true, message: `Mois ${ym} validé et verrouillé.`, data: saved });
  })
);

/** POST /api/targets/:year_month/unvalidate — rouvre le mois aux modifications. */
targetsRouter.post(
  '/:year_month/unvalidate',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const ym = requireYearMonth(req.params.year_month, 'Le mois');
    const saved = await db.transaction(async () => {
      const existing = await db.get<any>(`SELECT * FROM monthly_targets WHERE user_id = ? AND year_month = ?`, [userId, ym]);
      if (!existing) throw notFound('Ce mois n’a jamais été validé.');
      if (!existing.is_validated) return existing;
      await db.run(`UPDATE monthly_targets SET is_validated = 0, validated_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [existing.id]);
      await logAudit(userId, 'monthly_targets', existing.id, 'UPDATE', existing, { year_month: ym, is_validated: 0 }, `Réouverture du mois ${ym}`);
      return db.get(`SELECT * FROM monthly_targets WHERE id = ?`, [existing.id]);
    });
    res.json({ success: true, message: `Mois ${ym} rouvert aux modifications.`, data: saved });
  })
);
