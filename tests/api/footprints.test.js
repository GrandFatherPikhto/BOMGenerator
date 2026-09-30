// The "Посадочные места" summary and the persisted grouping flag.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import request from 'supertest';

import { connectTestDb, disconnectTestDb, prepareApp } from './helpers.js';

let app;

before(connectTestDb);
after(disconnectTestDb);
beforeEach(async () => {
  app = await prepareApp();
});

const CSV = [
  'Reference,Qty,Value,Footprint',
  'R1,2,10K,Resistor_SMD:R_0603',
  'R2,3,100R,Resistor_SMD:R_0603',
  'C1,1,100 nF,Capacitor_SMD:C_0603',
  'TP1,1,TestPoint,',
  '',
].join('\n');

async function importBoard(name, fileName) {
  const response = await request(app)
    .post('/api/boards/import')
    .field('name', name)
    .attach('file', Buffer.from(CSV, 'utf8'), fileName);
  assert.equal(response.status, 200);
  return response.body.board;
}

function footprintOf(body, footprint) {
  return body.footprints.find((item) => item.footprint === footprint);
}

test('lists every non-empty footprint with positions and the summed need', async () => {
  await importBoard('Board A', 'Board-A.csv');

  const response = await request(app).get('/api/footprints');
  assert.equal(response.status, 200);
  assert.equal(response.body.groupedCount, 0);

  const resistor = footprintOf(response.body, 'Resistor_SMD:R_0603');
  assert.ok(resistor, 'the resistor footprint is listed');
  assert.equal(resistor.positions, 2);
  assert.equal(resistor.boards, 1);
  assert.equal(resistor.totalQty, 5); // 2 + 3
  assert.equal(resistor.grouped, false);

  const capacitor = footprintOf(response.body, 'Capacitor_SMD:C_0603');
  assert.equal(capacitor.positions, 1);

  // An empty footprint is not listed (it cannot be grouped).
  assert.equal(footprintOf(response.body, ''), undefined);
});

test('the grouping flag can be turned on and off', async () => {
  await importBoard('Board A', 'Board-A.csv');

  const on = await request(app)
    .put('/api/footprints')
    .send({ footprint: 'Resistor_SMD:R_0603', grouped: true });
  assert.equal(on.status, 200);
  assert.equal(on.body.grouped, true);

  let list = (await request(app).get('/api/footprints')).body;
  assert.equal(footprintOf(list, 'Resistor_SMD:R_0603').grouped, true);
  assert.equal(list.groupedCount, 1);

  const off = await request(app)
    .put('/api/footprints')
    .send({ footprint: 'Resistor_SMD:R_0603', grouped: false });
  assert.equal(off.status, 200);
  assert.equal(off.body.grouped, false);

  list = (await request(app).get('/api/footprints')).body;
  assert.equal(footprintOf(list, 'Resistor_SMD:R_0603').grouped, false);
  assert.equal(list.groupedCount, 0);
});

test('an empty footprint is rejected', async () => {
  const response = await request(app)
    .put('/api/footprints')
    .send({ footprint: '   ', grouped: true });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /footprint/);
});
