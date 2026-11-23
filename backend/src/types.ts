export type AccountingRule = 'MAINTAINED' | 'NEUTRAL' | 'DEDUCTED' | 'VARIABLE' | 'CUSTOM';

export type CounterType = 'POSITIVE' | 'NEGATIVE';

export type OperationType = 'SETTLE' | 'ADD';

export type ActionType = 'INSERT' | 'UPDATE' | 'DELETE' | 'REGULARIZE' | 'RESTORE';

/** Impact d'une absence sur les compteurs, choisi par l'utilisateur dans le formulaire. */
export type AbsenceImpact = 'NEUTRAL' | 'TO_RECOVER' | 'COUNTED_AS_WORKED';
export const ABSENCE_IMPACTS: readonly AbsenceImpact[] = ['NEUTRAL', 'TO_RECOVER', 'COUNTED_AS_WORKED'];
export const ACCOUNTING_RULES: readonly AccountingRule[] = ['MAINTAINED', 'NEUTRAL', 'DEDUCTED', 'VARIABLE', 'CUSTOM'];

export interface User {
  id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  must_change_password: boolean;
  created_at?: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      user?: User;
    }
  }
}

export interface StatusCatalogItem {
  id: number;
  code: string;
  label: string;
  color_hex: string;
  accounting_rule: AccountingRule;
  is_default_absence: number;
  is_system: number;
  display_order: number;
  created_at?: string;
}

export interface DailyEntry {
  id: number;
  entry_date: string; // 'YYYY-MM-DD'
  expected_hours: number;
  start_time: string | null; // 'HH:mm'
  end_time: string | null; // 'HH:mm'
  break_minutes: number;
  actual_hours: number;
  manual_actual_override: number; // 0 or 1
  status_id: number | null;
  period_id: number | null;
  is_override: number; // 0 or 1
  absence_reason: string | null;
  absence_impact: AbsenceImpact | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  // Computed / joined fields
  delta_hours?: number;
  status_label?: string;
  status_color?: string;
  status_code?: string;
  accounting_rule?: AccountingRule;
  period_label?: string;
}

export interface Period {
  id: number;
  label: string;
  start_date: string; // 'YYYY-MM-DD'
  end_date: string; // 'YYYY-MM-DD'
  status_id: number | null;
  color_hex: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  status_label?: string;
  status_color?: string;
}

export interface Regularization {
  id: number;
  reg_date: string;
  counter_type: CounterType;
  operation_type?: OperationType;
  amount_hours: number;
  reason: string;
  created_at?: string;
}

export interface MonthlyTarget {
  id: number;
  year_month: string; // 'YYYY-MM'
  target_hours: number;
  notes: string | null;
  is_validated: number;
  validated_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AuditLog {
  id: number;
  entity_name: string;
  entity_id: number;
  action_type: ActionType;
  old_values: any;
  new_values: any;
  reason: string | null;
  undone_at: string | null;
  reverts_log_id: number | null;
  created_at: string;
}

export interface MonthSummary {
  year_month: string;
  target_hours: number;
  expected_hours: number;
  actual_hours: number;
  delta_hours: number;
  positive_delta: number;
  negative_delta: number;
  is_validated: boolean;
  validated_at: string | null;
}

export interface GlobalCockpitSummary {
  total_positive_balance: number; // Solde net heures supplémentaires dues par la collectivité
  total_negative_balance: number; // Solde net heures à rattraper dues à la collectivité
  gross_positive_hours?: number; // Total brut des heures supplémentaires
  gross_negative_hours?: number; // Total brut des heures à rattraper
  current_month: MonthSummary;
  days_counts: {
    above_quota: number; // Jours avec heures en plus (+)
    below_quota: number; // Jours avec heures en moins (-)
    exact_quota: number;
    zero_or_absent: number;
    total_days: number;
  };
}

export interface AnnualMonthItem {
  year_month: string;
  month_name: string;
  target_hours: number;
  expected_hours: number;
  actual_hours: number;
  delta_hours: number;
  positive_delta: number;
  negative_delta: number;
  worked_days: number;
  absence_days: number;
  is_validated: boolean;
}

export interface AnnualCockpitSummary {
  school_year: string; // e.g. "2026 - 2027"
  start_year: number; // 2026
  end_year: number; // 2027
  start_month: string; // "2026-09"
  end_month: string; // "2027-08"
  annual_contract_hours: number;
  total_worked_hours: number;
  total_expected_hours: number;
  total_target_hours: number;
  remaining_contract_hours: number;
  overtime_contract_hours: number;
  progress_percent: number;
  total_worked_days: number;
  total_absence_days: number;
  total_positive_delta: number;
  total_negative_delta: number;
  months: AnnualMonthItem[];
}
