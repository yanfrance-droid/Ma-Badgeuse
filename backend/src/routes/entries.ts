import { Router, Request, Response } from 'express';
import { db } from '../database';
import { computeActualHours, computeDailyDelta } from '../services/hoursService';
import { logAudit } from '../services/auditService';

export const entriesRouter = Router();

/**
 * GET /api/entries?month=YYYY-MM
 * Récupère toutes les entrées d'un mois avec statuts joints et calculs d'écarts
 */
entriesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;
    const defaultMonth = `${y}-${m}`;
    const month = (req.query.month as string) || defaultMonth;

    const rows = await db.all<any>(`
      SELECT 
        d.*,
        s.code as status_code,
        s.label as status_label,
        s.color_hex as status_color,
        s.accounting_rule,
        p.label as period_label
      FROM daily_entries d
      LEFT JOIN status_catalog s ON d.status_id = s.id
      LEFT JOIN periods p ON d.period_id = p.id
      WHERE d.user_id = ? AND d.entry_date LIKE ?
      ORDER BY d.entry_date ASC
    `, [userId, `${month}%`]);

    // Compléter chaque ligne avec les calculs d'écart
    const enriched = rows.map((r) => {
      const isUnworkedFuture = Boolean(r.entry_date && r.entry_date > todayStr && Number(r.actual_hours || 0) === 0 && !r.status_id);
      const { delta, positive, negative } = computeDailyDelta(r, isUnworkedFuture);
      return {
        ...r,
        delta_hours: delta,
        positive_delta: positive,
        negative_delta: negative
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/entries/:date
 * Récupère une entrée journalière précise
 */
entriesRouter.get('/:date', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const { date } = req.params;
    const row = await db.get<any>(`
      SELECT 
        d.*,
        s.code as status_code,
        s.label as status_label,
        s.color_hex as status_color,
        s.accounting_rule,
        p.label as period_label
      FROM daily_entries d
      LEFT JOIN status_catalog s ON d.status_id = s.id
      LEFT JOIN periods p ON d.period_id = p.id
      WHERE d.user_id = ? AND d.entry_date = ?
    `, [userId, date]);

    if (!row) {
      return res.json({ success: true, data: null });
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isUnworkedFuture = Boolean(row.entry_date && row.entry_date > todayStr && Number(row.actual_hours || 0) === 0 && !row.status_id);

    const { delta, positive, negative } = computeDailyDelta(row, isUnworkedFuture);
    res.json({
      success: true,
      data: {
        ...row,
        delta_hours: delta,
        positive_delta: positive,
        negative_delta: negative
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/entries
 * Enregistre ou met à jour une entrée journalière avec audit et recalcul
 */
entriesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const {
      entry_date,
      expected_hours = 0,
      start_time = null,
      end_time = null,
      break_minutes = 0,
      manual_actual_hours = null,
      status_id = null,
      notes = null,
      audit_reason = null
    } = req.body;

    if (!entry_date || !/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) {
      return res.status(400).json({ success: false, error: "La date (entry_date) est invalide (format YYYY-MM-DD requis)." });
    }
    if (start_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(start_time)) {
      return res.status(400).json({ success: false, error: "L'heure d'arrivée est invalide (format HH:mm requis)." });
    }
    if (end_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(end_time)) {
      return res.status(400).json({ success: false, error: "L'heure de départ est invalide (format HH:mm requis)." });
    }
    const bMin = Number(break_minutes || 0);
    if (isNaN(bMin) || bMin < 0 || bMin > 360) {
      return res.status(400).json({ success: false, error: "La pause doit être comprise entre 0 et 360 minutes." });
    }
    const expH = Number(expected_hours || 0);
    if (isNaN(expH) || expH < 0 || expH > 24) {
      return res.status(400).json({ success: false, error: "Les heures prévues doivent être comprises entre 0 et 24." });
    }

    // Récupérer l'état existant pour l'audit log
    const existing = await db.get<any>(`SELECT * FROM daily_entries WHERE user_id = ? AND entry_date = ?`, [userId, entry_date]);

    // Calcul automatique ou forçage manuel des heures réelles
    let actualHours = 0;
    let manualOverride = 0;

    if (manual_actual_hours !== null && manual_actual_hours !== undefined && manual_actual_hours !== '') {
      actualHours = Number(manual_actual_hours);
      manualOverride = 1;
    } else if (start_time && end_time) {
      actualHours = computeActualHours(start_time, end_time, Number(break_minutes || 0));
      manualOverride = 0;
    }

    let insertedId = existing?.id;

    if (existing) {
      // Mise à jour
      await db.run(`
        UPDATE daily_entries SET
          expected_hours = ?,
          start_time = ?,
          end_time = ?,
          break_minutes = ?,
          actual_hours = ?,
          manual_actual_override = ?,
          status_id = ?,
          is_override = 1,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND id = ?
      `, [
        Number(expected_hours || 0),
        start_time || null,
        end_time || null,
        Number(break_minutes || 0),
        actualHours,
        manualOverride,
        status_id || null,
        notes || null,
        userId,
        existing.id
      ]);

      await logAudit(
        userId,
        'daily_entries',
        existing.id,
        'UPDATE',
        existing,
        { entry_date, expected_hours, start_time, end_time, break_minutes, actual_hours: actualHours, status_id, notes },
        audit_reason || 'Modification manuelle du pointage'
      );
    } else {
      // Insertion
      const result = await db.run(`
        INSERT INTO daily_entries (
          user_id, entry_date, expected_hours, start_time, end_time, break_minutes,
          actual_hours, manual_actual_override, status_id, is_override, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `, [
        userId,
        entry_date,
        Number(expected_hours || 0),
        start_time || null,
        end_time || null,
        Number(break_minutes || 0),
        actualHours,
        manualOverride,
        status_id || null,
        notes || null
      ]);

      insertedId = result.lastID;

      await logAudit(
        userId,
        'daily_entries',
        insertedId,
        'INSERT',
        null,
        { entry_date, expected_hours, start_time, end_time, break_minutes, actual_hours: actualHours, status_id, notes },
        audit_reason || 'Création du pointage'
      );
    }

    // Récupérer la ligne enrichie finale
    const updated = await db.get<any>(`
      SELECT 
        d.*,
        s.code as status_code,
        s.label as status_label,
        s.color_hex as status_color,
        s.accounting_rule,
        p.label as period_label
      FROM daily_entries d
      LEFT JOIN status_catalog s ON d.status_id = s.id
      LEFT JOIN periods p ON d.period_id = p.id
      WHERE d.user_id = ? AND d.id = ?
    `, [userId, insertedId]);

    const { delta, positive, negative } = computeDailyDelta(updated);

    res.json({
      success: true,
      data: {
        ...updated,
        delta_hours: delta,
        positive_delta: positive,
        negative_delta: negative
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/entries/:date
 * Supprime ou réinitialise une entrée
 */
entriesRouter.delete('/:date', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const { date } = req.params;
    const existing = await db.get<any>(`SELECT * FROM daily_entries WHERE user_id = ? AND entry_date = ?`, [userId, date]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Entrée introuvable." });
    }

    await db.run(`DELETE FROM daily_entries WHERE user_id = ? AND id = ?`, [userId, existing.id]);
    await logAudit(userId, 'daily_entries', existing.id, 'DELETE', existing, null, 'Suppression du pointage');

    res.json({ success: true, message: `Pointage du ${date} supprimé.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
