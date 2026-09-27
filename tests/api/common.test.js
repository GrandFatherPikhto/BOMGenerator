// "Common purchases" and the manual "Докупить" list
// (acceptance criteria 5 and 6).
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import {
  connectTestDb,
  disconnectTestDb,
  findLine,
  linesOf,
  prepareApp,
  serviceBoardId,
} from './helpers.js';

let app;

before(connectTestDb);
after(disconnectTestDb);
beforeEach(async () => {
  app = await prepareApp();
});

const CSV = [
  'Reference,Qty,Value,Footprint',
  'C1,1,100 nF,Capacitor_SMD:C_0603',
  'R1,1,10K,Resistor_SMD:R_0402',
  '',
].join('\n');

async function importBoard(name, fileName, count) {
  const response = await request(app)
    .post('/api/boards/import')
    .field('name', name)
    .attach('file', Buffer.from(CSV, 'utf8'), fileName);
  if (count) {
    await request(app).put(`/api/boards/${response.body.board.id}`).send({ count });
  }
  return response.body.board;
}

async function markCommon(boardId, predicate, values = { common: true }) {
  const view = await request(app).get(`/api/boards/${boardId}/lines`);
  const line = findLine(view.body, predicate);
  assert.ok(line, 'line to mark is present');
  await request(app).put(`/api/boards/${boardId}/lines/${line.id}`).send(values);
  return line;
}

test('common rows are excluded from the board total and aggregated', async () => {
  const boardA = await importBoard('Board A', 'Board-A.csv', 2);
  const boardB = await importBoard('Board B', 'Board-B.csv', 3);

  await markCommon(boardA.id, (line) => line.value === '100 nF');
  await markCommon(boardB.id, (line) => line.value === '100 nF');

  // The marked rows leave the board "Итого".
  const viewA = await request(app).get(`/api/boards/${boardA.id}/lines`);
  assert.equal(viewA.body.totals.cost, 0);
  assert.equal(viewA.body.totals.shippingCost, 0);

  const common = await request(app).get('/api/common-purchases?mode=merged');
  assert.equal(common.status, 200);
  const row = findLine(common.body, (line) => line.value === '100 nF');
  assert.ok(row, 'the common row is present');
  assert.equal(row.totalQty, 5); // 1 * 2 + 1 * 3

  const byBoard = await request(app).get('/api/common-purchases?mode=by_board');
  const rowByBoard = findLine(byBoard.body, (line) => line.value === '100 nF');
  assert.deepEqual(rowByBoard.byBoard, { 'Board A': 2, 'Board B': 3 });
});

test('seller and shipping set on the common sheet survive a re-import', async () => {
  const boardA = await importBoard('Board A', 'Board-A.csv', 2);
  await markCommon(boardA.id, (line) => line.value === '100 nF');

  const sellerResponse = await request(app)
    .post('/api/sellers')
    .send({ name: 'Mouser', packQty: 100, packPrice: 200 });
  const sellerId = sellerResponse.body._id;

  const common = await request(app).get('/api/common-purchases');
  const row = findLine(common.body, (line) => line.value === '100 nF');

  const putResponse = await request(app)
    .put('/api/common-purchases')
    .send({ matchKey: row.matchKey, sellerId, shippingCost: 12 });
  assert.equal(putResponse.status, 200);

  const updated = await request(app).get('/api/common-purchases');
  const updatedRow = findLine(updated.body, (line) => line.value === '100 nF');
  assert.equal(updatedRow.sellerId, sellerId);
  assert.equal(updatedRow.shippingCost, 12);
  assert.equal(updatedRow.packs, 1); // ceil(2 / 100)
  assert.equal(updatedRow.cost, 212); // 1 * 200 + 12
  assert.equal(updated.body.totals.cost, 212);

  // Re-import the same board: the override must survive.
  await importBoard('Board A', 'Board-A.csv', 2);
  const after = await request(app).get('/api/common-purchases');
  const afterRow = findLine(after.body, (line) => line.value === '100 nF');
  assert.equal(afterRow.sellerId, sellerId);
  assert.equal(afterRow.shippingCost, 12);
});

test('manual "Докупить" lines work without a CSV and join common purchases', async () => {
  const boards = await request(app).get('/api/boards');
  const serviceId = serviceBoardId(boards.body);
  assert.ok(serviceId, 'the service board is created automatically');

  const created = await request(app)
    .post(`/api/boards/${serviceId}/lines`)
    .send({ value: 'Solder wire 0.5mm', qty: 5, footprint: '-' });
  assert.equal(created.status, 201);
  const lineId = created.body.id;

  // Edit the manual line (quantity) — allowed only for manual lines.
  const edit = await request(app)
    .put(`/api/boards/${serviceId}/lines/${lineId}`)
    .send({ qty: 2, common: true, shippingCost: 3 });
  assert.equal(edit.status, 200);

  const view = await request(app).get(`/api/boards/${serviceId}/lines`);
  const row = linesOf(view.body)[0];
  assert.equal(row.value, 'Solder wire 0.5mm');
  assert.equal(row.qty, 2);
  assert.equal(row.common, true);

  const common = await request(app).get('/api/common-purchases');
  const commonRow = findLine(common.body, (line) => line.value === 'Solder wire 0.5mm');
  assert.ok(commonRow, 'the manual line participates in common purchases');
  assert.equal(commonRow.totalQty, 2);

  const removed = await request(app).delete(
    `/api/boards/${serviceId}/lines/${lineId}`,
  );
  assert.equal(removed.status, 204);
});

test('imported lines cannot have their quantity edited manually', async () => {
  const board = await importBoard('Board A', 'Board-A.csv');
  const view = await request(app).get(`/api/boards/${board.id}/lines`);
  const line = linesOf(view.body)[0];

  const response = await request(app)
    .put(`/api/boards/${board.id}/lines/${line.id}`)
    .send({ qty: 99 });
  assert.equal(response.status, 400);
});
