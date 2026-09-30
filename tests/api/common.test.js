// "Common purchases" and the manual "Докупить" list
// (acceptance criteria 5 and 6).
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { BomLine } from '../../src/server/models/BomLine.js';
import {
  connectTestDb,
  createSellerWithProduct,
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

  const { seller, product } = await createSellerWithProduct(
    app,
    { name: 'Mouser' },
    { packQty: 100, packPrice: 200 },
  );

  const common = await request(app).get('/api/common-purchases');
  const row = findLine(common.body, (line) => line.value === '100 nF');

  const putResponse = await request(app)
    .put('/api/common-purchases')
    .send({ matchKey: row.matchKey, productId: product.id, shippingCost: 12 });
  assert.equal(putResponse.status, 200);

  const updated = await request(app).get('/api/common-purchases');
  const updatedRow = findLine(updated.body, (line) => line.value === '100 nF');
  assert.equal(updatedRow.productId, product.id);
  assert.equal(updatedRow.sellerId, seller._id);
  assert.equal(updatedRow.shippingCost, 12);
  assert.equal(updatedRow.packs, 1); // ceil(2 / 100)
  assert.equal(updatedRow.cost, 212); // 1 * 200 + 12
  assert.equal(updated.body.totals.cost, 212);

  // Re-import the same board: the override must survive.
  await importBoard('Board A', 'Board-A.csv', 2);
  const after = await request(app).get('/api/common-purchases');
  const afterRow = findLine(after.body, (line) => line.value === '100 nF');
  assert.equal(afterRow.productId, product.id);
  assert.equal(afterRow.shippingCost, 12);
});

test('the product of a common line is not carried over to the common sheet', async () => {
  const boardA = await importBoard('Board A', 'Board-A.csv', 2);
  const line = await markCommon(boardA.id, (row) => row.value === '100 nF');

  const { product } = await createSellerWithProduct(
    app,
    { name: 'Shop' },
    { packQty: 10, packPrice: 7, shippingCost: 3 },
  );

  await request(app)
    .put(`/api/boards/${boardA.id}/lines/${line.id}`)
    .send({ productId: product.id });

  // The line keeps its own product, so it comes back when "Общие" is unchecked.
  const stored = await BomLine.findById(line.id).lean();
  assert.equal(String(stored.productId), product.id);

  // While the row is common, the product is chosen on the "Общие закупки" sheet
  // only: neither the board row nor the common row shows the line's product.
  const view = await request(app).get(`/api/boards/${boardA.id}/lines`);
  assert.equal(findLine(view.body, (row) => row.id === line.id).productId, null);

  const common = await request(app).get('/api/common-purchases');
  const commonRow = findLine(common.body, (row) => row.value === '100 nF');
  assert.equal(commonRow.productId, null);
  assert.equal(commonRow.packs, null);
  assert.equal(commonRow.cost, null);

  await request(app)
    .put(`/api/boards/${boardA.id}/lines/${line.id}`)
    .send({ common: false });
  const back = await request(app).get(`/api/boards/${boardA.id}/lines`);
  const restored = findLine(back.body, (row) => row.id === line.id);
  assert.equal(restored.productId, product.id);
  assert.equal(restored.shippingCost, 3);
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

test('a grouped footprint collapses common rows and accepts a bulk override', async () => {
  const csv = [
    'Reference,Qty,Value,Footprint',
    'R1,2,10K,Resistor_SMD:R_0603',
    'R2,3,100R,Resistor_SMD:R_0603',
    '',
  ].join('\n');
  const response = await request(app)
    .post('/api/boards/import')
    .field('name', 'Board A')
    .attach('file', Buffer.from(csv, 'utf8'), 'Grouped-A.csv');
  const boardId = response.body.board.id;

  await markCommon(boardId, (line) => line.value === '10K');
  await markCommon(boardId, (line) => line.value === '100R');
  await request(app)
    .put('/api/footprints')
    .send({ footprint: 'Resistor_SMD:R_0603', grouped: true });

  const common = await request(app).get('/api/common-purchases');
  const row = findLine(common.body, (line) => line.footprint === 'Resistor_SMD:R_0603');
  assert.ok(row, 'the grouped common row is present');
  assert.equal(row.grouped, true);
  assert.equal(row.totalQty, 5); // 2 + 3
  assert.equal(row.matchKeys.length, 2);
  assert.deepEqual(row.names, ['10K', '100R']);

  // One edit lands on every position of the grouped row.
  const { product } = await createSellerWithProduct(
    app,
    { name: 'Mouser' },
    { packQty: 10, packPrice: 100 },
  );
  const bulk = await request(app)
    .put('/api/common-purchases/bulk')
    .send({ matchKeys: row.matchKeys, changes: { productId: product.id } });
  assert.equal(bulk.status, 200);

  const after = await request(app).get('/api/common-purchases');
  const afterRow = findLine(after.body, (line) => line.footprint === 'Resistor_SMD:R_0603');
  assert.equal(afterRow.productId, product.id);
  assert.equal(afterRow.packs, 1); // ceil(5 / 10)
});
