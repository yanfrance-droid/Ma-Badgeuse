export type AccountingRule = 'MAINTAINED' | 'NEUTRAL' | 'DEDUCTED' | 'VARIABLE' | 'CUSTOM';
export type CounterType = 'POSITIVE' | 'NEGATIVE';
export type ActionType = 'INSERT' | 'UPDATE' | 'DELETE' | 'REGULARIZE' | 'RESTORE';

export interface User {
  id: number;
  username: string;
  display_name: string;
  created_at?: string;
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
  notes: string | null;
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
}

export type OperationType = 'SETTLE' | 'ADD';

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
  old_values: any;
  new_values: any;
  reason: string | null;
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
