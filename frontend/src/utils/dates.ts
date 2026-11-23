/** Dates en heure LOCALE (jamais via toISOString, qui décale en UTC). */

export const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export function getLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getLocalMonthStr(date: Date = new Date()): string {
  return getLocalDateStr(date).slice(0, 7);
}

/** Année de rentrée : septembre à décembre → année en cours, janvier à août → année précédente. */
export function getCurrentSchoolYearStart(date: Date = new Date()): number {
  return date.getMonth() + 1 >= 9 ? date.getFullYear() : date.getFullYear() - 1;
}

/** « Samedi 21 novembre 2026 » */
export function formatDateFrench(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return `${DAY_NAMES[dateObj.getDay()]} ${d} ${MONTH_NAMES[m - 1].toLowerCase()} ${y}`;
}

/** « Novembre 2026 » */
export function formatMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** « 21/11 » */
export function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

/** Vraie date du calendrier au format AAAA-MM-JJ. */
export function isValidDateStr(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return getLocalDateStr(date) === value;
}
