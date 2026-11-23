import { Router } from 'express';
import { db } from '../database';
import { logAudit } from '../services/auditService';
import { getGlobalCockpitSummary } from '../services/hoursService';
import { assertMonthsOpen } from '../services/settingsService';
import {
  asyncHandler,
  badRequest,
  localToday,
  notFound,
  requireDate,
  requireId,
  requireNumber,
  requireOneOf,
  requireString,
  requireUserId
} from '../http';
import { CounterType, OperationType } from '../types';

export const regularizationsRouter = Router();

const COUNTER_TYPES: readonly CounterType[] = ['POSITIVE', 'NEGATIVE'];
const OPERATION_TYPES: readonly OperationType[] = ['SETTLE', 'ADD'];

const formatHours = (h: number) => `${Math.round(h * 100) / 100} h`;

/** GET /api/regularizations?counter_type=POSITIVE|NEGATIVE */
regularizationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const params: unknown[] = [userId];
    let sql = `SELECT * FROM regularizations WHERE user_id = ?`;
    if (req.query.counter_type !== undefined) {
      sql += ` AND counter_type = ?`;
      params.push(requireOneOf(req.query.counter_type, COUNTER_TYPES, 'Le compteur'));
    }
    sql += ` ORDER BY reg_date DESC, id DESC`;
    res.json({ success: true, data: await db.all(sql, params) });
  })
);

/**
 * POST /api/regularizations
 * SETTLE : heures payées / récupérées / rattrapées, déduites du compteur.
 * ADD    : heures ajoutées au compteur (report d'un ancien solde...).
 */
regularizationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const body = req.body || {};
    const regDate = requireDate(body.reg_date, 'La date');
    const counterType = requireOneOf(body.counter_type, COUNTER_TYPES, 'Le compteur');
    const operationType = body.operation_type === undefined ? 'SETTLE' : requireOneOf(body.operation_type, OPERATION_TYPES, "Le type d'opération");
    const amount = requireNumber(body.amount_hours, "Le nombre d'heures", 0.01, 1000);
    const reason = requireString(body.reason, 'Le motif', 200);

    const created = await db.transaction(async () => {
      await assertMonthsOpen(userId, [regDate]);

      // Une déduction ne peut pas dépasser le solde affiché, sinon elle basculerait
      // silencieusement sur l'autre compteur.
      if (operationType === 'SETTLE') {
        if (regDate > localToday()) {
          throw badRequest("Une déduction ne peut pas être datée dans le futur : le solde à cette date n'est pas encore connu.");
        }
        const summary = await getGlobalCockpitSummary(userId);
        const available = counterType === 'POSITIVE' ? summary.total_positive_balance : summary.total_negative_balance;
        if (amount > available + 0.001) {
          throw badRequest(`Impossible de déduire ${formatHours(amount)} : le solde actuel n'est que de ${formatHours(available)}.`);
        }
      }

      const result = await db.run(
        `INSERT INTO regularizations (user_id, reg_date, counter_type, operation_type, amount_hours, reason) VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, regDate, counterType, operationType, amount, reason]
      );
      const data = { id: result.lastID, reg_date: regDate, counter_type: counterType, operation_type: operationType, amount_hours: amount, reason };
      const opLabel = operationType === 'ADD' ? 'Ajout de' : 'Déduction de';
      await logAudit(userId, 'regularizations', result.lastID, 'REGULARIZE', null, data, `${opLabel} ${formatHours(amount)} (${counterType}) : ${reason}`);
      return data;
    });

    res.status(201).json({ success: true, data: created });
  })
);

/** DELETE /api/regularizations/:id */
regularizationsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const id = requireId(req.params.id);
    await db.transaction(async () => {
      const existing = await db.get<any>(`SELECT * FROM regularizations WHERE user_id = ? AND id = ?`, [userId, id]);
      if (!existing) throw notFound('Régularisation introuvable.');
      await assertMonthsOpen(userId, [existing.reg_date]);
      await db.run(`DELETE FROM regularizations WHERE user_id = ? AND id = ?`, [userId, id]);
      await logAudit(userId, 'regularizations', id, 'DELETE', existing, null, `Suppression de la régularisation #${id}`);
    });
    res.json({ success: true, message: 'Régularisation supprimée.' });
  })
);
