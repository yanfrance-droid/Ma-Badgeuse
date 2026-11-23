import { Router } from 'express';
import { db } from '../database';
import { logAudit } from '../services/auditService';
import { assertMonthsOpen } from '../services/settingsService';
import {
  asyncHandler,
  badRequest,
  conflict,
  isValidColor,
  notFound,
  optionalString,
  requireDate,
  requireId,
  requireInteger,
  requireNumber,
  requireOneOf,
  requireString,
  requireUserId
} from '../http';
import { ABSENCE_IMPACTS } from '../types';

export const periodsRouter = Router();

const MAX_PERIOD_DAYS = 366;

/** Liste des dates entre deux bornes incluses, en excluant éventuellement les week-ends. */
function listDates(startDate: string, endDate: string, skipWeekends: boolean): string[] {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const dates: string[] = [];
  while (cur <= end) {
    const day = cur.getDay();
    if (!(skipWeekends && (day === 0 || day === 6))) {
      dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function parseRange(body: any): { startDate: string; endDate: string } {
  const startDate = requireDate(body?.start_date, 'La date de début');
  const endDate = requireDate(body?.end_date, 'La date de fin');
  if (startDate > endDate) {
    throw badRequest('La date de début ne peut pas être postérieure à la date de fin.');
  }
  const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1;
  if (days > MAX_PERIOD_DAYS) {
    throw badRequest(`Une période ne peut pas dépasser ${MAX_PERIOD_DAYS} jours.`);
  }
  return { startDate, endDate };
}

/** GET /api/periods */
periodsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const rows = await db.all(
      `SELECT p.*, s.label AS status_label, s.color_hex AS status_color,
              (SELECT COUNT(*) FROM daily_entries d WHERE d.period_id = p.id AND d.user_id = p.user_id) AS days_count
       FROM periods p
       LEFT JOIN status_catalog s ON p.status_id = s.id
       WHERE p.user_id = ?
       ORDER BY p.start_date DESC`,
      [userId]
    );
    res.json({ success: true, data: rows });
  })
);

/**
 * POST /api/periods/check-conflicts
 * Journées saisies individuellement dans l'intervalle (elles seront préservées)
 * et périodes existantes qui chevauchent l'intervalle (refusées à la création).
 */
periodsRouter.post(
  '/check-conflicts',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const { startDate, endDate } = parseRange(req.body);
    const overriddenDays = await db.all(
      `SELECT d.entry_date, d.expected_hours, d.actual_hours, s.label AS status_label
       FROM daily_entries d
       LEFT JOIN status_catalog s ON d.status_id = s.id
       WHERE d.user_id = ? AND d.entry_date >= ? AND d.entry_date <= ? AND d.is_override = 1
       ORDER BY d.entry_date ASC`,
      [userId, startDate, endDate]
    );
    const overlappingPeriods = await db.all(
      `SELECT id, label, start_date, end_date FROM periods
       WHERE user_id = ? AND start_date <= ? AND end_date >= ? ORDER BY start_date`,
      [userId, endDate, startDate]
    );
    res.json({
      success: true,
      has_conflicts: overriddenDays.length > 0 || overlappingPeriods.length > 0,
      conflicted_days: overriddenDays,
      overlapping_periods: overlappingPeriods
    });
  })
);

/**
 * POST /api/periods
 * Crée une période et l'applique aux jours de l'intervalle. Les journées saisies
 * individuellement sont préservées (preserve_overrides, activé par défaut).
 */
periodsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const body = req.body || {};
    const label = requireString(body.label, 'Le libellé', 100);
    const { startDate, endDate } = parseRange(body);
    const notes = optionalString(body.notes, 'La note', 500);
    const preserveOverrides = body.preserve_overrides !== false;
    const skipWeekends = body.skip_weekends !== false;
    const expectedPerDay = body.expected_hours_per_day === undefined ? 0 : requireNumber(body.expected_hours_per_day, 'Les heures prévues par jour', 0, 24);
    const actualPerDay = body.actual_hours_per_day === undefined ? 0 : requireNumber(body.actual_hours_per_day, 'Les heures comptées par jour', 0, 24);
    const absenceReason = optionalString(body.absence_reason, "Le motif d'absence", 40);
    const absenceImpact = body.absence_impact ? requireOneOf(body.absence_impact, ABSENCE_IMPACTS, "L'impact de l'absence") : null;

    let colorHex: string | null = null;
    if (body.color_hex !== undefined && body.color_hex !== null && body.color_hex !== '') {
      if (!isValidColor(body.color_hex)) throw badRequest('La couleur doit être au format #RRGGBB.');
      colorHex = body.color_hex;
    }
    let statusId: number | null = null;
    if (body.status_id !== undefined && body.status_id !== null && body.status_id !== '') {
      statusId = requireInteger(body.status_id, 'Le statut', 1, Number.MAX_SAFE_INTEGER);
      if (!(await db.get(`SELECT id FROM status_catalog WHERE id = ?`, [statusId]))) {
        throw badRequest("Le statut indiqué n'existe pas.");
      }
    }

    const dates = listDates(startDate, endDate, skipWeekends);
    if (dates.length === 0) {
      throw badRequest('Aucun jour ouvré dans cet intervalle.');
    }
    const dayNotes = notes || label;

    const result = await db.transaction(async () => {
      await assertMonthsOpen(userId, dates);
      const overlapping = await db.get<any>(
        `SELECT label, start_date, end_date FROM periods WHERE user_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1`,
        [userId, endDate, startDate]
      );
      if (overlapping) {
        throw conflict(
          `Cette période chevauche « ${overlapping.label} » (${overlapping.start_date} → ${overlapping.end_date}). Supprimez-la d'abord ou choisissez d'autres dates.`
        );
      }

      const inserted = await db.run(
        `INSERT INTO periods (user_id, label, start_date, end_date, status_id, color_hex, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, label, startDate, endDate, statusId, colorHex, notes]
      );
      const periodId = inserted.lastID;
      const previousEntries: any[] = [];
      const appliedDates: string[] = [];

      for (const day of dates) {
        const existing = await db.get<any>(`SELECT * FROM daily_entries WHERE user_id = ? AND entry_date = ?`, [userId, day]);
        if (existing) {
          if (preserveOverrides && existing.is_override === 1) continue;
          previousEntries.push({ ...existing });
          await db.run(
            `UPDATE daily_entries SET expected_hours = ?, actual_hours = ?, period_id = ?, status_id = COALESCE(?, status_id),
               absence_reason = ?, absence_impact = ?, notes = COALESCE(notes, ?), updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ? AND id = ?`,
            [expectedPerDay, actualPerDay, periodId, statusId, absenceReason, absenceImpact, dayNotes, userId, existing.id]
          );
        } else {
          await db.run(
            `INSERT INTO daily_entries (user_id, entry_date, expected_hours, actual_hours, status_id, period_id, is_override, absence_reason, absence_impact, notes)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
            [userId, day, expectedPerDay, actualPerDay, statusId, periodId, absenceReason, absenceImpact, dayNotes]
          );
        }
        appliedDates.push(day);
      }

      await logAudit(
        userId,
        'periods',
        periodId,
        'INSERT',
        { previousEntries },
        { label, start_date: startDate, end_date: endDate, status_id: statusId, applied_dates: appliedDates },
        `Création de la période « ${label} » (${appliedDates.length} jour(s))`
      );
      return { periodId, appliedCount: appliedDates.length };
    });

    res.status(201).json({
      success: true,
      data: {
        id: result.periodId,
        label,
        start_date: startDate,
        end_date: endDate,
        days_covered: dates.length,
        days_modified: result.appliedCount
      }
    });
  })
);

/**
 * DELETE /api/periods/:id
 * Supprime la période. Les journées qu'elle avait créées sont conservées
 * (seul leur lien vers la période est retiré) ; l'action est annulable.
 */
periodsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const id = requireId(req.params.id);
    await db.transaction(async () => {
      const existing = await db.get<any>(`SELECT * FROM periods WHERE user_id = ? AND id = ?`, [userId, id]);
      if (!existing) throw notFound('Période introuvable.');
      const detached = await db.all<{ id: number }>(`SELECT id FROM daily_entries WHERE user_id = ? AND period_id = ?`, [userId, id]);
      await db.run(`UPDATE daily_entries SET period_id = NULL WHERE user_id = ? AND period_id = ?`, [userId, id]);
      await db.run(`DELETE FROM periods WHERE user_id = ? AND id = ?`, [userId, id]);
      await logAudit(
        userId,
        'periods',
        id,
        'DELETE',
        { ...existing, detached_entry_ids: detached.map((d) => d.id) },
        null,
        `Suppression de la période « ${existing.label} »`
      );
    });
    res.json({ success: true, message: 'Période supprimée. Les journées concernées restent enregistrées.' });
  })
);
