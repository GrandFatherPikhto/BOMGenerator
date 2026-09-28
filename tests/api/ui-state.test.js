// Per-user UI state endpoint: defaults, section-scoped merge, junk rejection
// and persistence.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { UI_STATE_VERSION } from '../../src/shared/index.js';
import { connectTestDb, disconnectTestDb, prepareApp } from './helpers.js';

let app;

before(connectTestDb);
after(disconnectTestDb);
beforeEach(async () => {
  app = await prepareApp();
});

test('ui state starts empty at the current version', async () => {
  const response = await request(app).get('/api/ui-state');
  assert.equal(response.status, 200);
  assert.equal(response.body.version, UI_STATE_VERSION);
  assert.deepEqual(response.body.sections, {});
});

test('a patched section is returned and persisted', async () => {
  const purchases = {
    tab: 'all',
    boardId: 'b1',
    page: 2,
    filters: { value: 'LCD', valueRegex: false, qtyOp: 'gt', qty: '10' },
    sellerByBoard: { b1: 's1' },
  };

  const patched = await request(app).patch('/api/ui-state').send({ sections: { purchases } });
  assert.equal(patched.status, 200);
  assert.deepEqual(patched.body.sections.purchases, purchases);

  const reread = (await request(app).get('/api/ui-state')).body;
  assert.deepEqual(reread.sections.purchases, purchases);
});

test('patching one section keeps the others', async () => {
  await request(app)
    .patch('/api/ui-state')
    .send({ sections: { purchases: { boardId: 'b1' } } });
  await request(app)
    .patch('/api/ui-state')
    .send({ sections: { sellers: { mode: 'all', page: 3 } } });

  const { sections } = (await request(app).get('/api/ui-state')).body;
  assert.deepEqual(sections, {
    purchases: { boardId: 'b1' },
    sellers: { mode: 'all', page: 3 },
  });
});

test('junk keys, invalid types and unknown sections are dropped', async () => {
  const response = await request(app)
    .patch('/api/ui-state')
    .send({
      sections: {
        purchases: { boardId: 'b1', nope: 1, page: -1, tab: 'sideways' },
        mystery: { anything: true },
      },
    });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.sections, { purchases: { boardId: 'b1' } });
});

test('an empty string clears a remembered seller instead of being ignored', async () => {
  await request(app)
    .patch('/api/ui-state')
    .send({ sections: { purchases: { sellerByBoard: { b1: 's1' } } } });
  const response = await request(app)
    .patch('/api/ui-state')
    .send({ sections: { purchases: { sellerByBoard: { b1: '' } } } });

  assert.deepEqual(response.body.sections.purchases.sellerByBoard, { b1: '' });
});

test('a request without a sections body is a no-op', async () => {
  const response = await request(app).patch('/api/ui-state').send({});
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.sections, {});
});
