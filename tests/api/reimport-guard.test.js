// Re-import guard: a board remembers the file name it was imported from and a
// renamed export must target the board explicitly, otherwise a duplicate board
// silently appears and keeps feeding the common purchases.
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

const CSV_V1 = [
  'Reference,Qty,Value,Footprint',
  'R1,1,4K7,Resistor_SMD:R_0402',
  'C1,1,100 nF,Capacitor_SMD:C_0603',
  '',
].join('\n');

const CSV_V2 = [
  'Reference,Qty,Value,Footprint',
  'R1,3,4K7,Resistor_SMD:R_0402',
  'C1,1,100 nF,Capacitor_SMD:C_0603',
  'C2,1,1 uF,Capacitor_SMD:C_0603',
  '',
].join('\n');

function importCsv(csv, { name, fileName, targetBoardId, renameSourceFile } = {}) {
  let pending = request(app).post('/api/boards/import');
  if (name !== undefined) {
    pending = pending.field('name', name);
  }
  if (targetBoardId !== undefined) {
    pending = pending.field('targetBoardId', targetBoardId);
  }
  if (renameSourceFile !== undefined) {
    pending = pending.field('renameSourceFile', String(renameSourceFile));
  }
  return pending.attach('file', Buffer.from(csv, 'utf8'), fileName);
}

async function boards() {
  return (await request(app).get('/api/boards')).body;
}

test('the first import remembers the source file name', async () => {
  const response = await importCsv(CSV_V1, {
    name: 'Board A',
    fileName: 'Board-A-v1.csv',
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.board.sourceFile, 'Board-A-v1.csv');

  const list = await boards();
  const board = list.find((item) => item.id === response.body.board.id);
  assert.equal(board.sourceFile, 'Board-A-v1.csv');
});

test('a renamed file without confirmation is rejected and creates no board', async () => {
  const first = await importCsv(CSV_V1, { name: 'Board A', fileName: 'Board-A-v1.csv' });
  const boardId = first.body.board.id;
  const before = (await boards()).length;

  const mismatch = await importCsv(CSV_V2, {
    fileName: 'Board-A-v2.csv',
    targetBoardId: boardId,
  });
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.body.details.code, 'SOURCE_FILE_MISMATCH');
  assert.equal(mismatch.body.details.storedFileName, 'Board-A-v1.csv');
  assert.equal(mismatch.body.details.incomingFileName, 'Board-A-v2.csv');

  // Nothing changed: the same board, the same number of boards.
  assert.equal((await boards()).length, before);
  const board = await request(app).get(`/api/boards/${boardId}`);
  assert.equal(board.body.sourceFile, 'Board-A-v1.csv');
});

test('confirmed rename updates the board and remembers the new file name', async () => {
  const first = await importCsv(CSV_V1, { name: 'Board A', fileName: 'Board-A-v1.csv' });
  const boardId = first.body.board.id;

  const { product } = await createSellerWithProduct(
    app,
    { name: 'ChipDip' },
    { packQty: 100, packPrice: 50 },
  );
  const view = await request(app).get(`/api/boards/${boardId}/lines`);
  const resistor = findLine(view.body, (line) => line.footprint.includes('R_0402'));
  await request(app)
    .put(`/api/boards/${boardId}/lines/${resistor.id}`)
    .send({ productId: product.id, shippingCost: 5, description: 'kept' });

  const renamed = await importCsv(CSV_V2, {
    fileName: 'Board-A-v2.csv',
    targetBoardId: boardId,
    renameSourceFile: true,
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.board.id, boardId); // same board, not a new one
  assert.equal(renamed.body.board.sourceFile, 'Board-A-v2.csv');

  const after = await request(app).get(`/api/boards/${boardId}/lines`);
  const resistorAfter = findLine(after.body, (line) => line.footprint.includes('R_0402'));
  assert.equal(resistorAfter.qty, 3); // CSV refreshed
  assert.equal(resistorAfter.productId, product.id); // hand-filled kept
  assert.equal(resistorAfter.shippingCost, 5);
  assert.equal(resistorAfter.description, 'kept');
  assert.ok(findLine(after.body, (line) => line.value === '1 uF')); // new row added

  // The remembered name now drives the plain re-import.
  const sameName = await importCsv(CSV_V2, { fileName: 'Board-A-v2.csv' });
  assert.equal(sameName.body.board.id, boardId);
});

test('a file name owned by another board is rejected', async () => {
  await importCsv(CSV_V1, { name: 'Board A', fileName: 'Board-A.csv' });
  const second = await importCsv(CSV_V1, { name: 'Board B', fileName: 'Board-B.csv' });
  const boardB = second.body.board.id;

  // Target board B but upload the file that belongs to board A, agreeing to
  // rename: the rename must be refused because the name is taken.
  const taken = await importCsv(CSV_V2, {
    fileName: 'Board-A.csv',
    targetBoardId: boardB,
    renameSourceFile: true,
  });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.details.code, 'SOURCE_FILE_TAKEN');
  assert.equal(taken.body.details.boardName, 'Board A');
});
