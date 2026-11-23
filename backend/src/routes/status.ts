import { Router } from 'express';
import { db } from '../database';
import { logAudit } from '../services/auditService';
import { requireAdmin } from '../middleware/adminAuth';
import {
  asyncHandler,
  badRequest,
  conflict,
  isValidColor,
  notFound,
  requireId,
  requireOneOf,
  requireString,
  requireUserId
} from '../http';
import { ACCOUNTING_RULES } from '../types';

/**
 * Catalogue des statuts d'absence, commun à tous les comptes.
 * Lecture : tout utilisateur connecté. Écriture : administrateurs seulement.
 */
export const statusRouter = Router();

statusRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db.all(`SELECT * FROM status_catalog ORDER BY display_order ASC, id ASC`);
    res.json({ success: true, data: rows });
  })
);

/**
 * PUT /api/status/:id
 * Un statut système ne peut changer que de libellé et de couleur : son code et
 * sa règle de calcul sont utilisés par l'application.
 */
statusRouter.put(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const id = requireId(req.params.id);
    const body = req.body || {};

    const updated = await db.transaction(async () => {
      const existing = await db.get<any>(`SELECT * FROM status_catalog WHERE id = ?`, [id]);
      if (!existing) throw notFound('Statut introuvable.');

      const label = body.label === undefined ? existing.label : requireString(body.label, 'Le libellé', 60);
      if (body.color_hex !== undefined && !isValidColor(body.color_hex)) {
        throw badRequest('La couleur doit être au format #RRGGBB.');
      }
      const color = body.color_hex ?? existing.color_hex;
      const rule = body.accounting_rule === undefined ? existing.accounting_rule : requireOneOf(body.accounting_rule, ACCOUNTING_RULES, 'La règle de calcul');
      if (existing.is_system && rule !== existing.accounting_rule) {
        throw conflict("La règle de calcul d'un statut système ne peut pas être modifiée.");
      }
      const isDefaultAbsence = body.is_default_absence === undefined ? existing.is_default_absence : body.is_default_absence ? 1 : 0;

      await db.run(`UPDATE status_catalog SET label = ?, color_hex = ?, accounting_rule = ?, is_default_absence = ? WHERE id = ?`, [
        label,
        color,
        rule,
        isDefaultAbsence,
        id
      ]);
      const after = await db.get(`SELECT * FROM status_catalog WHERE id = ?`, [id]);
      await logAudit(userId, 'status_catalog', id, 'UPDATE', existing, after, `Modification du statut « ${existing.label} »`);
      return after;
    });
    res.json({ success: true, data: updated });
  })
);

/** POST /api/status — ajoute un statut personnalisé. */
statusRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const body = req.body || {};
    const code = requireString(body.code, 'Le code', 30).toUpperCase();
    if (!/^[A-Z0-9_]{2,30}$/.test(code)) {
      throw badRequest('Le code ne peut contenir que des lettres, des chiffres et « _ ».');
    }
    const label = requireString(body.label, 'Le libellé', 60);
    if (!isValidColor(body.color_hex)) throw badRequest('La couleur doit être au format #RRGGBB.');
    const rule = requireOneOf(body.accounting_rule, ACCOUNTING_RULES, 'La règle de calcul');

    const created = await db.transaction(async () => {
      if (await db.get(`SELECT id FROM status_catalog WHERE code = ?`, [code])) {
        throw conflict('Un statut utilise déjà ce code.');
      }
      const maxOrder = await db.get<{ m: number | null }>(`SELECT MAX(display_order) AS m FROM status_catalog`);
      const result = await db.run(
        `INSERT INTO status_catalog (code, label, color_hex, accounting_rule, is_default_absence, is_system, display_order)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [code, label, body.color_hex, rule, body.is_default_absence ? 1 : 0, (maxOrder?.m ?? 0) + 1]
      );
      const row = await db.get(`SELECT * FROM status_catalog WHERE id = ?`, [result.lastID]);
      await logAudit(userId, 'status_catalog', result.lastID, 'INSERT', null, row, `Ajout du statut « ${label} »`);
      return row;
    });
    res.status(201).json({ success: true, data: created });
  })
);
