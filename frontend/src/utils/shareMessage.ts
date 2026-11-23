import { DailyEntry } from '../types';
import { absenceLabel, noteWithoutReason, reasonOfEntry } from '../domain';
import { formatDuration, formatHours, formatPlanningHours, formatSignedDuration } from './format';
import { formatShortDate } from './dates';

export interface ShareMessageInput {
  monthDisplay: string;
  agentName: string;
  targetHours: number;
  workedHours: number;
  dayOffCount: number;
  positiveHours: number;
  negativeHours: number;
  netBalance: number;
  totalPositiveBalance: number;
  totalNegativeBalance: number;
  entries: DailyEntry[];
}

/** Texte du récapitulatif mensuel envoyé au responsable (WhatsApp, e-mail, SMS, copie). */
export function buildShareMessage(input: ShareMessageInput): string {
  const lines = [
    `Récapitulatif de mes heures — ${input.monthDisplay}`,
    `Agent : ${input.agentName || 'Salarié(e)'}`,
    ``,
    `Objectif du mois : ${formatPlanningHours(input.targetHours)}`,
    `Total des heures travaillées : ${formatDuration(input.workedHours)}`,
    `Jours à 0 h / congés : ${input.dayOffCount} jour(s)`,
    ``,
    `Bilan du mois :`,
    `• Heures sup : ${formatSignedDuration(input.positiveHours)}`,
    `• Heures à rattraper : ${formatSignedDuration(-input.negativeHours)}`,
    `• Solde net : ${formatSignedDuration(input.netBalance)}`,
    ``,
    `Compteurs cumulés :`,
    `• On me doit : ${formatHours(input.totalPositiveBalance)}`,
    `• Je dois : ${formatHours(-Math.abs(input.totalNegativeBalance))}`,
    ``,
    `Détail des journées :`
  ];

  if (input.entries.length === 0) {
    lines.push(`(Aucune journée enregistrée pour ce mois)`);
  } else {
    input.entries.forEach((e) => {
      const delta = e.delta_hours || 0;
      const deltaStr = Math.abs(delta) >= 0.005 ? ` [${formatSignedDuration(delta)}]` : '';
      if (e.status_id) {
        const note = noteWithoutReason(e.notes, reasonOfEntry(e));
        lines.push(`- ${formatShortDate(e.entry_date)} : ${absenceLabel(e)} (${formatDuration(e.actual_hours)})${deltaStr}${note ? ` — ${note}` : ''}`);
      } else {
        lines.push(
          `- ${formatShortDate(e.entry_date)} : ${e.start_time || '?'} à ${e.end_time || '?'} (${formatDuration(e.actual_hours)})${deltaStr}${e.notes ? ` — ${e.notes}` : ''}`
        );
      }
    });
  }

  lines.push(``);
  lines.push(`Bonne réception.`);
  return lines.join('\n');
}
