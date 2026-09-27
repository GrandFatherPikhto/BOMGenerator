// Import / re-import and board line listing (acceptance criteria 2 and 3).
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import {
  blockNames,
  connectTestDb,
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

const CSV_V1 = [
  'Reference,Qty,Value,Footprint,DNP,Exclude from BOM',
  'R1,1,4K7,Resistor_SMD:R_0402,,',
  'R2,1,4.7K,Resistor_SMD:R_0402,,',
  'C1,1,100 nF,Capacitor_SMD:C_0603,,',
  'C2,1,100 nF,Capacitor_SMD:C_0603,,',
  'D1,1,LED,Diode_SMD:D_0805,,',
  'D2,1,1N4148W,Diode_SMD:D_SOD-123,,YES',
  '',
].join('\n');

const CSV_V2 = [
  'Reference,Qty,Value,Footprint,DNP,Exclude from BOM',
  'R1,3,4K7,Resistor_SMD:R_0402,,',
  'C1,1,100 nF,Capacitor_SMD:C_0603,,',
  'C2,1,100 nF,Capacitor_SMD:C_0603,,',
  'C3,1,1 uF,Capacitor_SMD:C_0603,,',
  '',
].join('\n');

async function importBoard(csv, name, fileName) {
  return request(app)
    .post('/api/boards/import')
    .field('name', name)
    .attach('file', Buffer.from(csv, 'utf8'), fileName);
}

test('import aggregates equal match keys and drops excluded rows', async () => {
  const response = await importBoard(CSV_V1, 'Test Board', 'Test-Board.csv');
  assert.equal(response.status, 200);
  // R1/R2 merge into one row, D2 ("Exclude from BOM") and the header drop out.
  assert.deepEqual(response.body.summary, {
    added: 3,
    updated: 0,
    removed: 0,
    total: 3,
  });

  const view = await request(app).get(`/api/boards/${response.body.board.id}/lines`);
  assert.equal(view.status, 200);

  const resistor = findLine(
    view.body,
    (line) => line.value === '4K7' || line.value === '4.7K',
  );
  assert.ok(resistor, 'the resistor line is present');
  assert.equal(resistor.reference, 'R1,R2');
  assert.equal(resistor.qty, 2);
  assert.equal(resistor.totalQty, 2);
  assert.equal(resistor.packs, null); // no seller selected yet
  assert.equal(resistor.cost, null);

  // Categorisation blocks come from ParseCategory.
  assert.ok(blockNames(view.body, 'category').includes('Резисторы'));
  assert.ok(blockNames(view.body, 'category').includes('Конденсаторы'));
  assert.ok(blockNames(view.body, 'category').includes('Диоды'));
});

test('re-import keeps hand-filled fields and removes missing lines', async () => {
  const first = await importBoard(CSV_V1, 'Test Board', 'Test-Board.csv');
  const boardId = first.body.board.id;

  const sellerResponse = await request(app).post('/api/sellers').send({
    name: 'ChipDip',
    packQty: 100,
    packPrice: 50,
    shippingCost: 0,
  });
  assert.equal(sellerResponse.status, 201);
  const sellerId = sellerResponse.body._id;

  const view = await request(app).get(`/api/boards/${boardId}/lines`);
  const resistor = findLine(view.body, (line) => line.footprint.includes('R_0402'));

  const update = await request(app)
    .put(`/api/boards/${boardId}/lines/${resistor.id}`)
    .send({ sellerId, common: true, shippingCost: 5 });
  assert.equal(update.status, 200);

  // Re-import the same file name with changed quantities.
  const second = await importBoard(CSV_V2, 'Test Board', 'Test-Board.csv');
  assert.equal(second.body.board.id, boardId); // same board, not a new one
  // R1 and "100 nF" (C1+C2) are updated, C3 (1 uF) is added, the LED removed.
  assert.deepEqual(second.body.summary, {
    added: 1,
    updated: 2,
    removed: 1,
    total: 3,
  });

  const after = await request(app).get(`/api/boards/${boardId}/lines`);
  const resistorAfter = findLine(after.body, (line) => line.footprint.includes('R_0402'));
  assert.equal(resistorAfter.qty, 3); // CSV field refreshed
  assert.equal(resistorAfter.reference, 'R1');
  assert.equal(resistorAfter.sellerId, sellerId); // hand-filled kept
  assert.equal(resistorAfter.common, true);
  assert.equal(resistorAfter.shippingCost, 5);

  // The 1 uF capacitor was added, the LED removed.
  assert.ok(findLine(after.body, (line) => line.value === '1 uF'));
  assert.equal(findLine(after.body, (line) => line.value === 'LED'), undefined);
});

test('board count multiplies the total and seller gives packs/cost', async () => {
  const first = await importBoard(CSV_V1, 'Test Board', 'Test-Board.csv');
  const boardId = first.body.board.id;

  await request(app).put(`/api/boards/${boardId}`).send({ count: 2 });

  const sellerResponse = await request(app)
    .post('/api/sellers')
    .send({ name: 'Ali', packQty: 5, packPrice: 10 });
  const sellerId = sellerResponse.body._id;

  const view = await request(app).get(`/api/boards/${boardId}/lines`);
  const capacitor = findLine(
    view.body,
    (line) => line.value === '100 nF',
  );
  assert.equal(capacitor.totalQty, 4); // qty 2 * count 2

  await request(app)
    .put(`/api/boards/${boardId}/lines/${capacitor.id}`)
    .send({ sellerId, shippingCost: 7 });

  const viewAfter = await request(app).get(`/api/boards/${boardId}/lines`);
  const capacitorAfter = findLine(viewAfter.body, (line) => line.value === '100 nF');
  assert.equal(capacitorAfter.packs, 1); // ceil(4 / 5)
  assert.equal(capacitorAfter.cost, 17); // 1 * 10 + 7

  // "Итого" sums the visible (non-common) rows.
  assert.equal(viewAfter.body.totals.shippingCost, 7);
  assert.equal(viewAfter.body.totals.cost, 17);
});

test('invalid regex is rejected when saving a category', async () => {
  const response = await request(app).post('/api/categories').send({
    name: 'Broken',
    refMode: 'regex',
    refPatterns: ['(unclosed'],
  });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /refPatterns\[0\]/);
});

test('a category edited through the API is visible immediately', async () => {
  const first = await importBoard(CSV_V1, 'Test Board', 'Test-Board.csv');
  const boardId = first.body.board.id;

  // Add a narrow category that catches R1 only, placed before "Резисторы".
  const created = await request(app).post('/api/categories').send({
    order: 0,
    name: 'R1 only',
    refMode: 'regex',
    refPatterns: ['^R1$'],
  });
  assert.equal(created.status, 201);

  const view = await request(app).get(`/api/boards/${boardId}/lines`);
  assert.ok(blockNames(view.body, 'category').includes('R1 only'));
  assert.equal(view.body.blocks[0].name, 'R1 only'); // order respected
});
