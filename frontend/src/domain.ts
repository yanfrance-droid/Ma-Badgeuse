/**
 * Règles et libellés métier partagés par les écrans : motifs d'absence,
 * formulaires, libellés de l'historique.
 */
import { AbsenceImpact, AuditLogItem, DailyEntry } from './types';
import { formatDuration } from './utils/format';
import { formatDateFrench, formatMonthLabel } from './utils/dates';

export type ThemeMode = 'LIGHT' | 'DARK' | 'SYSTEM';
export type SettingsTab = 'SCHEDULE' | 'ACCOUNT' | 'HISTORY' | 'ADMIN';
export type LoadState = 'loading' | 'ok' | 'error';

export interface HabitualSchedule {
  startTime: string;
  endTime: string;
  breakMinutes: number;
  expectedHours: number;
}

export interface Profile {
  agentName: string;
  employerName: string;
  jobTitle: string;
  managerPhone: string;
  managerEmail: string;
}

interface AbsenceReason {
  id: string;
  /** Libellé affiché ; inchangé pour reconnaître les anciennes journées (motif écrit dans la note). */
  label: string;
  statusCode: string;
  defaultImpact: AbsenceImpact;
  /** Compté dans « jours à 0 h / congés » du mois. */
  isDayOff: boolean;
}

// Motifs d'absence : statut du catalogue et impact proposé par défaut.
export const ABSENCE_REASONS: AbsenceReason[] = [
  { id: 'JOUR_ZERO', label: '🏖️ Jour à 0 h (Congés / Vacances)', statusCode: 'JOUR_ZERO', defaultImpact: 'NEUTRAL', isDayOff: true },
  { id: 'CP', label: '🏖️ Congés Payés (CP)', statusCode: 'CONGE_PAYE', defaultImpact: 'NEUTRAL', isDayOff: true },
  { id: 'FERIE', label: '🛑 Jour Férié chômé', statusCode: 'JOUR_FERIE', defaultImpact: 'NEUTRAL', isDayOff: true },
  { id: 'FERMETURE', label: '⚠️ Fermeture école / Vacances scolaires', statusCode: 'FERMETURE_ECOLE', defaultImpact: 'NEUTRAL', isDayOff: true },
  { id: 'MALADIE', label: '🤒 Arrêt Maladie', statusCode: 'ARRET_MALADIE', defaultImpact: 'NEUTRAL', isDayOff: false },
  { id: 'ENFANT_MALADE', label: '🧒 Enfant malade', statusCode: 'ARRET_MALADIE', defaultImpact: 'NEUTRAL', isDayOff: false },
  { id: 'FAMILLE', label: '💍 Événement familial', statusCode: 'EVENT_FAMILLE', defaultImpact: 'NEUTRAL', isDayOff: false },
  { id: 'FORMATION', label: '🎓 Formation', statusCode: 'CONGE_PAYE', defaultImpact: 'COUNTED_AS_WORKED', isDayOff: false },
  { id: 'SANS_SOLDE', label: '🚫 Absence sans solde / À rattraper', statusCode: 'CONGE_SANS_SOLDE', defaultImpact: 'TO_RECOVER', isDayOff: false },
  { id: 'ACCIDENT', label: '🩹 Accident du travail', statusCode: 'ARRET_MALADIE', defaultImpact: 'NEUTRAL', isDayOff: false }
];
export const DEFAULT_REASON = ABSENCE_REASONS[0];

/** Statuts comptés comme « jour à 0 h / congé » pour les journées sans motif enregistré. */
const DAY_OFF_STATUS_CODES = new Set(['CONGE_PAYE', 'JOUR_ZERO', 'VACANCES_SCOLAIRES', 'FERMETURE_ECOLE', 'JOUR_FERIE']);

/** Valeurs affichées avant le chargement des réglages du compte (identiques aux défauts du serveur). */
export const DEFAULT_SCHEDULE: HabitualSchedule = { startTime: '10:45', endTime: '14:45', breakMinutes: 0, expectedHours: 4 };
export const EMPTY_PROFILE: Profile = { agentName: '', employerName: '', jobTitle: '', managerPhone: '', managerEmail: '' };

/** Clés des anciennes versions (jeton, PIN, réglages locaux) à effacer de l'appareil. */
export const LEGACY_LOCAL_KEYS = ['ma_badgeuse_token', 'agent_name', 'manager_phone', 'manager_email', 'habitual_schedule'];
export const LEGACY_SESSION_KEYS = ['admin_pin', 'admin_unlocked'];

export const ENTITY_LABELS: Record<string, string> = {
  daily_entries: 'Journée',
  regularizations: 'Régularisation',
  monthly_targets: 'Objectif du mois',
  periods: 'Période'
};
export const ACTION_LABELS: Record<string, string> = {
  INSERT: 'Création',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
  REGULARIZE: 'Régularisation',
  RESTORE: 'Annulation'
};

export interface PeriodFormState {
  label: string;
  startDate: string;
  endDate: string;
  reasonId: string;
  impact: AbsenceImpact;
  skipWeekends: boolean;
}

export function makePeriodForm(startDate: string, endDate: string): PeriodFormState {
  return {
    label: DEFAULT_REASON.label,
    startDate,
    endDate,
    reasonId: DEFAULT_REASON.id,
    impact: DEFAULT_REASON.defaultImpact,
    skipWeekends: true
  };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function findReason(id: string | null | undefined): AbsenceReason | undefined {
  return ABSENCE_REASONS.find((r) => r.id === id);
}

/** Motif d'une journée : enregistré, ou retrouvé dans la note pour les journées des anciennes versions. */
export function reasonOfEntry(entry: DailyEntry): AbsenceReason | undefined {
  return findReason(entry.absence_reason) ?? ABSENCE_REASONS.find((r) => entry.notes?.includes(r.label));
}

export function absenceLabel(entry: DailyEntry): string {
  return reasonOfEntry(entry)?.label ?? entry.status_label ?? 'Absence';
}

/** Retire le libellé du motif de la note (anciennes versions et périodes l'y écrivaient). */
export function noteWithoutReason(notes: string | null, reason: AbsenceReason | undefined): string {
  if (!notes) return '';
  if (!reason) return notes;
  return notes.split(reason.label).join('').replace(/^[\s:–-]+/, '').trim();
}

/** Impact d'une absence : enregistré, sinon déduit des heures (anciennes versions). */
export function impactOfEntry(entry: DailyEntry): AbsenceImpact {
  if (entry.absence_impact) return entry.absence_impact;
  if (entry.expected_hours > 0 && entry.actual_hours === 0) return 'TO_RECOVER';
  if (entry.actual_hours > 0) return 'COUNTED_AS_WORKED';
  return 'NEUTRAL';
}

export function isDayOff(entry: DailyEntry): boolean {
  const reason = reasonOfEntry(entry);
  if (reason) return reason.isDayOff;
  return Boolean(entry.status_code && DAY_OFF_STATUS_CODES.has(entry.status_code));
}

export function auditDetail(log: AuditLogItem): string {
  const values = (log.new_values ?? log.old_values) as Record<string, unknown> | null;
  if (!values || typeof values !== 'object') return '';
  const parts: string[] = [];
  if (typeof values.entry_date === 'string') parts.push(formatDateFrench(values.entry_date));
  if (typeof values.year_month === 'string') parts.push(formatMonthLabel(values.year_month));
  if (typeof values.label === 'string') parts.push(values.label);
  if (typeof values.reg_date === 'string') parts.push(formatDateFrench(values.reg_date));
  if (typeof values.amount_hours === 'number') parts.push(formatDuration(values.amount_hours));
  return parts.join(' • ');
}
