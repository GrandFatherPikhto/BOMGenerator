// /api/auth routes: sign in and out against the users from `auth.json`.
//
// Passwords are compared with scrypt; a request for an unknown user still pays
// for one hash comparison, so the response time does not reveal whether the
// name exists. Login attempts are limited in memory (no dependencies).
import { randomBytes } from 'node:crypto';

import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler.js';
import { findUser, isAuthEnabled } from '../lib/authConfig.js';
import { badRequest, tooManyRequests, unauthorized } from '../lib/httpError.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { clearSessionCookie, currentUser, setSessionCookie } from '../lib/session.js';

const router = Router();

// Hash of a random string: only used to burn the same time as a real check.
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_TRACKED_IPS = 1000;
const attempts = new Map();

/** `true` while the caller is under the limit; the window slides on first hit. */
function underRateLimit(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    if (attempts.size >= MAX_TRACKED_IPS) {
      for (const [key, value] of attempts) {
        if (value.resetAt <= now) {
          attempts.delete(key);
        }
      }
    }
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
}

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    if (!isAuthEnabled()) {
      throw badRequest('Authentication is disabled');
    }
    if (!underRateLimit(req.ip ?? 'unknown')) {
      throw tooManyRequests();
    }

    const username = typeof req.body?.username === 'string' ? req.body.username : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) {
      throw badRequest('username and password are required');
    }

    const user = findUser(username);
    const ok = user ? verifyPassword(password, user.hash) : verifyPassword(password, DUMMY_HASH);
    if (!user || !ok) {
      throw unauthorized('Invalid credentials');
    }

    setSessionCookie(res, user.username);
    res.json({ authEnabled: true, username: user.username });
  }),
);

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

/**
 * Who am I? Always `200` so the client can tell "authentication is off" from
 * "authentication is on and I am not signed in".
 */
router.get('/me', (req, res) => {
  res.json({
    authEnabled: isAuthEnabled(),
    username: currentUser(req)?.username ?? null,
  });
});

export default router;
