/**
 * Service de gestion des notifications de rappel pour Ma Badgeuse
 */

export interface ReminderConfig {
  enabled: boolean;
  mode: 'AFTER_END' | 'CUSTOM_TIME';
  delayMinutes: number; // minutes après la fin de poste (ex: 15, 30)
  time: string; // Heure calculée ou personnalisée (ex: "15:00")
  skipWeekends: boolean;
}

export function computeReminderTimeFromEnd(endTime: string, delayMinutes: number): string {
  const [hStr, mStr] = (endTime || '14:45').split(':').map(Number);
  const totalMin = (hStr || 14) * 60 + (mStr || 45) + delayMinutes;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

export function getStoredReminderConfig(habitualEndTime: string = '14:45'): ReminderConfig {
  try {
    const raw = localStorage.getItem('reminder_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed.enabled),
        mode: parsed.mode || 'AFTER_END',
        delayMinutes: parsed.delayMinutes !== undefined ? parsed.delayMinutes : 15,
        time: parsed.time || computeReminderTimeFromEnd(habitualEndTime, 15),
        skipWeekends: parsed.skipWeekends !== undefined ? parsed.skipWeekends : true
      };
    }
  } catch {}
  return {
    enabled: false,
    mode: 'AFTER_END',
    delayMinutes: 15,
    time: computeReminderTimeFromEnd(habitualEndTime, 15),
    skipWeekends: true
  };
}

export function saveStoredReminderConfig(config: ReminderConfig): void {
  localStorage.setItem('reminder_config', JSON.stringify(config));
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error("Votre navigateur ne supporte pas les notifications.");
  }
  return await Notification.requestPermission();
}

export async function sendSystemNotification(
  title: string,
  body: string,
  tag?: string,
  includeActions: boolean = true
): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const options: any = {
    body,
    icon: '/vite.svg',
    badge: '/vite.svg',
    tag: tag || 'ma-badgeuse-notif',
    requireInteraction: true,
    data: {
      url: '/?quick_badge=today'
    }
  };

  if (includeActions) {
    options.actions = [
      { action: 'quick-badge', title: '⚡ Valider mes 4h' },
      { action: 'open', title: 'Ouvrir' }
    ];
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, options);
        return true;
      }
    }
  } catch (swErr) {
    console.warn('[Notification] Fallback direct Notification:', swErr);
  }

  try {
    const notif = new Notification(title, options);
    notif.onclick = () => {
      window.focus();
      window.location.href = '/?quick_badge=today';
    };
    return true;
  } catch (err) {
    console.warn('[Notification] Erreur Notification directe:', err);
    return false;
  }
}

/**
 * Envoie une notification de test immédiate avec bouton d'action
 */
export async function sendTestNotification(expectedHours: number = 4): Promise<boolean> {
  const perm = await requestNotificationPermission();
  if (perm !== 'granted') {
    throw new Error("L'autorisation pour les notifications a été refusée par votre navigateur.");
  }
  return await sendSystemNotification(
    '🔔 Ma Badgeuse — Test du rappel',
    `N'oubliez pas vos ${expectedHours}h d'aujourd'hui ! Cliquez pour valider en 1 clic.`,
    'test-notif',
    true
  );
}

/**
 * Vérifie si la journée du jour doit déclencher un rappel
 */
export async function checkAndTriggerDailyReminder(
  entries: Array<{ entry_date: string; actual_hours?: number; status_id?: number | null }>,
  habitualSchedule: { startTime: string; endTime: string; expectedHours: number }
): Promise<void> {
  const config = getStoredReminderConfig(habitualSchedule.endTime);
  if (!config.enabled) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Dimanche, 6 = Samedi
  if (config.skipWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
    return; // Pas de rappel le week-end
  }

  // Déterminer l'heure effective de rappel
  const targetTime = config.mode === 'AFTER_END'
    ? computeReminderTimeFromEnd(habitualSchedule.endTime, config.delayMinutes)
    : config.time;

  // Vérifier l'heure courante (ex: "15:05" >= "15:00")
  const currentHH = String(now.getHours()).padStart(2, '0');
  const currentMM = String(now.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHH}:${currentMM}`;
  if (currentTimeStr < targetTime) {
    return; // Pas encore l'heure du rappel
  }

  // Obtenir la date locale du jour
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  // Vérifier si un rappel a déjà été envoyé aujourd'hui
  const lastSent = localStorage.getItem('last_reminder_sent_date');
  if (lastSent === todayStr) {
    return; // Déjà averti aujourd'hui
  }

  // Vérifier si la journée du jour a déjà été enregistrée (pointée ou posée en congé/0h)
  const isAlreadyBadged = entries.some((e) => e.entry_date === todayStr);
  if (isAlreadyBadged) {
    return; // Journée déjà validée, pas besoin de rappel
  }

  // Déclencher le rappel avec action rapide !
  const success = await sendSystemNotification(
    '🕒 Ma Badgeuse — Rappel pointage',
    `Vous n'avez pas encore validé vos heures d'aujourd'hui (${habitualSchedule.startTime} - ${habitualSchedule.endTime}). Cliquez pour valider !`,
    `reminder-${todayStr}`,
    true
  );

  if (success) {
    localStorage.setItem('last_reminder_sent_date', todayStr);
  }
}
