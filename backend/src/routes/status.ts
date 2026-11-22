import { Router, Request, Response } from 'express';
import { db } from '../database';
import { logAudit } from '../services/auditService';

export const statusRouter = Router();

/**
 * GET /api/status
 * Récupère le catalogue des statuts
 */
statusRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db.all<any>(`
      SELECT * FROM status_catalog 
      ORDER BY display_order ASC, id ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/status/:id
 * Modifie un statut (couleur hexadécimale, libellé, règle comptable)
 */
statusRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { label, color_hex, accounting_rule, is_default_absence } = req.body;

    const existing = await db.get<any>(`SELECT * FROM status_catalog WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Statut introuvable." });
    }

    await db.run(`
      UPDATE status_catalog SET
        label = COALESCE(?, label),
        color_hex = COALESCE(?, color_hex),
        accounting_rule = COALESCE(?, accounting_rule),
        is_default_absence = COALESCE(?, is_default_absence)
      WHERE id = ?
    `, [label, color_hex, accounting_rule, is_default_absence, id]);

    await logAudit(
      req.userId || 1,
      'status_catalog',
      Number(id),
      'UPDATE',
      existing,
      { label, color_hex, accounting_rule, is_default_absence },
      `Modification du statut ${existing.label}`
    );

    const updated = await db.get<any>(`SELECT * FROM status_catalog WHERE id = ?`, [id]);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/status
 * Ajoute un statut personnalisé
 */
statusRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { code, label, color_hex, accounting_rule, is_default_absence = 0 } = req.body;
    if (!code || !label || !color_hex || !accounting_rule) {
      return res.status(400).json({ success: false, error: "code, label, color_hex et accounting_rule sont requis." });
    }

    const result = await db.run(`
      INSERT INTO status_catalog (code, label, color_hex, accounting_rule, is_default_absence, is_system, display_order)
      VALUES (?, ?, ?, ?, ?, 0, 99)
    `, [code.toUpperCase(), label, color_hex, accounting_rule, is_default_absence]);

    const created = await db.get<any>(`SELECT * FROM status_catalog WHERE id = ?`, [result.lastID]);
    await logAudit(req.userId || 1, 'status_catalog', result.lastID, 'INSERT', null, created, `Ajout du statut ${label}`);

    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
