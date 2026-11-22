import { Router, Request, Response } from 'express';
import { db } from '../database';
import { logAudit } from '../services/auditService';

export const periodsRouter = Router();

/**
 * GET /api/periods
 * Liste toutes les périodes définies
 */
periodsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const rows = await db.all<any>(`
      SELECT 
        p.*,
        s.label as status_label,
        s.color_hex as status_color
      FROM periods p
      LEFT JOIN status_catalog s ON p.status_id = s.id
      WHERE p.user_id = ?
      ORDER BY p.start_date DESC
    `, [userId]);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/periods/check-conflicts
 * Garde-fou anti-écrasement : liste les journées ayant été personnalisées manuellement dans l'intervalle
 */
periodsRouter.post('/check-conflicts', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const { start_date, end_date } = req.body;
    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, error: "start_date et end_date sont requis." });
    }

    const overriddenDays = await db.all<any>(`
      SELECT 
        d.entry_date, 
        d.expected_hours, 
        d.actual_hours,
        s.label as status_label
      FROM daily_entries d
      LEFT JOIN status_catalog s ON d.status_id = s.id
      WHERE d.user_id = ? AND d.entry_date >= ? AND d.entry_date <= ? AND d.is_override = 1
      ORDER BY d.entry_date ASC
    `, [userId, start_date, end_date]);

    res.json({
      success: true,
      has_conflicts: overriddenDays.length > 0,
      conflicted_days: overriddenDays
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/periods
 * Crée une période et propage le statut sur les jours de l'intervalle
 * Paramètre 'preserve_overrides': true par défaut pour protéger les jours modifiés
 */
periodsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const {
      label,
      start_date,
      end_date,
      status_id,
      color_hex,
      notes,
      preserve_overrides = true,
      skip_weekends = true,
      expected_hours_per_day = 0,
      actual_hours_per_day = 0
    } = req.body;

    if (!label || !start_date || !end_date) {
      return res.status(400).json({ success: false, error: "Le libellé, la date de début et la date de fin sont requis." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      return res.status(400).json({ success: false, error: "Les dates doivent être au format YYYY-MM-DD." });
    }
    if (start_date > end_date) {
      return res.status(400).json({ success: false, error: "La date de début ne peut pas être postérieure à la date de fin." });
    }
    const diffDays = Math.round((new Date(end_date).getTime() - new Date(start_date).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 366) {
      return res.status(400).json({ success: false, error: "La durée d'une période ne peut pas dépasser 366 jours." });
    }

    // 1. Générer la liste des jours entre start_date et end_date (en excluant éventuellement les samedis et dimanches)
    const [sy, sm, sd] = start_date.split('-').map(Number);
    const [ey, em, ed] = end_date.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    const dateList: string[] = [];
    const cur = new Date(start);

    while (cur <= end) {
      const dayOfWeek = cur.getDay(); // 0 = Dimanche, 6 = Samedi
      if (!(skip_weekends && (dayOfWeek === 0 || dayOfWeek === 6))) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        dateList.push(`${y}-${m}-${d}`);
      }
      cur.setDate(cur.getDate() + 1);
    }

    const expH = Number(expected_hours_per_day || 0);
    const actH = Number(actual_hours_per_day || 0);
    const dayNotes = notes || label;
    let daysModifiedCount = 0;
    let periodId = 0;

    // 2. Transaction atomique pour garantir la cohérence
    await db.exec('BEGIN TRANSACTION');
    try {
      // Insertion de la période
      const periodResult = await db.run(`
        INSERT INTO periods (user_id, label, start_date, end_date, status_id, color_hex, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [userId, label, start_date, end_date, status_id || null, color_hex || null, notes || null]);

      periodId = periodResult.lastID;

      // Sauvegarde de l'état préalable des journées existantes pour annulation (Undo) 100% sécurisée
      const previousEntriesSnapshot: any[] = [];

      // Appliquer la période sur chaque jour
      for (const dStr of dateList) {
        const existing = await db.get<any>(`SELECT * FROM daily_entries WHERE user_id = ? AND entry_date = ?`, [userId, dStr]);

        if (existing) {
          // Si preserve_overrides est activé et que le jour a été personnalisé individuellement, on ne l'écrase pas
          if (preserve_overrides && existing.is_override === 1) {
            continue;
          }

          // Enregistrer la copie exacte de la journée avant modification
          previousEntriesSnapshot.push({ ...existing });

          await db.run(`
            UPDATE daily_entries SET
              expected_hours = ?,
              actual_hours = ?,
              period_id = ?,
              status_id = COALESCE(?, status_id),
              notes = COALESCE(notes, ?),
              updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND id = ?
          `, [expH, actH, periodId, status_id || null, dayNotes, userId, existing.id]);
          daysModifiedCount++;
        } else {
          // is_override = 0 : journée générée par lot via la période (pas une saisie manuelle individuelle)
          await db.run(`
            INSERT INTO daily_entries (user_id, entry_date, expected_hours, actual_hours, status_id, period_id, is_override, notes)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)
          `, [userId, dStr, expH, actH, status_id || null, periodId, dayNotes]);
          daysModifiedCount++;
        }
      }

      await logAudit(
        userId,
        'periods',
        periodId,
        'INSERT',
        { previousEntries: previousEntriesSnapshot },
        req.body,
        `Création période ${label} (${daysModifiedCount} jours appliqués)`
      );
      await db.exec('COMMIT');
    } catch (txErr) {
      await db.exec('ROLLBACK');
      throw txErr;
    }

    res.json({
      success: true,
      data: {
        id: periodId,
        label,
        start_date,
        end_date,
        days_covered: dateList.length,
        days_modified: daysModifiedCount
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/periods/:id
 * Supprime une période (détache les entrées journalières sans les supprimer)
 */
periodsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;
    const existing = await db.get<any>(`SELECT * FROM periods WHERE user_id = ? AND id = ?`, [userId, id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Période introuvable." });
    }

    await db.run(`UPDATE daily_entries SET period_id = NULL WHERE user_id = ? AND period_id = ?`, [userId, id]);
    await db.run(`DELETE FROM periods WHERE user_id = ? AND id = ?`, [userId, id]);

    await logAudit(userId, 'periods', Number(id), 'DELETE', existing, null, `Suppression de la période ${existing.label}`);

    res.json({ success: true, message: `Période supprimée.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
