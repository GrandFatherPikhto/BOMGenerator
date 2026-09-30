// "Все" tab of the purchases screen: a summary of every enabled board, grouped
// by value + footprint and the chosen source, plus the bulk update behind a row.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import {
  connectTestDb,
  createSellerWithProduct,
  disconnectTestDb,
  findLine,
  linesOf,
  prepareApp,
} from './helpers.js';

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
  if (count) {
    await request(app).put(`/api/boards/${boardId}`).send({ count });
  }
  return boardId;
}

async function lineOf(boardId, predicate = () => true) {
  const view = (await request(app).get(`/api/boards/${boardId}/lines`)).body;
  return findLine(view, predicate);
}

async function allView() {
  return (await request(app).get('/api/boards/all/lines')).body;
}

test('the "all" view sums one component across enabled boards', async () => {
  await importBoard('Board A', 'Board-A.csv', 2);
  await importBoard('Board B', 'Board-B.csv', 3);

  const view = await allView();
  assert.equal(view.scope, 'all');

  const row = findLine(view, (item) => item.value === '100 nF');
  assert.equal(row.totalQty, 5); // 1 * 2 + 1 * 3
  assert.equal(row.hasMultipleSources, false);
  assert.deepEqual(
    row.boards.map((board) => board.name).sort(),
    ['Board A', 'Board B'],
  );
  assert.equal(row.byBoard['Board A'], 2);
  assert.equal(row.byBoard['Board B'], 3);
  assert.equal(row.lineIds.length, 2);
  assert.deepEqual(
    view.boards.map((board) => board.name).sort(),
    ['Board A', 'Board B'],
  );
});

test('different sources become separate rows and are flagged', async () => {
  const boardA = await importBoard('Board A', 'Board-A.csv', 1);
  const boardB = await importBoard('Board B', 'Board-B.csv', 1);
  const { product: productA } = await createSellerWithProduct(
    app,
    { name: 'Shop A' },
    { packQty: 10, packPrice: 5 },
  );
  const { product: productB } = await createSellerWithProduct(
    app,
    { name: 'Shop B' },
    { packQty: 10, packPrice: 7 },
  );

  const lineA = await lineOf(boardA);
  const lineB = await lineOf(boardB);
  await request(app)
    .put(`/api/boards/${boardA}/lines/${lineA.id}`)
    .send({ productId: productA.id });
  await request(app)
    .put(`/api/boards/${boardB}/lines/${lineB.id}`)
    .send({ productId: productB.id });

  const rows = linesOf(await allView()).filter((item) => item.value === '100 nF');
  assert.equal(rows.length, 2);
  assert.equal(
    rows.every((row) => row.hasMultipleSources),
    true,
  );
  assert.deepEqual(
    rows.map((row) => row.totalQty).sort((left, right) => left - right),
    [1, 1],
  );
  assert.deepEqual(
    rows.map((row) => row.productId).sort(),
    [productA.id, productB.id].sort(),
  );
});

test('disabled boards do not contribute to the summary', async () => {
  const boardA = await importBoard('Board A', 'Board-A.csv', 2);
  const boardB = await importBoard('Board B', 'Board-B.csv', 3);
  await request(app).put(`/api/boards/${boardA}`).send({ enabled: false });

  const view = await allView();
  const row = findLine(view, (item) => item.value === '100 nF');
  assert.equal(row.totalQty, 3);
  assert.equal(
    view.boards.some((board) => board.id === boardA),
    false,
  );
  assert.equal(
    view.boards.some((board) => board.id === boardB),
    true,
  );
});

test('common rows are left to the common purchases sheet', async () => {
  const boardA = await importBoard('Board A', 'Board-A.csv', 1);
  const line = await lineOf(boardA);
  await request(app)
    .put(`/api/boards/${boardA}/lines/${line.id}`)
    .send({ common: true });

  const view = await allView();
  assert.equal(linesOf(view).length, 0);
  assert.equal(view.totals.cost, 0);
  assert.equal(view.totals.shippingCost, 0);
});

test('bulk update applies changes to every line of an aggregated row', async () => {
  const boardA = await importBoard('Board A', 'Board-A.csv', 1);
  const boardB = await importBoard('Board B', 'Board-B.csv', 1);
  const { product } = await createSellerWithProduct(
    app,
    { name: 'ChipDip' },
    { packQty: 100, packPrice: 50 },
  );

  const lineA = await lineOf(boardA);
  const lineB = await lineOf(boardB);

  const response = await request(app)
    .put('/api/boards/lines')
    .send({
      lineIds: [lineA.id, lineB.id],
      changes: { productId: product.id, packsOverride: 4, shippingCost: 3 },
    });
  assert.equal(response.status, 200);
  assert.equal(response.body.updated, 2);

  const row = findLine(await allView(), (item) => item.value === '100 nF');
  assert.equal(row.productId, product.id);
  assert.equal(row.packsOverride, 4);
  assert.equal(row.cost, 203); // 4 * 50 + 3
  assert.equal(row.hasMultipleSources, false);
});

test('bulk update requires at least one line id', async () => {
  const response = await request(app)
    .put('/api/boards/lines')
    .send({ lineIds: [], changes: {} });
  assert.equal(response.status, 400);
});

test('a grouped footprint collapses its values into one row', async () => {
  const csv = [
    'Reference,Qty,Value,Footprint',
    'R1,2,10K,Resistor_SMD:R_0603',
    'R2,3,100R,Resistor_SMD:R_0603',
    'C1,1,100 nF,Capacitor_SMD:C_0603',
    '',
  ].join('\n');
  const response = await request(app)
    .post('/api/boards/import')
    .field('name', 'Board A')
    .attach('file', Buffer.from(csv, 'utf8'), 'Grouped-A.csv');
  const boardId = response.body.board.id;
  assert.ok(boardId);

  // Not grouped yet: the two resistors stay separate rows.
  let rows = linesOf(await allView()).filter(
    (item) => item.footprint === 'Resistor_SMD:R_0603',
  );
  assert.equal(rows.length, 2);

  await request(app)
    .put('/api/footprints')
    .send({ footprint: 'Resistor_SMD:R_0603', grouped: true });

  rows = linesOf(await allView()).filter(
    (item) => item.footprint === 'Resistor_SMD:R_0603',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].grouped, true);
  assert.equal(rows[0].totalQty, 5); // 2 + 3
  assert.equal(rows[0].lineIds.length, 2);
  assert.deepEqual([...rows[0].names].sort(), ['100R', '10K']);

  // The other footprint is untouched.
  assert.equal(
    linesOf(await allView()).filter(
      (item) => item.footprint === 'Capacitor_SMD:C_0603',
    ).length,
    1,
  );
});
