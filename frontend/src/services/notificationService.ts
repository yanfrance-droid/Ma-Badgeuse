/**
 * Rappels de pointage par notification du navigateur.
 * Les rappels ne fonctionnent que lorsque l'application est ouverte
 * (onglet actif ou en arrière-plan) : il n'y a pas de notification serveur.
 */

import { getLocalDateStr } from '../utils/dates';
import { formatDuration } from '../utils/format';

export interface ReminderConfig {
  enabled: boolean;
  mode: 'AFTER_END' | 'CUSTOM_TIME';
  /** Minutes après la fin de poste (15, 30…). */
  delayMinutes: number;
  /** Heure calculée ou personnalisée (« 15:00 »). */
  time: string;
  skipWeekends: boolean;
}

interface Schedule {
  startTime: string;
  endTime: string;
  expectedHours: number;
}

const STORAGE_KEY = 'reminder_config';
const LAST_SENT_KEY = 'last_reminder_sent_date';
const ICON = '/pwa-192x192.png';

export function computeReminderTimeFromEnd(endTime: string, delayMinutes: number): string {
  const [h, m] = (endTime || '').split(':').map(Number);
  const base = Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 17 * 60;
  const total = base + delayMinutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function getStoredReminderConfig(habitualEndTime: string): ReminderConfig {
  const fallback: ReminderConfig = {
    enabled: false,
    mode: 'AFTER_END',
    delayMinutes: 15,
    time: computeReminderTimeFromEnd(habitualEndTime, 15),
    skipWeekends: true
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ReminderConfig>;
    return {
      enabled: Boolean(parsed.enabled),
      mode: parsed.mode === 'CUSTOM_TIME' ? 'CUSTOM_TIME' : 'AFTER_END',
      delayMinutes: parsed.delayMinutes ?? fallback.delayMinutes,
      time: parsed.time || fallback.time,
      skipWeekends: parsed.skipWeekends ?? true
    };
  } catch {
    return fallback;
  }
}

export function saveStoredReminderConfig(config: ReminderConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Stockage indisponible (navigation privée) : le réglage ne sera pas mémorisé.
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error('Votre navigateur ne prend pas en charge les notifications.');
  }
  return Notification.requestPermission();
}

/**
 * Affiche une notification ; un clic ouvre l'application sur le formulaire du jour.
 * Sur Android, Chrome n'accepte que les notifications passant par le service worker
 * (`sw.js` gère le clic) ; `new Notification` reste le repli des ordinateurs.
 */
async function showNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) {
      await registration.showNotification(title, { body, icon: ICON, tag, data: { url: '/?quick_badge=today' } });
      return true;
    }
    const notif = new Notification(title, { body, icon: ICON, tag });
    notif.onclick = () => {
      window.focus();
      window.location.href = '/?quick_badge=today';
    };
    return true;
  } catch {
    // Sans service worker (HTTP sur le réseau local), Android refuse la notification.
    return false;
  }
}

export async function sendTestNotification(schedule: Schedule): Promise<void> {
  const perm = await requestNotificationPermission();
  if (perm !== 'granted') {
    throw new Error("L'autorisation pour les notifications a été refusée par votre navigateur.");
  }
  const shown = await showNotification(
    'Ma Badgeuse — Test du rappel',
    `Rappel : pensez à pointer vos ${formatDuration(schedule.expectedHours)} (${schedule.startTime} - ${schedule.endTime}).`,
    'test-notif'
  );
  if (!shown) {
    throw new Error(
      "Ce navigateur n'a pas pu afficher la notification. Sur Android, les notifications demandent un accès en HTTPS."
    );
  }
}

/**
 * Déclenche le rappel du jour si l'heure est passée, que la journée n'est pas
 * encore pointée et qu'aucun rappel n'a déjà été envoyé aujourd'hui.
 * `todayRecorded` doit être calculé sur les données du mois en cours.
 */
export async function checkAndTriggerDailyReminder(todayRecorded: boolean, schedule: Schedule): Promise<void> {
  const config = getStoredReminderConfig(schedule.endTime);
  if (!config.enabled || todayRecorded) return;

  const now = new Date();
  const day = now.getDay();
  if (config.skipWeekends && (day === 0 || day === 6)) return;

  const target = config.mode === 'AFTER_END' ? computeReminderTimeFromEnd(schedule.endTime, config.delayMinutes) : config.time;
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (current < target) return;

  const today = getLocalDateStr(now);
  try {
    if (localStorage.getItem(LAST_SENT_KEY) === today) return;
  } catch {
    return;
  }

  const shown = await showNotification(
    'Ma Badgeuse — Rappel de pointage',
    `Vous n'avez pas encore enregistré votre journée (${schedule.startTime} - ${schedule.endTime}).`,
    `reminder-${today}`
  );
  if (shown) {
    try {
      localStorage.setItem(LAST_SENT_KEY, today);
    } catch {
      // Sans stockage, le rappel pourra se répéter : sans conséquence sur les données.
    }
  }
}
