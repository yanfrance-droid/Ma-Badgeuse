import { Router } from 'express';
import { db } from '../database';
import { computeActualHours, computeDailyDelta, isUnworkedFutureEntry } from '../services/hoursService';
import { logAudit } from '../services/auditService';
import { assertMonthsOpen } from '../services/settingsService';
import {
  asyncHandler,
  badRequest,
  localToday,
  notFound,
  optionalNumber,
  optionalString,
  optionalTime,
  requireDate,
  requireInteger,
  requireNumber,
  requireOneOf,
  requireUserId,
  requireYearMonth
} from '../http';
import { ABSENCE_IMPACTS } from '../types';

export const entriesRouter = Router();

const ENRICHED_SELECT = `
  SELECT
    d.*,
    s.code AS status_code,
    s.label AS status_label,
    s.color_hex AS status_color,
    s.accounting_rule,
    p.label AS period_label
  FROM daily_entries d
  LEFT JOIN status_catalog s ON d.status_id = s.id
  LEFT JOIN periods p ON d.period_id = p.id
`;

/** Ajoute l'écart calculé à une ligne, de la même façon pour toutes les routes. */
function enrich(row: any, todayStr: string) {
  const { delta, positive, negative } = computeDailyDelta(row, isUnworkedFutureEntry(row, todayStr));
  return { ...row, delta_hours: delta, positive_delta: positive, negative_delta: negative };
}

/** GET /api/entries?month=AAAA-MM */
entriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const todayStr = localToday();
    const month = req.query.month === undefined ? todayStr.slice(0, 7) : requireYearMonth(req.query.month, 'Le mois');
    const rows = await db.all(
      `${ENRICHED_SELECT} WHERE d.user_id = ? AND d.entry_date >= ? AND d.entry_date <= ? ORDER BY d.entry_date ASC`,
      [userId, `${month}-01`, `${month}-31`]
    );
    res.json({ success: true, data: rows.map((r) => enrich(r, todayStr)) });
  })
);

/** GET /api/entries/:date */
entriesRouter.get(
  '/:date',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const date = requireDate(req.params.date, 'La date');
    const row = await db.get(`${ENRICHED_SELECT} WHERE d.user_id = ? AND d.entry_date = ?`, [userId, date]);
    res.json({ success: true, data: row ? enrich(row, localToday()) : null });
  })
);

/**
 * POST /api/entries
 * Enregistre ou met à jour la journée indiquée. Une saisie individuelle est
 * marquée is_override = 1 pour qu'une période posée ensuite ne l'écrase pas.
 */
entriesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const body = req.body || {};

    const entryDate = requireDate(body.entry_date, 'La date');
    const startTime = optionalTime(body.start_time, "L'heure d'arrivée");
    const endTime = optionalTime(body.end_time, "L'heure de départ");
    if ((startTime && !endTime) || (!startTime && endTime)) {
      throw badRequest("Indiquez à la fois l'heure d'arrivée et l'heure de départ.");
    }
    const breakMinutes = body.break_minutes === undefined || body.break_minutes === null || body.break_minutes === ''
      ? 0
      : requireInteger(body.break_minutes, 'La pause (en minutes)', 0, 360);
    const expectedHours = body.expected_hours === undefined || body.expected_hours === null || body.expected_hours === ''
      ? 0
      : requireNumber(body.expected_hours, 'Les heures prévues', 0, 24);
    const manualHours = optionalNumber(body.manual_actual_hours, 'Les heures faites', 0, 24);
    const notes = optionalString(body.notes, 'La note', 1000);
    const auditReason = optionalString(body.audit_reason, 'Le motif de modification', 200);

    let statusId: number | null = null;
    if (body.status_id !== undefined && body.status_id !== null && body.status_id !== '') {
      statusId = requireInteger(body.status_id, 'Le statut', 1, Number.MAX_SAFE_INTEGER);
      const status = await db.get(`SELECT id FROM status_catalog WHERE id = ?`, [statusId]);
      if (!status) throw badRequest("Le statut indiqué n'existe pas.");
    }
    const absenceReason = statusId ? optionalString(body.absence_reason, "Le motif d'absence", 40) : null;
    const absenceImpact = statusId && body.absence_impact
      ? requireOneOf(body.absence_impact, ABSENCE_IMPACTS, "L'impact de l'absence")
      : null;

    // Heures faites : saisie directe (absence, forçage) ou calcul à partir des horaires.
    let actualHours = 0;
    let manualOverride = 0;
    if (manualHours !== null) {
      actualHours = manualHours;
      manualOverride = 1;
    } else if (startTime && endTime) {
      actualHours = computeActualHours(startTime, endTime, breakMinutes);
    }

    const saved = await db.transaction(async () => {
      await assertMonthsOpen(userId, [entryDate]);
      const existing = await db.get<any>(`SELECT * FROM daily_entries WHERE user_id = ? AND entry_date = ?`, [userId, entryDate]);
      const values = [expectedHours, startTime, endTime, breakMinutes, actualHours, manualOverride, statusId, absenceReason, absenceImpact, notes];
      const newValues = {
        entry_date: entryDate,
        expected_hours: expectedHours,
        start_time: startTime,
        end_time: endTime,
        break_minutes: breakMinutes,
        actual_hours: actualHours,
        status_id: statusId,
        absence_reason: absenceReason,
        absence_impact: absenceImpact,
        notes
      };

      if (existing) {
        await db.run(
          `UPDATE daily_entries SET
             expected_hours = ?, start_time = ?, end_time = ?, break_minutes = ?, actual_hours = ?,
             manual_actual_override = ?, status_id = ?, absence_reason = ?, absence_impact = ?, notes = ?,
             is_override = 1, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ? AND id = ?`,
          [...values, userId, existing.id]
        );
        await logAudit(userId, 'daily_entries', existing.id, 'UPDATE', existing, newValues, auditReason || 'Modification du pointage');
        return existing.id as number;
      }

      const result = await db.run(
        `INSERT INTO daily_entries (
           expected_hours, start_time, end_time, break_minutes, actual_hours,
           manual_actual_override, status_id, absence_reason, absence_impact, notes, user_id, entry_date, is_override
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [...values, userId, entryDate]
      );
      await logAudit(userId, 'daily_entries', result.lastID, 'INSERT', null, newValues, auditReason || 'Création du pointage');
      return result.lastID;
    });

    const row = await db.get(`${ENRICHED_SELECT} WHERE d.user_id = ? AND d.id = ?`, [userId, saved]);
    res.json({ success: true, data: enrich(row, localToday()) });
  })
);

/** DELETE /api/entries/:date — supprime la journée (annulable). */
entriesRouter.delete(
  '/:date',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const date = requireDate(req.params.date, 'La date');
    await db.transaction(async () => {
      await assertMonthsOpen(userId, [date]);
      const existing = await db.get<any>(`SELECT * FROM daily_entries WHERE user_id = ? AND entry_date = ?`, [userId, date]);
      if (!existing) throw notFound('Aucune journée enregistrée à cette date.');
      await db.run(`DELETE FROM daily_entries WHERE user_id = ? AND id = ?`, [userId, existing.id]);
      await logAudit(userId, 'daily_entries', existing.id, 'DELETE', existing, null, 'Suppression du pointage');
    });
    res.json({ success: true, message: `Journée du ${date} supprimée.` });
  })
);
