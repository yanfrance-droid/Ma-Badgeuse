import { Router, Request, Response } from 'express';
import { db } from '../database';
import { logAudit } from '../services/auditService';

export const regularizationsRouter = Router();

/**
 * GET /api/regularizations
 * Liste toutes les régularisations enregistrées
 */
regularizationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const { counter_type } = req.query;
    let query = `SELECT * FROM regularizations WHERE user_id = ?`;
    const params: any[] = [userId];

    if (counter_type) {
      query += ` AND counter_type = ?`;
      params.push(counter_type);
    }

    query += ` ORDER BY reg_date DESC, id DESC`;

    const rows = await db.all<any>(query, params);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/regularizations
 * Enregistre une régularisation / récupération d'heures
 */
regularizationsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const { reg_date, counter_type, operation_type = 'SETTLE', amount_hours, reason } = req.body;

    if (!reg_date || !counter_type || !amount_hours || !reason) {
      return res.status(400).json({
        success: false,
        error: "Tous les champs (reg_date, counter_type, amount_hours, reason) sont obligatoires."
      });
    }

    if (!['POSITIVE', 'NEGATIVE'].includes(counter_type)) {
      return res.status(400).json({
        success: false,
        error: "counter_type doit être soit 'POSITIVE', soit 'NEGATIVE'."
      });
    }

    if (!['SETTLE', 'ADD'].includes(operation_type)) {
      return res.status(400).json({
        success: false,
        error: "operation_type doit être soit 'SETTLE' (déduction/règlement), soit 'ADD' (ajout au compteur)."
      });
    }

    const numericAmount = parseFloat(String(amount_hours));
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Le montant d'heures doit être un nombre strictement positif supérieur à 0."
      });
    }

    await db.exec('BEGIN TRANSACTION');
    let newId = 0;
    try {
      const result = await db.run(`
        INSERT INTO regularizations (user_id, reg_date, counter_type, operation_type, amount_hours, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [userId, reg_date, counter_type, operation_type, Number(amount_hours), reason]);

      newId = result.lastID;
      const opLabel = operation_type === 'ADD' ? 'Ajout manuel de' : 'Régularisation / Déduction de';
      await logAudit(
        userId,
        'regularizations',
        newId,
        'REGULARIZE',
        null,
        { reg_date, counter_type, operation_type, amount_hours, reason },
        `${opLabel} ${amount_hours}h sur le compteur ${counter_type} : ${reason}`
      );
      await db.exec('COMMIT');
    } catch (txErr) {
      await db.exec('ROLLBACK');
      throw txErr;
    }

    res.json({
      success: true,
      data: {
        id: newId,
        reg_date,
        counter_type,
        operation_type,
        amount_hours: Number(amount_hours),
        reason
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/regularizations/:id
 * Supprime une régularisation
 */
regularizationsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;
    const existing = await db.get<any>(`SELECT * FROM regularizations WHERE user_id = ? AND id = ?`, [userId, id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Régularisation introuvable." });
    }

    await db.exec('BEGIN TRANSACTION');
    try {
      await db.run(`DELETE FROM regularizations WHERE user_id = ? AND id = ?`, [userId, id]);
      await logAudit(
        userId,
        'regularizations',
        Number(id),
        'DELETE',
        existing,
        null,
        `Suppression de la régularisation #${id}`
      );
      await db.exec('COMMIT');
    } catch (txErr) {
      await db.exec('ROLLBACK');
      throw txErr;
    }

    res.json({ success: true, message: "Régularisation supprimée." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
