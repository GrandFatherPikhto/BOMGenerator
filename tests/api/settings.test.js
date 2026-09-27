// Settings singleton: the page-width option.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { connectTestDb, disconnectTestDb, prepareApp } from './helpers.js';

let app;

before(connectTestDb);
after(disconnectTestDb);
beforeEach(async () => {
  app = await prepareApp();
});

test('page width defaults to normal and can be changed', async () => {
  const initial = (await request(app).get('/api/settings')).body;
  assert.equal(initial.pageWidth, 'normal');

  const updated = await request(app).put('/api/settings').send({ pageWidth: 'full' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.pageWidth, 'full');

  const reread = (await request(app).get('/api/settings')).body;
  assert.equal(reread.pageWidth, 'full');
});

test('an unknown page width is rejected', async () => {
  const response = await request(app).put('/api/settings').send({ pageWidth: 'huge' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /pageWidth/);
});
