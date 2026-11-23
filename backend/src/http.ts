import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Erreur destinée au client : son message est affiché tel quel.
 * Toute autre erreur est journalisée côté serveur et remplacée par un message générique.
 */
export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (message: string) => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

/** Enveloppe un gestionnaire asynchrone pour transmettre ses erreurs au gestionnaire global. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Identifiant de l'utilisateur connecté. Ne retombe jamais sur un compte par défaut. */
export function requireUserId(req: Request): number {
  if (!req.user) {
    throw new HttpError(401, 'Non authentifié. Veuillez vous connecter.');
  }
  return req.user.id;
}

// ----------------------------------------------------------------------------
// Validation des entrées
// ----------------------------------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Vraie date du calendrier au format AAAA-MM-JJ (refuse 2026-13-45 ou 2026-02-30). */
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function isValidYearMonth(value: unknown): value is string {
  if (typeof value !== 'string' || !YEAR_MONTH_RE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

export function isValidColor(value: unknown): value is string {
  return typeof value === 'string' && COLOR_RE.test(value);
}

export function requireDate(value: unknown, label: string): string {
  if (!isValidDate(value)) {
    throw badRequest(`${label} est invalide (date réelle au format AAAA-MM-JJ attendue).`);
  }
  return value;
}

export function requireYearMonth(value: unknown, label: string): string {
  if (!isValidYearMonth(value)) {
    throw badRequest(`${label} est invalide (format AAAA-MM attendu).`);
  }
  return value;
}

export function optionalTime(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (!isValidTime(value)) {
    throw badRequest(`${label} est invalide (format HH:mm attendu).`);
  }
  return value;
}

/**
 * Convertit une valeur en nombre fini compris entre min et max.
 * Refuse les chaînes partiellement numériques (« 5abc ») que parseFloat acceptait.
 */
export function requireNumber(value: unknown, label: string, min: number, max: number): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(num) || num < min || num > max) {
    throw badRequest(`${label} doit être un nombre compris entre ${min} et ${max}.`);
  }
  return num;
}

export function optionalNumber(value: unknown, label: string, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  return requireNumber(value, label, min, max);
}

export function requireInteger(value: unknown, label: string, min: number, max: number): number {
  const num = requireNumber(value, label, min, max);
  if (!Number.isInteger(num)) {
    throw badRequest(`${label} doit être un nombre entier.`);
  }
  return num;
}

export function requireString(value: unknown, label: string, maxLength: number, minLength = 1): string {
  if (typeof value !== 'string') {
    throw badRequest(`${label} est obligatoire.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    throw badRequest(`${label} est obligatoire.`);
  }
  if (trimmed.length > maxLength) {
    throw badRequest(`${label} ne doit pas dépasser ${maxLength} caractères.`);
  }
  return trimmed;
}

export function optionalString(value: unknown, label: string, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw badRequest(`${label} doit être un texte.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw badRequest(`${label} ne doit pas dépasser ${maxLength} caractères.`);
  }
  return trimmed === '' ? null : trimmed;
}

export function requireId(value: unknown, label = 'Identifiant'): number {
  return requireInteger(value, label, 1, Number.MAX_SAFE_INTEGER);
}

export function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw badRequest(`${label} doit valoir : ${allowed.join(', ')}.`);
  }
  return value as T;
}

/** Date du jour en heure locale du serveur (fuseau défini par TZ). */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function localYearMonth(now: Date = new Date()): string {
  return localToday(now).slice(0, 7);
}
