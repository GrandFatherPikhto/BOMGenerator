// Stateless signed session cookie (HMAC-SHA256, no dependencies).
//
// The cookie holds `base64url(JSON{ u, exp })` and its signature, so nothing is
// stored on the server. That is enough for a few people: the only way to revoke
// a session individually is to change the password hash, and rotating
// `SESSION_SECRET` logs everybody out at once.
import { createHmac, timingSafeEqual } from 'node:crypto';

import { isAuthEnabled } from './authConfig.js';
import { unauthorized } from './httpError.js';

export const SESSION_COOKIE = 'bom_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is required when authentication is enabled');
  }
  return secret;
}

/** `Secure` cookies: explicit `COOKIE_SECURE`, else production. */
function secureCookie() {
  if (process.env.COOKIE_SECURE !== undefined) {
    return process.env.COOKIE_SECURE === '1' || process.env.COOKIE_SECURE === 'true';
  }
  return process.env.NODE_ENV === 'production';
}

function signature(payload) {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createSessionToken(username, ttlMs = SESSION_TTL_MS) {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + ttlMs }),
  ).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

/** Verify a token and return `{ username }`, or `null` when it is unusable. */
export function readSessionToken(token) {
  if (typeof token !== 'string') {
    return null;
  }
  const [payload, provided] = token.split('.');
  if (!payload || !provided) {
    return null;
  }
  try {
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(provided);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return null;
    }
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data.u !== 'string' || !Number.isFinite(data.exp)) {
      return null;
    }
    return data.exp > Date.now() ? { username: data.u } : null;
  } catch {
    return null;
  }
}

/** Parse a Cookie header without the `cookie-parser` dependency. */
export function parseCookies(header) {
  const cookies = {};
  if (typeof header !== 'string') {
    return cookies;
  }
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) {
      continue;
    }
    const key = part.slice(0, index).trim();
    if (key) {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return cookies;
}

/** The signed-in user of a request, or `null`. */
export function currentUser(req) {
  return readSessionToken(parseCookies(req?.headers?.cookie)[SESSION_COOKIE]);
}

export function setSessionCookie(res, username, ttlMs = SESSION_TTL_MS) {
  res.cookie(SESSION_COOKIE, createSessionToken(username, ttlMs), {
    httpOnly: true,
    sameSite: 'strict',
    secure: secureCookie(),
    path: '/',
    maxAge: ttlMs,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    secure: secureCookie(),
    path: '/',
  });
}

/**
 * Protect everything behind it. A no-op while authentication is disabled, so the
 * app keeps working (and the tests keep passing) without an `auth.json`.
 */
export function requireAuth(req, res, next) {
  if (!isAuthEnabled()) {
    next();
    return;
  }
  const user = currentUser(req);
  if (!user) {
    next(unauthorized());
    return;
  }
  req.user = { id: user.username };
  next();
}
