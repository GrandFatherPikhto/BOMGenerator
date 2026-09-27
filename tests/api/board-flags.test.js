// Board flags: "enabled" and "in common purchases" (the common configurator).
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { connectTestDb, disconnectTestDb, findLine, prepareApp } from './helpers.js';

let app;

before(connectTestDb);
after(disconnectTestDb);
beforeEach(async () => {
  app = await prepareApp();
});

const CSV = ['Reference,Qty,Value,Footprint', 'C1,1,100 nF,Capacitor_SMD:C_0603', ''].join('\n');

async function importBoard(name, fileName, count) {
  const response = await request(app)
    .post('/api/boards/import')
    .field('name', name)
    .attach('file', Buffer.from(CSV, 'utf8'), fileName);
  const boardId = response.body.board.id;
  await request(app).put(`/api/boards/${boardId}`).send({ count });
  return boardId;
}

async function markCommon(boardId) {
  const view = (await request(app).get(`/api/boards/${boardId}/lines`)).body;
  const line = findLine(view, (item) => item.value === '100 nF');
  await request(app).put(`/api/boards/${boardId}/lines/${line.id}`).send({ common: true });
}

async function commonTotal() {
  const body = (await request(app).get('/api/common-purchases')).body;
  const row = findLine(body, (item) => item.value === '100 nF');
  return row ? row.totalQty : 0;
}

test('new boards are enabled and in common purchases by default', async () => {
  const boardId = await importBoard('Board A', 'Board-A.csv', 1);
  const boards = (await request(app).get('/api/boards')).body;
  const board = boards.find((item) => item.id === boardId);
  assert.equal(board.enabled, true);
  assert.equal(board.inCommon, true);
});

test('a disabled board does not contribute to common purchases', async () => {
  const boardA = await importBoard('Board A', 'Board-A.csv', 2);
  const boardB = await importBoard('Board B', 'Board-B.csv', 3);
  await markCommon(boardA);
  await markCommon(boardB);
  assert.equal(await commonTotal(), 5); // 1 * 2 + 1 * 3

  const update = await request(app)
    .put(`/api/boards/${boardB}`)
    .send({ enabled: false });
  assert.equal(update.status, 200);
  assert.equal(update.body.enabled, false);

  assert.equal(await commonTotal(), 2); // only Board A

  // The board view of A mirrors the reduced aggregate.
  const view = (await request(app).get(`/api/boards/${boardA}/lines`)).body;
  const line = findLine(view, (item) => item.value === '100 nF');
  assert.equal(line.purchaseQty, 2);
});

test('a board without "В общих закупках" does not contribute either', async () => {
  const boardA = await importBoard('Board A', 'Board-A.csv', 2);
  const boardB = await importBoard('Board B', 'Board-B.csv', 3);
  await markCommon(boardA);
  await markCommon(boardB);

  await request(app).put(`/api/boards/${boardB}`).send({ inCommon: false });
  assert.equal(await commonTotal(), 2);

  // Re-enabling it brings it back.
  await request(app).put(`/api/boards/${boardB}`).send({ inCommon: true });
  assert.equal(await commonTotal(), 5);
});

test('"В общих закупках" is ignored while the board is disabled', async () => {
  const boardA = await importBoard('Board A', 'Board-A.csv', 2);
  const boardB = await importBoard('Board B', 'Board-B.csv', 3);
  await markCommon(boardA);
  await markCommon(boardB);

  await request(app).put(`/api/boards/${boardB}`).send({ inCommon: true, enabled: false });
  assert.equal(await commonTotal(), 2);

  // Disabled but inCommon: still excluded (enabled is mandatory).
  const boards = (await request(app).get('/api/boards')).body;
  const board = boards.find((item) => item.id === boardB);
  assert.equal(board.enabled, false);
  assert.equal(board.inCommon, true);
  assert.equal(await commonTotal(), 2);
});
