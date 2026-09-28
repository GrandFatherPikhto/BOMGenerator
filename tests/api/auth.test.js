// JSON-config authentication: open mode without users, mandatory session with
// users, login/logout, cookie tampering, per-user UI state and the login limit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { resetAuthCache } from '../../src/server/lib/authConfig.js';
import { hashPassword } from '../../src/server/lib/password.js';
import { connectTestDb, disconnectTestDb, prepareApp } from './helpers.js';

// The auth file lives outside the repository so a test can never pick up (or
// overwrite) a developer's local `auth.json`.

const PASSWORD = 'correct horse battery staple';
const SECOND_PASSWORD = 'another secret';
const HASH = hashPassword(PASSWORD, { N: 1024 });
const SECOND_HASH = hashPassword(SECOND_PASSWORD, { N: 1024 });

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bom-auth-'));
const authFile = path.join(tmpDir, 'auth.json');

let app;

before(connectTestDb);
after(async () => {
  await disconnectTestDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeUsers(users) {
  fs.writeFileSync(authFile, JSON.stringify({ users }));
  resetAuthCache();
}

/** Cookie name=value pair out of a response, for the next request. */
function sessionCookie(response) {
  const raw = response.headers['set-cookie'] ?? [];
  const cookie = raw.find((value) => value.startsWith('bom_session='));
  return cookie ? cookie.split(';')[0] : null;
}

beforeEach(async () => {
  // `prepareApp` disables auth unless it is given a file to use.
  writeUsers([{ username: 'denis', hash: HASH }]);
  app = await prepareApp({ authFile });
});

test('without users the API stays open and /auth/me says so', async () => {
  fs.rmSync(authFile, { force: true });
  resetAuthCache();

  const me = await request(app).get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, { authEnabled: false, username: null });
  assert.equal((await request(app).get('/api/boards')).status, 200);
});

test('with users a protected route requires a session', async () => {
  const response = await request(app).get('/api/boards');
  assert.equal(response.status, 401);
  assert.match(response.body.error, /Authentication required/);
});

test('a tampered cookie is rejected', async () => {
  const response = await request(app)
    .get('/api/boards')
    .set('Cookie', 'bom_session=not-a-real-token');
  assert.equal(response.status, 401);
});

test('login rejects a wrong password and an unknown user', async () => {
  const wrong = await request(app)
    .post('/api/auth/login')
    .send({ username: 'denis', password: 'nope' });
  assert.equal(wrong.status, 401);

  const unknown = await request(app)
    .post('/api/auth/login')
    .send({ username: 'nobody', password: PASSWORD });
  assert.equal(unknown.status, 401);
});

test('login with the right password opens the API', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'denis', password: PASSWORD });
  assert.equal(login.status, 200);
  assert.deepEqual(login.body, { authEnabled: true, username: 'denis' });

  const cookie = sessionCookie(login);
  assert.ok(cookie, 'a session cookie must be set');

  const boards = await request(app).get('/api/boards').set('Cookie', cookie);
  assert.equal(boards.status, 200);

  const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
  assert.deepEqual(me.body, { authEnabled: true, username: 'denis' });
});

test('the login route is unavailable while authentication is disabled', async () => {
  fs.rmSync(authFile, { force: true });
  resetAuthCache();

  const response = await request(app)
    .post('/api/auth/login')
    .send({ username: 'denis', password: PASSWORD });
  assert.equal(response.status, 400);
});

test('logout clears the cookie on the client', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'denis', password: PASSWORD });
  const cookie = sessionCookie(login);

  const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie);
  assert.equal(logout.status, 204);
  const cleared = logout.headers['set-cookie']?.[0] ?? '';
  assert.match(cleared, /bom_session=;/);
});

test('the UI state is kept per user', async () => {
  writeUsers([
    { username: 'denis', hash: HASH },
    { username: 'guest', hash: SECOND_HASH },
  ]);

  const denisLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'denis', password: PASSWORD });
  const denis = sessionCookie(denisLogin);

  const guestLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'guest', password: SECOND_PASSWORD });
  const guest = sessionCookie(guestLogin);

  await request(app)
    .patch('/api/ui-state')
    .set('Cookie', denis)
    .send({ sections: { purchases: { boardId: 'b1' } } });

  const denisState = await request(app).get('/api/ui-state').set('Cookie', denis);
  assert.deepEqual(denisState.body.sections.purchases, { boardId: 'b1' });

  const guestState = await request(app).get('/api/ui-state').set('Cookie', guest);
  assert.deepEqual(guestState.body.sections, {});
});

// Kept last: the limiter is module state shared by the whole file.
test('repeated failed logins are rate limited', async () => {
  let limited = false;
  for (let attempt = 0; attempt < 20 && !limited; attempt += 1) {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'denis', password: 'wrong' });
    limited = response.status === 429;
  }
  assert.equal(limited, true, 'a 429 was expected after enough failed attempts');
});
