export type AccountingRule = 'MAINTAINED' | 'NEUTRAL' | 'DEDUCTED' | 'VARIABLE' | 'CUSTOM';
export type CounterType = 'POSITIVE' | 'NEGATIVE';
export type ActionType = 'INSERT' | 'UPDATE' | 'DELETE' | 'REGULARIZE' | 'RESTORE';
export type OperationType = 'SETTLE' | 'ADD';
/** Impact d'une absence sur les compteurs (stocké avec la journée). */
export type AbsenceImpact = 'NEUTRAL' | 'TO_RECOVER' | 'COUNTED_AS_WORKED';

export interface User {
  id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  must_change_password: boolean;
  created_at?: string;
}

export interface SetupStatus {
  needs_setup: boolean;
  registration_open: boolean;
  password_min_length: number;
}

/** Réglages du compte, renvoyés par le serveur (valeurs texte). */
export interface UserSettings {
  habitual_start_time: string;
  habitual_end_time: string;
  habitual_break_minutes: string;
  habitual_expected_hours: string;
  default_monthly_target: string;
  annual_target_hours: string;
  agent_name: string;
  employer_name: string;
  job_title: string;
  manager_phone: string;
  manager_email: string;
}

export interface StatusItem {
  id: number;
  code: string;
  label: string;
  color_hex: string;
  accounting_rule: AccountingRule;
  is_default_absence: number;
  is_system: number;
  display_order: number;
}

export interface DailyEntry {
  id: number;
  entry_date: string;
  expected_hours: number;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  actual_hours: number;
  manual_actual_override: number;
  status_id: number | null;
  period_id: number | null;
  is_override: number;
  absence_reason: string | null;
  absence_impact: AbsenceImpact | null;
  notes: string | null;
  updated_at?: string;
  delta_hours?: number;
  positive_delta?: number;
  negative_delta?: number;
  status_label?: string;
  status_color?: string;
  status_code?: string;
  accounting_rule?: AccountingRule;
  period_label?: string;
}

export interface PeriodItem {
  id: number;
  label: string;
  start_date: string;
  end_date: string;
  status_id: number | null;
  color_hex: string | null;
  notes: string | null;
  status_label?: string;
  status_color?: string;
  days_count?: number;
}

export interface RegularizationItem {
  id: number;
  reg_date: string;
  counter_type: CounterType;
  operation_type?: OperationType;
  amount_hours: number;
  reason: string;
  created_at: string;
}

export interface AuditLogItem {
  id: number;
  entity_name: string;
  entity_id: number;
  action_type: ActionType;
  old_values: unknown;
  new_values: unknown;
  reason: string | null;
  undone_at: string | null;
  reverts_log_id: number | null;
  created_at: string;
}

export interface CockpitSummary {
  total_positive_balance: number;
  total_negative_balance: number;
  gross_positive_hours?: number;
  gross_negative_hours?: number;
  current_month: {
    year_month: string;
    target_hours: number;
    expected_hours: number;
    actual_hours: number;
    delta_hours: number;
    positive_delta: number;
    negative_delta: number;
    is_validated: boolean;
    validated_at: string | null;
  };
  days_counts: {
    above_quota: number;
    below_quota: number;
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
  school_year: string;
  start_year: number;
  end_year: number;
  start_month: string;
  end_month: string;
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

export interface DatabaseStatus {
  integrity: string;
  integrityOk: boolean;
  databaseSizeKb: number;
  walSizeKb: number;
  totalUsers: number;
  totalEntries: number;
  totalRegularizations: number;
  totalPeriods: number;
  totalBackups: number;
  lastBackupDate: string | null;
}

export interface BackupItem {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  isAuto: boolean;
  isSafety: boolean;
}
