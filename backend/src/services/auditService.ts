import { db } from '../database';
import { ActionType, AuditLog } from '../types';
import { assertMonthsOpen } from './settingsService';

/**
 * Enregistre une modification dans le journal. À appeler dans la même
 * transaction que la modification elle-même.
 */
export async function logAudit(
  userId: number,
  entityName: string,
  entityId: number,
  actionType: ActionType,
  oldValues: unknown,
  newValues: unknown,
  reason: string | null = null,
  revertsLogId: number | null = null
): Promise<number> {
  const result = await db.run(
    `INSERT INTO audit_logs (user_id, entity_name, entity_id, action_type, old_values, new_values, reason, reverts_log_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      entityName,
      entityId,
      actionType,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      reason,
      revertsLogId
    ]
  );
  return result.lastID;
}

function parseJson(value: string | null): any {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function getRecentAuditLogs(userId: number, limit: number): Promise<AuditLog[]> {
  const rows = await db.all<any>(
    `SELECT * FROM audit_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    [userId, limit]
  );
  return rows.map((r) => ({
    ...r,
    old_values: parseJson(r.old_values),
    new_values: parseJson(r.new_values)
  }));
}

class UndoRefused extends Error {}

const ENTRY_COLUMNS = [
  'expected_hours',
  'start_time',
  'end_time',
  'break_minutes',
  'actual_hours',
  'manual_actual_override',
  'status_id',
  'period_id',
  'is_override',
  'absence_reason',
  'absence_impact',
  'notes'
] as const;

function entryValues(snapshot: Record<string, unknown>): unknown[] {
  return ENTRY_COLUMNS.map((col) => (snapshot[col] === undefined ? null : snapshot[col]));
}

async function restoreEntrySnapshot(userId: number, snapshot: any): Promise<void> {
  const setClause = ENTRY_COLUMNS.map((c) => `${c} = ?`).join(', ');
  await db.run(`UPDATE daily_entries SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, [
    ...entryValues(snapshot),
    snapshot.id,
    userId
  ]);
}

async function reinsertEntry(userId: number, snapshot: any): Promise<void> {
  const existing = await db.get(`SELECT id FROM daily_entries WHERE user_id = ? AND entry_date = ?`, [userId, snapshot.entry_date]);
  if (existing) {
    throw new UndoRefused(`Une autre journée a été saisie le ${snapshot.entry_date} depuis : annulation impossible.`);
  }
  await db.run(
    `INSERT INTO daily_entries (id, user_id, entry_date, ${ENTRY_COLUMNS.join(', ')}) VALUES (?, ?, ?, ${ENTRY_COLUMNS.map(() => '?').join(', ')})`,
    [snapshot.id, userId, snapshot.entry_date, ...entryValues(snapshot)]
  );
}

/**
 * Annule la dernière action réversible non encore annulée.
 * Toute l'opération (restauration + marquage + journal) est atomique. Si l'action
 * ne peut pas être annulée, rien n'est modifié et la réponse le dit.
 */
export async function undoLastAction(userId: number): Promise<{ success: boolean; message: string }> {
  try {
    return await db.transaction(async () => {
      const log = await db.get<any>(
        `SELECT * FROM audit_logs
         WHERE user_id = ? AND action_type IN ('INSERT', 'UPDATE', 'DELETE', 'REGULARIZE')
           AND undone_at IS NULL AND reverts_log_id IS NULL
         ORDER BY id DESC LIMIT 1`,
        [userId]
      );
      if (!log) {
        throw new UndoRefused('Aucune action récente à annuler.');
      }

      const oldValues = parseJson(log.old_values);
      const newValues = parseJson(log.new_values);
      let description = '';

      switch (log.entity_name) {
        case 'daily_entries': {
          const date = oldValues?.entry_date || newValues?.entry_date;
          if (date) await assertMonthsOpen(userId, [date]);
          if (log.action_type === 'INSERT') {
            await db.run(`DELETE FROM daily_entries WHERE id = ? AND user_id = ?`, [log.entity_id, userId]);
          } else if (log.action_type === 'UPDATE' && oldValues) {
            await restoreEntrySnapshot(userId, { ...oldValues, id: log.entity_id });
          } else if (log.action_type === 'DELETE' && oldValues) {
            await reinsertEntry(userId, oldValues);
          } else {
            throw new UndoRefused("Cette modification de journée ne contient pas assez d'informations pour être annulée.");
          }
          description = `journée du ${date ?? '?'}`;
          break;
        }

        case 'regularizations': {
          const date = oldValues?.reg_date || newValues?.reg_date;
          if (date) await assertMonthsOpen(userId, [date]);
          if (log.action_type === 'INSERT' || log.action_type === 'REGULARIZE') {
            await db.run(`DELETE FROM regularizations WHERE id = ? AND user_id = ?`, [log.entity_id, userId]);
          } else if (log.action_type === 'DELETE' && oldValues) {
            await db.run(
              `INSERT INTO regularizations (id, user_id, reg_date, counter_type, operation_type, amount_hours, reason)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [oldValues.id, userId, oldValues.reg_date, oldValues.counter_type, oldValues.operation_type || 'SETTLE', oldValues.amount_hours, oldValues.reason]
            );
          } else {
            throw new UndoRefused("Cette régularisation ne peut pas être annulée automatiquement.");
          }
          description = `régularisation du ${date ?? '?'}`;
          break;
        }

        case 'monthly_targets': {
          if (log.action_type === 'INSERT') {
            await db.run(`DELETE FROM monthly_targets WHERE id = ? AND user_id = ?`, [log.entity_id, userId]);
          } else if (log.action_type === 'UPDATE' && oldValues) {
            // Les anciens journaux ne contiennent parfois que certains champs : on ne restaure que ceux-là.
            const fields = ['target_hours', 'notes', 'is_validated', 'validated_at'].filter((f) => f in oldValues);
            if (fields.length === 0) {
              throw new UndoRefused("Cette modification d'objectif ne contient pas assez d'informations pour être annulée.");
            }
            if ('is_validated' in oldValues && !('validated_at' in oldValues)) {
              fields.push('validated_at');
              oldValues.validated_at = oldValues.is_validated ? new Date().toISOString() : null;
            }
            await db.run(
              `UPDATE monthly_targets SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND user_id = ?`,
              [...fields.map((f) => oldValues[f] ?? null), log.entity_id, userId]
            );
          } else {
            throw new UndoRefused("Cette modification d'objectif ne peut pas être annulée automatiquement.");
          }
          description = `objectif de ${oldValues?.year_month || newValues?.year_month || '?'}`;
          break;
        }

        case 'periods': {
          if (log.action_type === 'INSERT') {
            const previous: any[] = Array.isArray(oldValues?.previousEntries) ? oldValues.previousEntries : [];
            const dates: string[] = Array.isArray(newValues?.applied_dates) ? newValues.applied_dates : previous.map((p) => p.entry_date);
            await assertMonthsOpen(userId, dates);
            for (const prev of previous) {
              await restoreEntrySnapshot(userId, prev);
            }
            const keepIds = previous.map((p) => p.id);
            const keepClause = keepIds.length ? ` AND id NOT IN (${keepIds.map(() => '?').join(',')})` : '';
            await db.run(`DELETE FROM daily_entries WHERE period_id = ? AND user_id = ?${keepClause}`, [log.entity_id, userId, ...keepIds]);
            await db.run(`DELETE FROM periods WHERE id = ? AND user_id = ?`, [log.entity_id, userId]);
          } else if (log.action_type === 'DELETE' && oldValues) {
            await db.run(
              `INSERT INTO periods (id, user_id, label, start_date, end_date, status_id, color_hex, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [log.entity_id, userId, oldValues.label, oldValues.start_date, oldValues.end_date, oldValues.status_id ?? null, oldValues.color_hex ?? null, oldValues.notes ?? null]
            );
            const detached: number[] = Array.isArray(oldValues.detached_entry_ids) ? oldValues.detached_entry_ids : [];
            for (const entryId of detached) {
              await db.run(`UPDATE daily_entries SET period_id = ? WHERE id = ? AND user_id = ?`, [log.entity_id, entryId, userId]);
            }
          } else {
            throw new UndoRefused('Cette modification de période ne peut pas être annulée automatiquement.');
          }
          description = `période « ${oldValues?.label || newValues?.label || '?'} »`;
          break;
        }

        default:
          throw new UndoRefused(`Les modifications de type « ${log.entity_name} » ne peuvent pas être annulées automatiquement.`);
      }

      await db.run(`UPDATE audit_logs SET undone_at = CURRENT_TIMESTAMP WHERE id = ?`, [log.id]);
      await logAudit(userId, log.entity_name, log.entity_id, 'RESTORE', newValues, oldValues, `Annulation de l'action #${log.id}`, log.id);

      return { success: true, message: `Dernière action annulée (${description}).` };
    });
  } catch (err) {
    if (err instanceof UndoRefused) {
      return { success: false, message: err.message };
    }
    // Un mois verrouillé ou une autre erreur métier remonte telle quelle.
    throw err;
  }
}
