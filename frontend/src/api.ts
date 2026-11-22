import { CockpitSummary, DailyEntry, PeriodItem, RegularizationItem, StatusItem, AuditLogItem, AnnualCockpitSummary, User } from './types';

const API_BASE = '/api';
const AUTH_TOKEN_KEY = 'ma_badgeuse_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getStoredToken();
  const adminPin = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('admin_pin') : null;
  const headers = new Headers(init?.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (adminPin && !headers.has('x-admin-pin')) {
    headers.set('x-admin-pin', adminPin);
  }
  return fetch(input, {
    ...init,
    headers
  });
}

// ================= AUTHENTICATION APIS =================

export async function apiLogin(username: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Erreur de connexion');
  setStoredToken(json.data.token);
  return json.data;
}

export async function apiRegister(data: {
  username: string;
  displayName: string;
  password: string;
  securityQuestion: string;
  securityAnswer: string;
}): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Erreur lors de la création du compte');
  setStoredToken(json.data.token);
  return json.data;
}

export async function apiGetMe(): Promise<User | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await authFetch(`${API_BASE}/auth/me`);
    const json = await res.json();
    if (!json.success || !json.data) {
      setStoredToken(null);
      return null;
    }
    return json.data?.user || json.data;
  } catch {
    return null;
  }
}

export async function apiLogout(): Promise<void> {
  try {
    await authFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
  } catch {
    // Ignore error
  } finally {
    setStoredToken(null);
  }
}

export async function apiGetSecurityQuestion(username: string): Promise<{ username: string; display_name: string; security_question: string }> {
  const res = await fetch(`${API_BASE}/auth/security-question?username=${encodeURIComponent(username)}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Utilisateur introuvable');
  return json.data;
}

export async function apiResetPassword(data: {
  username: string;
  securityAnswer: string;
  newPassword: string;
}): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Erreur lors de la réinitialisation');
  setStoredToken(json.data.token);
  return json.data;
}

export async function apiListUsers(): Promise<User[]> {
  try {
    const res = await fetch(`${API_BASE}/auth/users`);
    const json = await res.json();
    if (!json.success) return [];
    return json.data;
  } catch {
    return [];
  }
}

export async function apiVerifyAdminPin(pin: string): Promise<boolean> {
  const res = await authFetch(`${API_BASE}/auth/verify-admin-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Code PIN administrateur incorrect');
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('admin_pin', pin);
  }
  return true;
}

export async function apiChangeAdminPin(oldPin: string, newPin: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/auth/change-admin-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPin, newPin })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Erreur lors de la modification du code PIN');
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('admin_pin', newPin);
  }
}

export async function apiDeleteUser(userId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/auth/users/${userId}`, {
    method: 'DELETE'
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Erreur lors de la suppression du compte');
}

// ================= DATA APIS =================

export async function fetchSummary(month?: string): Promise<CockpitSummary> {
  const url = month ? `${API_BASE}/summary?month=${month}` : `${API_BASE}/summary`;
  const res = await authFetch(url);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Erreur lors du chargement du cockpit');
  return json.data;
}

export async function fetchEntries(month: string): Promise<DailyEntry[]> {
  const res = await authFetch(`${API_BASE}/entries?month=${month}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Erreur lors du chargement des pointages');
  return json.data;
}

export async function fetchEntryByDate(date: string): Promise<DailyEntry | null> {
  const res = await authFetch(`${API_BASE}/entries/${date}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function saveEntry(data: {
  entry_date: string;
  expected_hours: number;
  start_time?: string | null;
  end_time?: string | null;
  break_minutes?: number;
  manual_actual_hours?: number | null;
  status_id?: number | null;
  notes?: string | null;
  audit_reason?: string;
}): Promise<DailyEntry> {
  const res = await authFetch(`${API_BASE}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Erreur lors de l'enregistrement");
  return json.data;
}

export async function deleteEntry(date: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/entries/${date}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

export async function fetchStatuses(): Promise<StatusItem[]> {
  const res = await authFetch(`${API_BASE}/status`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function updateStatus(id: number, data: Partial<StatusItem>): Promise<StatusItem> {
  const res = await authFetch(`${API_BASE}/status/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function createStatus(data: {
  code: string;
  label: string;
  color_hex: string;
  accounting_rule: string;
}): Promise<StatusItem> {
  const res = await authFetch(`${API_BASE}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function fetchPeriods(): Promise<PeriodItem[]> {
  const res = await authFetch(`${API_BASE}/periods`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function checkPeriodConflicts(start_date: string, end_date: string): Promise<{
  has_conflicts: boolean;
  conflicted_days: Array<{
    entry_date: string;
    expected_hours: number;
    actual_hours: number;
    status_label?: string;
  }>;
}> {
  const res = await authFetch(`${API_BASE}/periods/check-conflicts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_date, end_date })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json;
}

export async function createPeriod(data: {
  label: string;
  start_date: string;
  end_date: string;
  status_id: number | null;
  color_hex?: string | null;
  notes?: string | null;
  preserve_overrides: boolean;
  skip_weekends?: boolean;
  expected_hours_per_day?: number;
  actual_hours_per_day?: number;
}): Promise<any> {
  const res = await authFetch(`${API_BASE}/periods`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function deletePeriod(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/periods/${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

export async function fetchRegularizations(counter_type?: string): Promise<RegularizationItem[]> {
  const url = counter_type ? `${API_BASE}/regularizations?counter_type=${counter_type}` : `${API_BASE}/regularizations`;
  const res = await authFetch(url);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function createRegularization(data: {
  reg_date: string;
  counter_type: 'POSITIVE' | 'NEGATIVE';
  operation_type?: 'SETTLE' | 'ADD';
  amount_hours: number;
  reason: string;
}): Promise<RegularizationItem> {
  const res = await authFetch(`${API_BASE}/regularizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function deleteRegularization(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/regularizations/${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
}

export async function fetchAuditLogs(limit: number = 50): Promise<AuditLogItem[]> {
  const res = await authFetch(`${API_BASE}/audit?limit=${limit}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function triggerUndo(): Promise<{ success: boolean; message: string }> {
  const res = await authFetch(`${API_BASE}/audit/undo`, { method: 'POST' });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || json.error);
  return json;
}

export async function updateMonthlyTarget(year_month: string, target_hours: number, notes?: string): Promise<any> {
  const res = await authFetch(`${API_BASE}/targets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year_month, target_hours, notes })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function validateMonth(year_month: string): Promise<any> {
  const res = await authFetch(`${API_BASE}/targets/${year_month}/validate`, { method: 'POST' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function unvalidateMonth(year_month: string): Promise<any> {
  const res = await authFetch(`${API_BASE}/targets/${year_month}/unvalidate`, { method: 'POST' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function createBackupNow(): Promise<any> {
  const res = await authFetch(`${API_BASE}/backup/create`, { method: 'POST' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function fetchBackupList(): Promise<any[]> {
  const res = await authFetch(`${API_BASE}/backup/list`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function restoreBackup(filename: string): Promise<any> {
  const res = await authFetch(`${API_BASE}/backup/restore/${filename}`, { method: 'POST' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json;
}

export async function fetchDatabaseStatus(): Promise<{
  integrity: string;
  databaseSizeKb: number;
  walSizeKb: number;
  totalEntries: number;
  totalRegularizations: number;
  totalPeriods: number;
  totalBackups: number;
  lastBackupDate: string | null;
}> {
  const res = await authFetch(`${API_BASE}/backup/status`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function triggerOptimizeDatabase(): Promise<{ success: boolean; message: string }> {
  const res = await authFetch(`${API_BASE}/backup/optimize`, { method: 'POST' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json;
}

export async function triggerResetDatabase(confirmation: string): Promise<{ success: boolean; message: string; safetyBackup: string }> {
  const res = await authFetch(`${API_BASE}/backup/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Échec de la remise à zéro");
  return json;
}

export async function triggerResetMyData(confirmation: string): Promise<{ success: boolean; message: string; safetyBackup: string }> {
  const res = await authFetch(`${API_BASE}/backup/reset-my-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Échec de la remise à zéro de votre espace");
  return json;
}

export async function triggerResetServerAll(confirmation: string): Promise<{ success: boolean; message: string; safetyBackup: string }> {
  const res = await authFetch(`${API_BASE}/backup/reset-server-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Échec de la remise à zéro du serveur");
  return json;
}

export async function uploadRestoreBackup(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('database_file', file);
  const res = await authFetch(`${API_BASE}/backup/upload-restore`, {
    method: 'POST',
    body: formData
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json;
}

export async function fetchSettings(): Promise<Record<string, string>> {
  try {
    const res = await authFetch(`${API_BASE}/settings`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  } catch {
    return {
      habitual_start_time: '10:45',
      habitual_end_time: '14:45',
      habitual_break_minutes: '0',
      habitual_expected_hours: '4.0'
    };
  }
}

export async function saveSettings(settings: Record<string, string>): Promise<Record<string, string>> {
  const res = await authFetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export async function fetchAnnualSummary(startYear?: number): Promise<AnnualCockpitSummary> {
  const url = startYear ? `${API_BASE}/summary/annual?start_year=${startYear}` : `${API_BASE}/summary/annual`;
  const res = await authFetch(url);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Erreur lors du chargement du bilan annuel');
  return json.data;
}

export async function saveAnnualTarget(hours: number): Promise<Record<string, string>> {
  return saveSettings({ annual_target_hours: String(hours) });
}
