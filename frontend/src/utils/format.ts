/**
 * Mise en forme des durées. Les heures sont manipulées en décimal (4.25 = 4 h 15)
 * et toujours affichées en heures et minutes, y compris sur les documents
 * transmis à l'employeur.
 */

function splitHours(hoursDecimal: number): { negative: boolean; h: number; m: number } {
  const negative = hoursDecimal < 0;
  const abs = Math.abs(hoursDecimal);
  let h = Math.floor(abs);
  let m = Math.round((abs - h) * 60);
  if (m >= 60) {
    h += 1;
    m = 0;
  }
  return { negative, h, m };
}

/** « 4 h », « 4 h 15 » (sans signe). */
export function formatDuration(hoursDecimal: number): string {
  const { h, m } = splitHours(hoursDecimal);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** « +1 h 30 », « -2 h », « 0 h » : écart signé. */
export function formatSignedDuration(hoursDecimal: number): string {
  if (Math.abs(hoursDecimal) < 0.005) return '0 h';
  return `${hoursDecimal > 0 ? '+' : '-'}${formatDuration(hoursDecimal)}`;
}

/** « + 4 h 00 », « - 1 h 30 » : affichage des compteurs. */
export function formatHours(hoursDecimal: number): string {
  if (Math.abs(hoursDecimal) < 0.005) return '0 h 00';
  const { negative, h, m } = splitHours(hoursDecimal);
  return `${negative ? '-' : '+'} ${h} h ${String(m).padStart(2, '0')}`;
}

/** Saisie du planning : « 88h », « 46h39 », « 0h ». */
export function formatPlanningHours(hoursDecimal: number): string {
  if (Math.abs(hoursDecimal) < 0.005) return '0h';
  const { negative, h, m } = splitHours(hoursDecimal);
  return `${negative ? '-' : ''}${h}h${m === 0 ? '' : String(m).padStart(2, '0')}`;
}

/**
 * Lit une saisie d'heures : « 88 », « 88h », « 46h39 », « 46:39 », « 46,5 ».
 * Renvoie NaN si la saisie n'est pas un nombre d'heures valide (« 5abc »).
 */
export function parsePlanningHours(input: string | number): number {
  if (typeof input === 'number') return input;
  const clean = (input || '').trim().toLowerCase().replace(/\s+/g, '').replace(',', '.');
  if (clean === '') return NaN;
  const hm = /^(\d+)(?:[h:](\d{0,2}))?$/.exec(clean);
  if (hm) {
    const minutes = hm[2] ? Number(hm[2]) : 0;
    if (minutes >= 60) return NaN;
    return Math.round((Number(hm[1]) + minutes / 60) * 100) / 100;
  }
  if (/^\d+(\.\d+)?$/.test(clean)) {
    return Math.round(Number(clean) * 100) / 100;
  }
  return NaN;
}
