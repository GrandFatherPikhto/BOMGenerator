// Price-list export (CSV/XLSX) and the per-position description.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import request from 'supertest';

import {
  connectTestDb,
  createSellerWithProduct,
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

const CSV = [
  'Reference,Qty,Value,Footprint',
  'C1,1,100 nF,Capacitor_SMD:C_0603',
  'R1,1,10K,Resistor_SMD:R_0402',
  '',
].join('\n');

const EXPECTED_HEADER = [
  'Категория',
  'Подкатегория',
  'Обозначения',
  'Наименование',
  'Корпус/Footprint',
  'Штук на плату',
  'Плат',
  'Итого',
  'Общие',
  'Не закупается',
  'Продавец',
  'URL',
  'В упаковке',
  'Цена упаковки',
  'Упаковок',
  'Доставка',
  'Стоимость',
  'Описание',
];

function binaryParser(response, callback) {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function importBoard() {
  const response = await request(app)
    .post('/api/boards/import')
    .field('name', 'Board X')
    .attach('file', Buffer.from(CSV, 'utf8'), 'Board-X.csv');
  return response.body.board.id;
}

async function prepareBoardWithData() {
  const boardId = await importBoard();
  const { product } = await createSellerWithProduct(
    app,
    { name: 'ChipDip', url: 'https://s/1' },
    { packQty: 100, packPrice: 50 },
  );

  const view = (await request(app).get(`/api/boards/${boardId}/lines`)).body;
  const capacitor = findLine(view, (line) => line.value === '100 nF');
  const resistor = findLine(view, (line) => line.value === '10K');

  await request(app)
    .put(`/api/boards/${boardId}/lines/${capacitor.id}`)
    .send({ productId: product.id, shippingCost: 7, description: 'Note 1' });
  await request(app)
    .put(`/api/boards/${boardId}/lines/${resistor.id}`)
    .send({ description: 'Note 2' });

  return { boardId, capacitor, resistor };
}

test('description is stored and survives a re-import', async () => {
  const { boardId, capacitor } = await prepareBoardWithData();

  let view = (await request(app).get(`/api/boards/${boardId}/lines`)).body;
  assert.equal(findLine(view, (line) => line.value === '100 nF').description, 'Note 1');

  // Re-import the same file: the note must stay.
  await importBoard();
  view = (await request(app).get(`/api/boards/${boardId}/lines`)).body;
  const after = findLine(view, (line) => line.value === '100 nF');
  assert.equal(after.description, 'Note 1');
  assert.equal(after.id, capacitor.id);
});

test('CSV export has the expected columns, values and totals row', async () => {
  const { boardId } = await prepareBoardWithData();

  const response = await request(app).get(`/api/boards/${boardId}/export?format=csv`);
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /text\/csv/);

  const rows = parse(response.text, { delimiter: ';', bom: true });
  assert.deepEqual(rows[0], EXPECTED_HEADER);

  const capacitorRow = rows.find((row) => row[2] === 'C1');
  assert.ok(capacitorRow, 'the capacitor row is exported');
  const header = rows[0];
  const cell = (row, label) => row[header.indexOf(label)];
  assert.equal(cell(capacitorRow, 'Продавец'), 'ChipDip');
  assert.equal(cell(capacitorRow, 'Описание'), 'Note 1');
  assert.equal(cell(capacitorRow, 'Доставка'), '7');
  assert.equal(cell(capacitorRow, 'Стоимость'), '57'); // 1 pack * 50 + 7

  const totals = rows[rows.length - 1];
  assert.equal(totals[0], 'ИТОГО');
  assert.equal(cell(totals, 'Доставка'), '7');
  assert.equal(cell(totals, 'Стоимость'), '57');
});

test('XLSX export builds a workbook with header, rows and totals', async () => {
  const { boardId } = await prepareBoardWithData();

  const response = await request(app)
    .get(`/api/boards/${boardId}/export?format=xlsx`)
    .buffer(true)
    .parse(binaryParser);
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /spreadsheetml/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(response.body);
  const worksheet = workbook.worksheets[0];
  assert.equal(worksheet.name, 'Board X');

  const header = worksheet.getRow(1).values.slice(1);
  assert.deepEqual(header, EXPECTED_HEADER);
  assert.equal(worksheet.getRow(1).font.bold, true);

  // Two positions + header + totals.
  assert.equal(worksheet.rowCount, 4);
  const lastRow = worksheet.getRow(worksheet.rowCount);
  assert.equal(lastRow.getCell(1).value, 'ИТОГО');
  assert.equal(lastRow.getCell(EXPECTED_HEADER.indexOf('Стоимость') + 1).value, 57);
});

test('an unknown export format is rejected', async () => {
  const boardId = await importBoard();
  const response = await request(app).get(`/api/boards/${boardId}/export?format=pdf`);
  assert.equal(response.status, 400);
  assert.match(response.body.error, /xlsx/);
});

const COMMON_HEADER = [
  'Наименование',
  'Корпус/Footprint',
  'Нужно всего',
  'Позиции',
  'Продавец',
  'Товар',
  'Не закупается',
  'В упаковке',
  'Цена упаковки',
  'Упаковок',
  'Доставка',
  'Стоимость',
];

/** One common position on one board, with a product and shipping chosen. */
async function prepareCommonSheet() {
  const response = await request(app)
    .post('/api/boards/import')
    .field('name', 'Board X')
    .attach('file', Buffer.from(CSV, 'utf8'), 'Board-X-common.csv');
  const boardId = response.body.board.id;
  await request(app).put(`/api/boards/${boardId}`).send({ count: 2 });

  const view = (await request(app).get(`/api/boards/${boardId}/lines`)).body;
  const capacitor = findLine(view, (line) => line.value === '100 nF');
  await request(app)
    .put(`/api/boards/${boardId}/lines/${capacitor.id}`)
    .send({ common: true });

  const { product } = await createSellerWithProduct(
    app,
    { name: 'ChipDip' },
    { productName: 'Cap 100nF', packQty: 100, packPrice: 50 },
  );

  const common = (await request(app).get('/api/common-purchases')).body;
  const row = findLine(common, (line) => line.value === '100 nF');
  await request(app)
    .put('/api/common-purchases')
    .send({ matchKey: row.matchKey, productId: product.id, shippingCost: 7 });
}

test('common purchases CSV export has the sheet columns, values and totals', async () => {
  await prepareCommonSheet();

  const response = await request(app).get('/api/common-purchases/export?format=csv');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /text\/csv/);
  assert.match(response.headers['content-disposition'], /attachment/);

  const rows = parse(response.text, { delimiter: ';', bom: true });
  assert.deepEqual(rows[0], COMMON_HEADER);

  const row = rows.find((item) => item[0] === '100 nF');
  assert.ok(row, 'the common row is exported');
  const header = rows[0];
  const cell = (line, label) => line[header.indexOf(label)];
  assert.equal(cell(row, 'Нужно всего'), '2');
  assert.equal(cell(row, 'Продавец'), 'ChipDip');
  assert.equal(cell(row, 'Товар'), 'Cap 100nF');
  assert.equal(cell(row, 'В упаковке'), '100');
  assert.equal(cell(row, 'Цена упаковки'), '50');
  assert.equal(cell(row, 'Упаковок'), '1');
  assert.equal(cell(row, 'Доставка'), '7');
  assert.equal(cell(row, 'Стоимость'), '57'); // 1 pack * 50 + 7

  const totals = rows[rows.length - 1];
  assert.equal(totals[0], 'ИТОГО');
  assert.equal(cell(totals, 'Доставка'), '7');
  assert.equal(cell(totals, 'Стоимость'), '57');
});

test('the by_board common export adds a column per board', async () => {
  await prepareCommonSheet();

  const response = await request(app).get(
    '/api/common-purchases/export?format=csv&mode=by_board',
  );
  assert.equal(response.status, 200);

  const rows = parse(response.text, { delimiter: ';', bom: true });
  const header = rows[0];
  assert.ok(header.includes('Board X'), 'the board column is present');
  assert.ok(header.includes('Позиции'));

  const row = rows.find((item) => item[0] === '100 nF');
  assert.equal(row[header.indexOf('Board X')], '2');
});

test('common purchases XLSX export builds a workbook with header, row and totals', async () => {
  await prepareCommonSheet();

  const response = await request(app)
    .get('/api/common-purchases/export?format=xlsx')
    .buffer(true)
    .parse(binaryParser);
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /spreadsheetml/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(response.body);
  const worksheet = workbook.worksheets[0];
  assert.equal(worksheet.name, 'Общие закупки');
  assert.deepEqual(worksheet.getRow(1).values.slice(1), COMMON_HEADER);
  // Header + one position + totals row.
  assert.equal(worksheet.rowCount, 3);
  assert.equal(worksheet.getRow(3).getCell(1).value, 'ИТОГО');
  assert.equal(
    worksheet.getRow(3).getCell(COMMON_HEADER.indexOf('Стоимость') + 1).value,
    57,
  );
});

test('an unknown common export format or mode is rejected', async () => {
  const badFormat = await request(app).get('/api/common-purchases/export?format=pdf');
  assert.equal(badFormat.status, 400);
  assert.match(badFormat.body.error, /xlsx/);

  const badMode = await request(app).get('/api/common-purchases/export?mode=sideways');
  assert.equal(badMode.status, 400);
  assert.match(badMode.body.error, /merged/);
});

test('the manual board export carries the hand-added positions', async () => {
  const boards = (await request(app).get('/api/boards')).body;
  const serviceId = serviceBoardId(boards);
  assert.ok(serviceId, 'the service board exists');

  const created = await request(app)
    .post(`/api/boards/${serviceId}/lines`)
    .send({ value: 'Solder wire 0.5mm', qty: 5, footprint: '-' });
  assert.equal(created.status, 201);

  const response = await request(app).get(`/api/boards/${serviceId}/export?format=csv`);
  assert.equal(response.status, 200);

  const rows = parse(response.text, { delimiter: ';', bom: true });
  const row = rows.find((item) => item[3] === 'Solder wire 0.5mm');
  assert.ok(row, 'the manual line is exported');
});
