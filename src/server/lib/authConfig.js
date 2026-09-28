// Users of the JSON auth config (`auth.json`). Meant for a handful of people:
// the file is edited by hand, there is no admin panel and no database table.
//
// The file is re-read when its mtime changes, so an edit applies immediately
// without restarting the server. When the file is missing or has no usable
// users, authentication is disabled and the app runs in open mode.
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_AUTH_FILE = 'auth.json';

let cache = { mtimeMs: -1, users: [] };

/** Absolute path of the auth file (`AUTH_FILE` env, `./auth.json` by default). */
export function authFilePath() {
  return path.resolve(process.env.AUTH_FILE || DEFAULT_AUTH_FILE);
}

/** Drop the mtime cache (used by the tests when they rewrite the file). */
export function resetAuthCache() {
  cache = { mtimeMs: -1, users: [] };
}

function parseUsers(raw, file) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error.message}`, { cause: error });
  }
  const users = Array.isArray(parsed) ? parsed : parsed?.users;
  if (!Array.isArray(users)) {
    throw new Error(`${file} must contain a "users" array`);
  }
  return users
    .filter(
      (user) =>
        user && typeof user.username === 'string' && typeof user.hash === 'string',
    )
    .map((user) => ({ username: user.username, hash: user.hash }));
}

/** The configured users (cached by mtime); `[]` when there is no file. */
export function loadUsers() {
  const file = authFilePath();
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    cache = { mtimeMs: -1, users: [] };
    return [];
  }
  if (stat.mtimeMs === cache.mtimeMs) {
    return cache.users;
  }
  const users = parseUsers(fs.readFileSync(file, 'utf8'), file);
  cache = { mtimeMs: stat.mtimeMs, users };
  return users;
}

/** Is there anybody to authenticate against? */
export function isAuthEnabled() {
  return loadUsers().length > 0;
}

/** Find a user by name (case-sensitive). */
export function findUser(username) {
  return loadUsers().find((user) => user.username === username) ?? null;
}
