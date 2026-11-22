import { db } from '../database';
import { ActionType, AuditLog } from '../types';

/**
 * Enregistre une modification dans la table audit_logs
 */
export async function logAudit(
  userId: number = 1,
  entityName: string,
  entityId: number,
  actionType: ActionType,
  oldValues: any,
  newValues: any,
  reason: string | null = null
): Promise<number> {
  const result = await db.run(
    `INSERT INTO audit_logs (user_id, entity_name, entity_id, action_type, old_values, new_values, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      entityName,
      entityId,
      actionType,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      reason
    ]
  );
  return result.lastID;
}

/**
 * Récupère les logs d'audit récents
 */
export async function getRecentAuditLogs(userId: number = 1, limit: number = 50): Promise<AuditLog[]> {
  const rows = await db.all<any>(
    `SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [userId, limit]
  );
  return rows.map((r) => ({
    ...r,
    old_values: r.old_values ? JSON.parse(r.old_values) : null,
    new_values: r.new_values ? JSON.parse(r.new_values) : null
  }));
}

/**
 * Annuler la dernière action (Undo)
 */
export async function undoLastAction(userId: number = 1): Promise<{ success: boolean; message: string; restoredLog?: any }> {
  // 1. Récupérer les identifiants d'actions déjà annulées
  const restoredLogs = await db.all<any>(`
    SELECT reason FROM audit_logs WHERE user_id = ? AND action_type = 'RESTORE'
  `, [userId]);
  const undoneIds = new Set<number>();
  for (const r of restoredLogs) {
    const m = r.reason?.match(/#(\d+)/);
    if (m) undoneIds.add(Number(m[1]));
  }

  // 2. Trouver la dernière action de type réversible non encore annulée
  const candidateLogs = await db.all<any>(`
    SELECT * FROM audit_logs 
    WHERE user_id = ? AND action_type IN ('INSERT', 'UPDATE', 'DELETE', 'REGULARIZE')
    ORDER BY id DESC 
    LIMIT 30
  `, [userId]);

  const lastLog = candidateLogs.find((l) => !undoneIds.has(l.id));

  if (!lastLog) {
    return { success: false, message: "Aucune action récente à annuler." };
  }

  const oldValues = lastLog.old_values ? JSON.parse(lastLog.old_values) : null;
  const newValues = lastLog.new_values ? JSON.parse(lastLog.new_values) : null;

  if (lastLog.entity_name === 'daily_entries') {
    if (lastLog.action_type === 'UPDATE' && oldValues) {
      await db.run(
        `UPDATE daily_entries SET 
          expected_hours = ?, start_time = ?, end_time = ?, break_minutes = ?,
          actual_hours = ?, manual_actual_override = ?, status_id = ?, period_id = ?,
          is_override = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?`,
        [
          oldValues.expected_hours,
          oldValues.start_time,
          oldValues.end_time,
          oldValues.break_minutes,
          oldValues.actual_hours,
          oldValues.manual_actual_override,
          oldValues.status_id,
          oldValues.period_id,
          oldValues.is_override,
          oldValues.notes,
          lastLog.entity_id,
          lastLog.user_id || userId
        ]
      );
    } else if (lastLog.action_type === 'INSERT') {
      await db.run(`DELETE FROM daily_entries WHERE id = ? AND user_id = ?`, [lastLog.entity_id, lastLog.user_id || userId]);
    } else if (lastLog.action_type === 'DELETE' && oldValues) {
      await db.run(
        `INSERT INTO daily_entries (id, user_id, entry_date, expected_hours, start_time, end_time, break_minutes, actual_hours, manual_actual_override, status_id, period_id, is_override, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          oldValues.id,
          lastLog.user_id || userId,
          oldValues.entry_date,
          oldValues.expected_hours,
          oldValues.start_time,
          oldValues.end_time,
          oldValues.break_minutes,
          oldValues.actual_hours,
          oldValues.manual_actual_override,
          oldValues.status_id,
          oldValues.period_id,
          oldValues.is_override,
          oldValues.notes
        ]
      );
    }
  } else if (lastLog.entity_name === 'regularizations') {
    if (lastLog.action_type === 'INSERT' || lastLog.action_type === 'REGULARIZE') {
      await db.run(`DELETE FROM regularizations WHERE id = ? AND user_id = ?`, [lastLog.entity_id, lastLog.user_id || userId]);
    } else if (lastLog.action_type === 'DELETE' && oldValues) {
      await db.run(
        `INSERT INTO regularizations (id, user_id, reg_date, counter_type, operation_type, amount_hours, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          oldValues.id,
          lastLog.user_id || userId,
          oldValues.reg_date,
          oldValues.counter_type,
          oldValues.operation_type || 'SETTLE',
          oldValues.amount_hours,
          oldValues.reason
        ]
      );
    }
  } else if (lastLog.entity_name === 'periods') {
    if (lastLog.action_type === 'INSERT') {
      const restoredDates: string[] = [];
      // 1. Si des journées existaient avant la période, on restaure exactement leur état initial
      if (oldValues && Array.isArray(oldValues.previousEntries)) {
        for (const prev of oldValues.previousEntries) {
          await db.run(
            `UPDATE daily_entries SET
              expected_hours = ?,
              actual_hours = ?,
              period_id = ?,
              status_id = ?,
              start_time = ?,
              end_time = ?,
              break_minutes = ?,
              is_override = ?,
              notes = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?`,
            [
              prev.expected_hours,
              prev.actual_hours,
              prev.period_id || null,
              prev.status_id || null,
              prev.start_time || null,
              prev.end_time || null,
              prev.break_minutes || 0,
              prev.is_override || 0,
              prev.notes || null,
              prev.id,
              lastLog.user_id || userId
            ]
          );
          restoredDates.push(prev.entry_date);
        }
      }

      // 2. On supprime les journées générées de zéro par la période (qui n'existaient pas avant)
      if (restoredDates.length > 0) {
        const placeholders = restoredDates.map(() => '?').join(',');
        await db.run(
          `DELETE FROM daily_entries WHERE period_id = ? AND user_id = ? AND entry_date NOT IN (${placeholders})`,
          [lastLog.entity_id, lastLog.user_id || userId, ...restoredDates]
        );
      } else {
        await db.run(`DELETE FROM daily_entries WHERE period_id = ? AND user_id = ?`, [lastLog.entity_id, lastLog.user_id || userId]);
      }

      // 3. Suppression de la période elle-même
      await db.run(`DELETE FROM periods WHERE id = ? AND user_id = ?`, [lastLog.entity_id, lastLog.user_id || userId]);
    }
  } else if (lastLog.entity_name === 'monthly_targets') {
    if (oldValues && oldValues.target_hours !== undefined) {
      await db.run(`UPDATE monthly_targets SET target_hours = ? WHERE id = ? AND user_id = ?`, [oldValues.target_hours, lastLog.entity_id, lastLog.user_id || userId]);
    }
  } else {
    return {
      success: false,
      message: `L'action #${lastLog.id} sur l'entité ${lastLog.entity_name} ne peut pas être annulée automatiquement.`
    };
  }

  // Enregistrer le restore dans les logs
  await logAudit(
    userId,
    lastLog.entity_name,
    lastLog.entity_id,
    'RESTORE',
    newValues,
    oldValues,
    `Annulation (Undo) de l'action #${lastLog.id}`
  );

  return { 
    success: true, 
    message: `Action #${lastLog.id} (${lastLog.action_type} sur ${lastLog.entity_name}) annulée avec succès.` 
  };
}
