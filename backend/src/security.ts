import { Request, Response, NextFunction } from 'express';
import { HttpError } from './http';
import { SESSION_COOKIE_NAME, SESSION_DURATION_DAYS } from './defaults';

// ----------------------------------------------------------------------------
// En-têtes de sécurité (équivalent minimal de helmet, sans dépendance)
// ----------------------------------------------------------------------------

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // React applique des styles en ligne (largeur des jauges) ; les feuilles restent locales.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

/**
 * Refuse les requêtes d'écriture venant d'une autre origine (protection CSRF en
 * complément du cookie SameSite=Strict). Les requêtes sans en-tête Origin
 * (outils en ligne de commande) restent acceptées : elles n'envoient pas le
 * cookie de session d'un navigateur.
 */
export function sameOriginWrites(allowedOrigins: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (!origin) {
      next();
      return;
    }
    const host = req.headers.host;
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if ((host && originHost === host) || allowedOrigins.includes(origin)) {
      next();
      return;
    }
    next(new HttpError(403, 'Requête refusée : origine non autorisée.'));
  };
}

// ----------------------------------------------------------------------------
// Cookie de session (HttpOnly : illisible par le JavaScript de la page)
// ----------------------------------------------------------------------------

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function cookieIsSecure(req: Request): boolean {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return req.secure;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_DURATION_DAYS * 24 * 60 * 60}`
  ];
  if (cookieIsSecure(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const parts = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (cookieIsSecure(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function readSessionToken(req: Request): string | null {
  return readCookie(req, SESSION_COOKIE_NAME);
}

// ----------------------------------------------------------------------------
// Limitation des essais (force brute)
// ----------------------------------------------------------------------------

interface AttemptEntry {
  count: number;
  firstAt: number;
  lockedUntil: number;
}

/**
 * Compte les échecs par clé sur une fenêtre glissante et bloque la clé pendant
 * `lockMs` une fois `maxFailures` atteint. Les compteurs sont en mémoire : ils
 * repartent à zéro au redémarrage du serveur, ce qui reste acceptable pour une
 * instance unique.
 */
export class AttemptLimiter {
  private entries = new Map<string, AttemptEntry>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly lockMs: number,
    private readonly message: string
  ) {}

  private current(key: string, now: number): AttemptEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.lockedUntil <= now && now - entry.firstAt > this.windowMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  /** Lève une erreur 429 si la clé est bloquée. */
  check(key: string): void {
    const now = Date.now();
    const entry = this.current(key, now);
    if (entry && entry.lockedUntil > now) {
      const minutes = Math.ceil((entry.lockedUntil - now) / 60000);
      throw new HttpError(429, `${this.message} Réessayez dans ${minutes} minute(s).`);
    }
  }

  fail(key: string): void {
    const now = Date.now();
    const entry = this.current(key, now) || { count: 0, firstAt: now, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= this.maxFailures) {
      entry.lockedUntil = now + this.lockMs;
      entry.count = 0;
      entry.firstAt = now;
    }
    this.entries.set(key, entry);
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  clearAll(): void {
    this.entries.clear();
  }
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/** 5 échecs sur un même compte en 15 minutes → compte bloqué 15 minutes. */
export const accountLimiter = new AttemptLimiter(
  5,
  FIFTEEN_MINUTES,
  FIFTEEN_MINUTES,
  'Trop de tentatives de connexion pour ce compte.'
);

/** 20 échecs depuis une même adresse IP en 15 minutes → adresse bloquée 15 minutes. */
export const ipLimiter = new AttemptLimiter(
  20,
  FIFTEEN_MINUTES,
  FIFTEEN_MINUTES,
  'Trop de tentatives depuis cet appareil.'
);

/** Créations de compte : 5 par heure et par adresse IP. */
export const registrationLimiter = new AttemptLimiter(5, 60 * 60 * 1000, 60 * 60 * 1000, 'Trop de créations de compte.');

export function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'inconnue';
}
