/**
 * Valeurs par défaut de l'application, définies en un seul endroit.
 * Le frontend ne les recopie pas : il lit les réglages renvoyés par /api/settings.
 */

/** Réglages propres à chaque compte, avec leur valeur par défaut. */
export const DEFAULT_USER_SETTINGS = {
  habitual_start_time: '10:45',
  habitual_end_time: '14:45',
  habitual_break_minutes: '0',
  habitual_expected_hours: '4',
  default_monthly_target: '120',
  annual_target_hours: '800',
  agent_name: '',
  employer_name: '',
  job_title: '',
  manager_phone: '',
  manager_email: ''
} as const;

export type UserSettingKey = keyof typeof DEFAULT_USER_SETTINGS;

/** Réglages globaux du serveur (table app_settings). */
export const DEFAULT_APP_SETTINGS: Record<string, string> = {
  app_title: 'Ma Badgeuse',
  // Après la création du premier compte, l'inscription libre est fermée :
  // l'administrateur crée les comptes ou rouvre l'inscription depuis l'interface.
  registration_open: '0'
};

export const PASSWORD_MIN_LENGTH = 10;

/** Durée de validité d'une session, prolongée à chaque utilisation. */
export const SESSION_DURATION_DAYS = 30;

export const SESSION_COOKIE_NAME = 'mb_session';
