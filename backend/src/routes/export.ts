import { Router } from 'express';
import { db } from '../database';
import { computeDailyDelta, getCurrentSchoolYearStart, isUnworkedFutureEntry } from '../services/hoursService';
import { asyncHandler, localToday, requireInteger, requireUserId, requireYearMonth } from '../http';

export const exportRouter = Router();

/** Échappe une valeur pour un CSV au format Excel français (séparateur « ; »). */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? String(value).replace('.', ',') : String(value);
  // Empêche l'interprétation d'une formule par le tableur.
  if (/^[=+\-@\t\r]/.test(text) && typeof value !== 'number') text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * GET /api/export/entries.csv?month=AAAA-MM  ou  ?start_year=AAAA (année scolaire)
 * Export des journées pour un tableur.
 */
exportRouter.get(
  '/entries.csv',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    let from: string;
    let to: string;
    let label: string;
    if (req.query.month !== undefined) {
      const month = requireYearMonth(req.query.month, 'Le mois');
      from = `${month}-01`;
      to = `${month}-31`;
      label = month;
    } else {
      const startYear = req.query.start_year === undefined
        ? getCurrentSchoolYearStart(new Date())
        : requireInteger(req.query.start_year, "L'année scolaire", 2000, 2100);
      from = `${startYear}-09-01`;
      to = `${startYear + 1}-08-31`;
      label = `${startYear}-${startYear + 1}`;
    }

    const rows = await db.all<any>(
      `SELECT d.*, s.label AS status_label, s.accounting_rule
       FROM daily_entries d LEFT JOIN status_catalog s ON d.status_id = s.id
       WHERE d.user_id = ? AND d.entry_date >= ? AND d.entry_date <= ?
       ORDER BY d.entry_date ASC`,
      [userId, from, to]
    );
    const today = localToday();
    const header = ['Date', 'Arrivée', 'Départ', 'Pause (min)', 'Heures prévues', 'Heures faites', 'Écart', 'Statut', 'Note'];
    const lines = [header.join(';')];
    for (const r of rows) {
      const { delta } = computeDailyDelta(r, isUnworkedFutureEntry(r, today));
      lines.push(
        [r.entry_date, r.start_time, r.end_time, r.break_minutes, r.expected_hours, r.actual_hours, delta, r.status_label, r.notes]
          .map(csvCell)
          .join(';')
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ma_badgeuse_${label}.csv"`);
    // BOM UTF-8 pour qu'Excel affiche correctement les accents.
    res.send(`﻿${lines.join('\r\n')}\r\n`);
  })
);
