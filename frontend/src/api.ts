import {
  AbsenceImpact,
  AnnualCockpitSummary,
  AuditLogItem,
  BackupItem,
  CockpitSummary,
  DailyEntry,
  DatabaseStatus,
  PeriodItem,
  RegularizationItem,
  SetupStatus,
  StatusItem,
  User,
  UserSettings
} from './types';

const API_BASE = '/api';

/** Événement émis quand le serveur répond 401 : l'application revient à l'écran de connexion. */
export const UNAUTHENTICATED_EVENT = 'ma-badgeuse:unauthenticated';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

/**
 * Appel à l'API. La session est portée par un cookie HttpOnly envoyé
 * automatiquement par le navigateur : aucun jeton ni code n'est stocké en JavaScript.
 */
async function request<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const init: RequestInit = { method: options.method || 'GET', credentials: 'same-origin', headers: {} };
  if (options.body instanceof FormData) {
    init.body = options.body;
  } else if (options.body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError('Serveur injoignable. Vérifiez votre connexion au réseau.', 0);
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/change-password')) {
    window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
  }
  if (!res.ok || !json || json.success === false) {
    const message = json?.error || json?.message || `Erreur du serveur (${res.status}).`;
    throw new ApiError(message, res.status, json?.code);
  }
  return json as T;
}

const data = async <T>(path: string, options?: { method?: string; body?: unknown }): Promise<T> => (await request<{ data: T }>(path, options)).data;
const enc = encodeURIComponent;

// ================= AUTHENTIFICATION =================

export const apiSetupStatus = () => data<SetupStatus>('/auth/setup-status');

export async function apiLogin(username: string, password: string): Promise<User> {
  return (await data<{ user: User }>('/auth/login', { method: 'POST', body: { username, password } })).user;
}

export async function apiRegister(body: { username: string; displayName: string; password: string }): Promise<User> {
  return (await data<{ user: User }>('/auth/register', { method: 'POST', body })).user;
}

export async function apiGetMe(): Promise<User | null> {
  try {
    return await data<User | null>('/auth/me');
  } catch {
    return null;
  }
}

export async function apiLogout(): Promise<void> {
  try {
    await request('/auth/logout', { method: 'POST' });
  } catch {
    // La session sera de toute façon oubliée côté navigateur au rechargement.
  }
}

export async function apiChangePassword(currentPassword: string, newPassword: string): Promise<string> {
  return (await request<{ message: string }>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } })).message;
}

// ================= ADMINISTRATION =================

export const apiListUsers = () => data<User[]>('/admin/users');
export const apiCreateUser = (body: { username: string; displayName: string; password: string }) =>
  data<User>('/admin/users', { method: 'POST', body });
export const apiResetUserPassword = (id: number) =>
  data<{ user: User; temporary_password: string }>(`/admin/users/${id}/reset-password`, { method: 'POST' });
export const apiSetUserAdmin = (id: number, isAdmin: boolean) => data<User>(`/admin/users/${id}/admin`, { method: 'PUT', body: { is_admin: isAdmin } });
export const apiDeleteUser = (id: number) => request(`/admin/users/${id}`, { method: 'DELETE' });
export const apiGetAdminSettings = () => data<{ registration_open: boolean }>('/admin/settings');
export const apiSetRegistrationOpen = (open: boolean) =>
  data<{ registration_open: boolean }>('/admin/settings', { method: 'PUT', body: { registration_open: open } });

// ================= DONNÉES =================

export const fetchSummary = (month: string) => data<CockpitSummary>(`/summary?month=${enc(month)}`);
export const fetchAnnualSummary = (startYear: number) => data<AnnualCockpitSummary>(`/summary/annual?start_year=${startYear}`);
export const fetchEntries = (month: string) => data<DailyEntry[]>(`/entries?month=${enc(month)}`);

export const saveEntry = (body: {
  entry_date: string;
  expected_hours: number;
  start_time?: string | null;
  end_time?: string | null;
  break_minutes?: number;
  manual_actual_hours?: number | null;
  status_id?: number | null;
  absence_reason?: string | null;
  absence_impact?: AbsenceImpact | null;
  notes?: string | null;
}) => data<DailyEntry>('/entries', { method: 'POST', body });

export const deleteEntry = (date: string) => request(`/entries/${enc(date)}`, { method: 'DELETE' });

export const fetchStatuses = () => data<StatusItem[]>('/status');

export const fetchPeriods = () => data<PeriodItem[]>('/periods');
export const createPeriod = (body: {
  label: string;
  start_date: string;
  end_date: string;
  status_id: number | null;
  notes?: string | null;
  preserve_overrides: boolean;
  skip_weekends?: boolean;
  expected_hours_per_day?: number;
  actual_hours_per_day?: number;
  absence_reason?: string | null;
  absence_impact?: AbsenceImpact | null;
}) => data<{ id: number; days_modified: number }>('/periods', { method: 'POST', body });
export const deletePeriod = (id: number) => request(`/periods/${id}`, { method: 'DELETE' });

export const fetchRegularizations = () => data<RegularizationItem[]>('/regularizations');
export const createRegularization = (body: {
  reg_date: string;
  counter_type: 'POSITIVE' | 'NEGATIVE';
  operation_type: 'SETTLE' | 'ADD';
  amount_hours: number;
  reason: string;
}) => data<RegularizationItem>('/regularizations', { method: 'POST', body });
export const deleteRegularization = (id: number) => request(`/regularizations/${id}`, { method: 'DELETE' });

export const fetchAuditLogs = (limit = 50) => data<AuditLogItem[]>(`/audit?limit=${limit}`);
export const triggerUndo = async () => (await request<{ message: string }>('/audit/undo', { method: 'POST' })).message;

export const updateMonthlyTarget = (yearMonth: string, targetHours: number) =>
  data('/targets', { method: 'POST', body: { year_month: yearMonth, target_hours: targetHours } });
export const validateMonth = (yearMonth: string) => request(`/targets/${enc(yearMonth)}/validate`, { method: 'POST' });
export const unvalidateMonth = (yearMonth: string) => request(`/targets/${enc(yearMonth)}/unvalidate`, { method: 'POST' });

export const fetchSettings = () => data<UserSettings>('/settings');
export const saveSettings = (settings: Partial<UserSettings>) => data<UserSettings>('/settings', { method: 'POST', body: settings });

export const entriesCsvUrl = (month: string) => `${API_BASE}/export/entries.csv?month=${enc(month)}`;

// ================= SAUVEGARDES (administrateurs) =================

export const fetchDatabaseStatus = () => data<DatabaseStatus>('/backup/status');
export const fetchBackupList = () => data<BackupItem[]>('/backup/list');
export const createBackupNow = () => data<{ filename: string }>('/backup/create', { method: 'POST' });
export const restoreBackup = (filename: string) => request<{ message: string }>(`/backup/restore/${enc(filename)}`, { method: 'POST' });
export const triggerOptimizeDatabase = () => request<{ message: string }>('/backup/optimize', { method: 'POST' });
export const triggerResetServerAll = (confirmation: string) =>
  request<{ message: string; safetyBackup: string }>('/backup/reset-server-all', { method: 'POST', body: { confirmation } });
export const backupDownloadUrl = (filename: string) => `${API_BASE}/backup/download/${enc(filename)}`;
export const exportCurrentDatabaseUrl = `${API_BASE}/backup/export-current`;

export function uploadRestoreBackup(file: File) {
  const form = new FormData();
  form.append('database_file', file);
  return request<{ message: string }>('/backup/upload-restore', { method: 'POST', body: form });
}

// ================= REMISE À ZÉRO PERSONNELLE =================

export const triggerResetMyData = (confirmation: string) =>
  request<{ message: string; safetyBackup: string }>('/backup/reset-my-data', { method: 'POST', body: { confirmation } });
