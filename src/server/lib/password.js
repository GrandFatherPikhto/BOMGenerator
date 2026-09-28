// Password hashing with the built-in scrypt KDF — no external dependencies.
//
// The stored value is self-describing so the parameters can change later:
//   scrypt$N$r$p$<salt base64url>$<key base64url>
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'scrypt';
const DEFAULT_PARAMS = { N: 16384, r: 8, p: 1, keyLength: 64 };
const SALT_BYTES = 16;

/** scrypt needs 128 * N * r bytes; ask for some headroom. */
function maxmemFor(N, r) {
  return 128 * N * r * 2;
}

/** Hash a plain-text password into the storable `scrypt$…` string. */
export function hashPassword(password, params = {}) {
  const { N, r, p, keyLength } = { ...DEFAULT_PARAMS, ...params };
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(String(password), salt, keyLength, {
    N,
    r,
    p,
    maxmem: maxmemFor(N, r),
  });
  return [ALGORITHM, N, r, p, salt.toString('base64url'), key.toString('base64url')].join(
    '$',
  );
}

/**
 * Verify a password against a stored hash. Any malformed or foreign value
 * returns `false` instead of throwing, so a broken `auth.json` cannot crash the
 * login route.
 */
export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') {
    return false;
  }
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== ALGORITHM) {
    return false;
  }
  const [, N, r, p, saltText, keyText] = parts;
  const cost = { N: Number(N), r: Number(r), p: Number(p) };
  if (
    !Number.isInteger(cost.N) ||
    cost.N < 2 ||
    !Number.isInteger(cost.r) ||
    cost.r < 1 ||
    !Number.isInteger(cost.p) ||
    cost.p < 1
  ) {
    return false;
  }
  const expected = Buffer.from(keyText, 'base64url');
  if (expected.length === 0) {
    return false;
  }
  try {
    const actual = scryptSync(password, Buffer.from(saltText, 'base64url'), expected.length, {
      ...cost,
      maxmem: maxmemFor(cost.N, cost.r),
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
