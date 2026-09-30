// The "Не закупается" flag: a line is left out of the totals (and, on the
// common sheet, out of the aggregated purchase) while staying visible.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { parse } from 'csv-parse/sync';
import request from 'supertest';

import {
  connectTestDb,
  createSellerWithProduct,
  disconnectTestDb,
  findLine,
  prepareApp,
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

async function importBoard(name = 'Board A', fileName = 'Board-A.csv') {
  const response = await request(app)
    .post('/api/boards/import')
    .field('name', name)
    .attach('file', Buffer.from(CSV, 'utf8'), fileName);
  return response.body.board.id;
}

async function boardView(boardId) {
  return (await request(app).get(`/api/boards/${boardId}/lines`)).body;
}

async function allView() {
  return (await request(app).get('/api/boards/all/lines')).body;
}

async function commonView() {
  return (await request(app).get('/api/common-purchases')).body;
}

test('a "не закупается" line is flagged and left out of the board totals', async () => {
  const boardId = await importBoard();
  const { product } = await createSellerWithProduct(
    app,
    { name: 'Shop' },
    { packQty: 1, packPrice: 100, shippingCost: 5 },
  );

  const initial = findLine(await boardView(boardId), (line) => line.value === '100 nF');
  await request(app)
    .put(`/api/boards/${boardId}/lines/${initial.id}`)
    .send({ productId: product.id });

  let view = await boardView(boardId);
  assert.equal(findLine(view, (line) => line.value === '100 nF').notPurchased, false);
  assert.equal(view.totals.cost, 105); // 1 pack * 100 + 5
  assert.equal(view.totals.shippingCost, 5);

  const update = await request(app)
    .put(`/api/boards/${boardId}/lines/${initial.id}`)
    .send({ notPurchased: true });
  assert.equal(update.status, 200);

  view = await boardView(boardId);
  assert.equal(findLine(view, (line) => line.value === '100 nF').notPurchased, true);
  assert.equal(view.totals.cost, 0);
  assert.equal(view.totals.shippingCost, 0);
});

test('"не закупается" on the common sheet is stored per match key', async () => {
  const boardId = await importBoard();
  const line = findLine(await boardView(boardId), (item) => item.value === '100 nF');
  await request(app)
    .put(`/api/boards/${boardId}/lines/${line.id}`)
    .send({ common: true });

  let common = await commonView();
  const row = findLine(common, (item) => item.value === '100 nF');
  assert.equal(row.notPurchased, false);

  await request(app)
    .put('/api/common-purchases')
    .send({ matchKey: row.matchKey, notPurchased: true });

  common = await commonView();
  assert.equal(findLine(common, (item) => item.value === '100 nF').notPurchased, true);

  // The board mirrors the override for its "Общие" row.
  const view = await boardView(boardId);
  assert.equal(findLine(view, (item) => item.value === '100 nF').notPurchased, true);
});

test('the "all" view marks a whole group not purchased and drops it from totals', async () => {
  const boardA = await importBoard('Board A', 'Board-A.csv');
  const boardB = await importBoard('Board B', 'Board-B.csv');
  const { product } = await createSellerWithProduct(
    app,
    { name: 'Shop' },
    { packQty: 1, packPrice: 10, shippingCost: 0 },
  );

  for (const boardId of [boardA, boardB]) {
    const line = findLine(await boardView(boardId), (item) => item.value === '100 nF');
    await request(app)
      .put(`/api/boards/${boardId}/lines/${line.id}`)
      .send({ productId: product.id });
  }

  let all = await allView();
  const row = findLine(all, (item) => item.value === '100 nF');
  assert.equal(row.notPurchased, false);
  assert.equal(all.totals.cost, 20); // ceil(2 / 1) * 10

  await request(app)
    .put('/api/boards/lines')
    .send({ lineIds: row.lineIds, changes: { notPurchased: true } });

  all = await allView();
  assert.equal(findLine(all, (item) => item.value === '100 nF').notPurchased, true);
  assert.equal(all.totals.cost, 0);
});

test('CSV export gains the "Не закупается" column and excludes the row from ИТОГО', async () => {
  const boardId = await importBoard();
  const { product } = await createSellerWithProduct(
    app,
    { name: 'Shop' },
    { packQty: 1, packPrice: 100, shippingCost: 5 },
  );
  const capacitor = findLine(await boardView(boardId), (item) => item.value === '100 nF');
  await request(app)
    .put(`/api/boards/${boardId}/lines/${capacitor.id}`)
    .send({ productId: product.id, notPurchased: true });

  const response = await request(app).get(`/api/boards/${boardId}/export?format=csv`);
  const rows = parse(response.text, { delimiter: ';', bom: true });
  const header = rows[0];
  assert.ok(header.includes('Не закупается'));

  const cell = (row, label) => row[header.indexOf(label)];
  const capacitorRow = rows.find((row) => row[2] === 'C1');
  assert.equal(cell(capacitorRow, 'Не закупается'), 'Да');

  const totals = rows[rows.length - 1];
  assert.equal(cell(totals, 'Стоимость'), '0');
  assert.equal(cell(totals, 'Доставка'), '0');
});
