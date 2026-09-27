// Package-count override, and the link between "Общие" rows and the common sheet.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

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
  return { view, line: findLine(view, predicate) };
}

test('packs override on a board line drives packs and cost', async () => {
  const boardId = await importBoard('Board A', 'Board-A.csv');
  const { product } = await createSellerWithProduct(
    app,
    { name: 'ChipDip' },
    { packQty: 100, packPrice: 50 },
  );
  const { line } = await lineOf(boardId);

  await request(app)
    .put(`/api/boards/${boardId}/lines/${line.id}`)
    .send({ productId: product.id, shippingCost: 7, packsOverride: 5 });

  const { view, line: updated } = await lineOf(boardId);
  assert.equal(updated.packsOverride, 5);
  assert.equal(updated.packs, 5);
  assert.equal(updated.cost, 257); // 5 * 50 + 7
  assert.equal(view.totals.cost, 257);
});

test('packs override rejects non-integer and negative values', async () => {
  const boardId = await importBoard('Board A', 'Board-A.csv');
  const { line } = await lineOf(boardId);

  const fractional = await request(app)
    .put(`/api/boards/${boardId}/lines/${line.id}`)
    .send({ packsOverride: 1.5 });
  assert.equal(fractional.status, 400);

  const negative = await request(app)
    .put(`/api/boards/${boardId}/lines/${line.id}`)
    .send({ packsOverride: -1 });
  assert.equal(negative.status, 400);
});

test('common rows take product/packs/shipping from the common sheet', async () => {
  const boardA = await importBoard('Board A', 'Board-A.csv', 2);
  const boardB = await importBoard('Board B', 'Board-B.csv', 3);
  const { seller, product } = await createSellerWithProduct(
    app,
    { name: 'Mouser' },
    { packQty: 1000, packPrice: 2000 },
  );

  // Mark the same position as common on both boards.
  for (const boardId of [boardA, boardB]) {
    const { line } = await lineOf(boardId);
    await request(app)
      .put(`/api/boards/${boardId}/lines/${line.id}`)
      .send({ common: true });
  }

  const common = (await request(app).get('/api/common-purchases')).body;
  const row = findLine(common, (item) => item.value === '100 nF');
  assert.equal(row.totalQty, 5); // 1 * 2 + 1 * 3

  // Auto packages: ceil(5 / 1000) = 1.
  const auto = await request(app)
    .put('/api/common-purchases')
    .send({ matchKey: row.matchKey, productId: product.id, shippingCost: 10 });
  assert.equal(auto.status, 200);

  let after = (await request(app).get('/api/common-purchases')).body;
  let afterRow = findLine(after, (item) => item.value === '100 nF');
  assert.equal(afterRow.packs, 1);
  assert.equal(afterRow.cost, 2010); // 1 * 2000 + 10

  // Manual override of the package count.
  await request(app)
    .put('/api/common-purchases')
    .send({ matchKey: row.matchKey, packsOverride: 2 });
  after = (await request(app).get('/api/common-purchases')).body;
  afterRow = findLine(after, (item) => item.value === '100 nF');
  assert.equal(afterRow.packsOverride, 2);
  assert.equal(afterRow.packs, 2);
  assert.equal(afterRow.cost, 4010); // 2 * 2000 + 10

  // The board view of a common row mirrors the common override and is excluded
  // from the board total.
  const { view, line } = await lineOf(boardA, (item) => item.value === '100 nF');
  assert.equal(line.common, true);
  assert.equal(line.productId, product.id);
  assert.equal(line.sellerId, seller._id);
  assert.equal(line.packs, 2);
  assert.equal(line.shippingCost, 10);
  assert.equal(line.cost, 4010);
  assert.equal(view.totals.cost, 0);
  assert.equal(view.totals.shippingCost, 0);
});
