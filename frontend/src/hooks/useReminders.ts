import { useEffect, useState } from 'react';
import { notify } from '../components/Toaster';
import { HabitualSchedule, LoadState, errorMessage } from '../domain';
import {
  ReminderConfig,
  checkAndTriggerDailyReminder,
  getStoredReminderConfig,
  requestNotificationPermission,
  saveStoredReminderConfig,
  sendTestNotification
} from '../services/notificationService';

/**
 * Rappel de pointage : réglage mémorisé sur l'appareil, vérification chaque minute
 * et au retour sur l'application tant que la journée du jour n'est pas enregistrée.
 * `todayRecorded` vaut `null` quand le mois affiché n'est pas le mois en cours (inconnu).
 */
export function useReminders(habitualSchedule: HabitualSchedule, todayRecorded: boolean | null, loadState: LoadState) {
  const [reminderConfig, setReminderConfig] = useState<ReminderConfig>(() => getStoredReminderConfig(habitualSchedule.endTime));
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [testingNotification, setTestingNotification] = useState<boolean>(false);

  useEffect(() => {
    if (todayRecorded === null || loadState !== 'ok') return;
    const check = () => checkAndTriggerDailyReminder(todayRecorded, habitualSchedule);
    check();
    const interval = window.setInterval(check, 60 * 1000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [todayRecorded, loadState, habitualSchedule, reminderConfig]);

  const updateReminderConfig = (updated: ReminderConfig) => {
    setReminderConfig(updated);
    saveStoredReminderConfig(updated);
  };

  const handleToggleReminder = async (enabled: boolean) => {
    if (enabled) {
      try {
        const perm = await requestNotificationPermission();
        setNotificationPermission(perm);
        if (perm !== 'granted') {
          notify("L'autorisation des notifications a été refusée par le navigateur.", 'error');
          return;
        }
      } catch (err) {
        notify(`Impossible d'activer les notifications : ${errorMessage(err)}`, 'error');
        return;
      }
    }
    updateReminderConfig({ ...reminderConfig, enabled });
  };

  const handleTestReminder = async () => {
    setTestingNotification(true);
    try {
      await sendTestNotification(habitualSchedule);
      setNotificationPermission('granted');
      notify('Notification de test envoyée.', 'success');
    } catch (err) {
      notify(`Erreur lors du test : ${errorMessage(err)}`, 'error');
    } finally {
      setTestingNotification(false);
    }
  };

  return { reminderConfig, notificationPermission, testingNotification, updateReminderConfig, handleToggleReminder, handleTestReminder };
}
