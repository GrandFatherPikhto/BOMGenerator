// Validation and error-handling edge cases across the API surface.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import {
  connectTestDb,
  disconnectTestDb,
  findLine,
  prepareApp,
  serviceBoardId,
} from './helpers.js';

let app;

before(connectTestDb);
after(disconnectTestDb);
beforeEach(async () => {
  app = await prepareApp();
});

test('creating a board requires a name', async () => {
  const response = await request(app).post('/api/boards').send({});
  assert.equal(response.status, 400);
  assert.match(response.body.error, /name is required/);
});

test('a board count must be a number >= 1', async () => {
  const created = await request(app).post('/api/boards').send({ name: 'Board' });
  const response = await request(app)
    .put(`/api/boards/${created.body.id}`)
    .send({ count: 0 });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /count must be a number >= 1/);
});

test('a board name must not be empty on update', async () => {
  const created = await request(app).post('/api/boards').send({ name: 'Board' });
  const response = await request(app)
    .put(`/api/boards/${created.body.id}`)
    .send({ name: '   ' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /name must not be empty/);
});

test('the service "Докупить" board cannot be deleted', async () => {
  const boards = (await request(app).get('/api/boards')).body;
  const response = await request(app).delete(`/api/boards/${serviceBoardId(boards)}`);
  assert.equal(response.status, 400);
  assert.match(response.body.error, /cannot be deleted/);
});

test('a seller name is unique', async () => {
  await request(app).post('/api/sellers').send({ name: 'Shop' });
  const duplicate = await request(app).post('/api/sellers').send({ name: 'Shop' });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.body.error, /already exists/);
});

test('a seller requires a name', async () => {
  const response = await request(app).post('/api/sellers').send({ url: 'https://x' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /name is required/);
});

test('the common override rejects a negative shipping cost', async () => {
  const response = await request(app)
    .put('/api/common-purchases')
    .send({ matchKey: 'K', shippingCost: -1 });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /shippingCost must be a number >= 0/);
});

test('the common override rejects a fractional packs override', async () => {
  const response = await request(app)
    .put('/api/common-purchases')
    .send({ matchKey: 'K', packsOverride: 1.5 });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /packsOverride must be a non-negative integer/);
});

test('the common override rejects an unknown product', async () => {
  const response = await request(app)
    .put('/api/common-purchases')
    .send({ matchKey: 'K', productId: '64b000000000000000000000' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /productId does not exist/);
});

test('the common override requires a match key', async () => {
  const response = await request(app)
    .put('/api/common-purchases')
    .send({ shippingCost: 1 });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /matchKey is required/);
});

test('an import without the required CSV columns is rejected', async () => {
  const csv = 'Reference,Qty\nR1,1\n'; // Value and Footprint are missing
  const response = await request(app)
    .post('/api/boards/import')
    .field('name', 'Broken')
    .attach('file', Buffer.from(csv, 'utf8'), 'Broken.csv');
  assert.equal(response.status, 400);
  assert.match(response.body.error, /missing required column/);
});

test('updating a missing line returns 404', async () => {
  const created = await request(app).post('/api/boards').send({ name: 'Board' });
  const response = await request(app)
    .put(`/api/boards/${created.body.id}/lines/64b000000000000000000000`)
    .send({ shippingCost: 1 });
  assert.equal(response.status, 404);
  assert.match(response.body.error, /Line not found/);
});

test('bulk update without line ids is rejected', async () => {
  const response = await request(app).put('/api/boards/lines').send({ changes: {} });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /lineIds is required/);
});

test('an oversized upload is rejected with a friendly message', async () => {
  const big = Buffer.alloc(21 * 1024 * 1024, 0x41); // 21 MB > the 20 MB limit
  const response = await request(app)
    .post('/api/boards/import')
    .field('name', 'Big')
    .attach('file', big, 'Big.csv');
  assert.equal(response.status, 400);
  assert.match(response.body.error, /too large/);
});

test('bulk update can edit the identity of manual "Докупить" lines', async () => {
  const boards = (await request(app).get('/api/boards')).body;
  const serviceId = serviceBoardId(boards);
  const created = await request(app)
    .post(`/api/boards/${serviceId}/lines`)
    .send({ value: '10K', footprint: 'R_0402', qty: 1 });
  const id = created.body.id;

  const response = await request(app)
    .put('/api/boards/lines')
    .send({ lineIds: [id], changes: { value: '22K' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.updated, 1);

  const view = (await request(app).get(`/api/boards/${serviceId}/lines`)).body;
  assert.equal(findLine(view, (item) => item.id === id).value, '22K');
});

test('bulk update reports a missing line', async () => {
  const response = await request(app)
    .put('/api/boards/lines')
    .send({
      lineIds: ['64b000000000000000000000'],
      changes: { shippingCost: 1 },
    });
  assert.equal(response.status, 404);
  assert.match(response.body.error, /Line not found/);
});
