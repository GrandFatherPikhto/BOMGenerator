// Import of seller/product lists (legacy and two-level formats).
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import ExcelJS from 'exceljs';
import request from 'supertest';

import { connectTestDb, disconnectTestDb, prepareApp } from './helpers.js';

let app;

before(connectTestDb);
after(disconnectTestDb);
beforeEach(async () => {
  app = await prepareApp();
});

const LEGACY_CSV = [
  'Название;Категория;URL;Кол-во в упаковке;Цена за упаковку;Доставка;Описание',
  'Конденсаторы 0402;Cat A;https://a/1;1000;339;509;desc A',
  'Резисторы;Cat B;https://a/2;100;62;87;desc B',
  '',
].join('\r\n');

const TWO_LEVEL_CSV = [
  'Продавец;URL продавца;Товар;URL товара;Кол-во в упаковке;Цена за упаковку;Категория;Описание',
  'AliExpress;https://aliexpress.ru/store/1;Конденсаторы 0402;https://aliexpress.ru/item/1;1000;339;Керамика;desc 1',
  'AliExpress;https://aliexpress.ru/store/1;Резисторы 0402;https://aliexpress.ru/item/2;1000;256;Резисторы;desc 2',
  'ChipDip;https://chipdip.ru;Конденсаторы 0603;https://chipdip.ru/p/3;100;62;Керамика;desc 3',
  '',
].join('\r\n');

function importCsv(csv, fileName = 'list.csv') {
  return request(app)
    .post('/api/sellers/import')
    .attach('file', Buffer.from(csv, 'utf8'), fileName);
}

test('legacy format creates a seller plus one product per row', async () => {
  const response = await importCsv(LEGACY_CSV);
  assert.equal(response.status, 200);
  assert.equal(response.body.summary.sellersCreated, 2);
  assert.equal(response.body.summary.added, 2);
  assert.equal(response.body.summary.total, 2);

  const sellers = (await request(app).get('/api/sellers')).body;
  assert.deepEqual(
    sellers.map((seller) => seller.name).sort(),
    ['Конденсаторы 0402', 'Резисторы'],
  );
  assert.ok(sellers.every((seller) => seller.productCount === 1));

  const products = (await request(app).get('/api/products')).body;
  const capacitor = products.find((product) => product.name === 'Конденсаторы 0402');
  assert.equal(capacitor.sellerName, 'Конденсаторы 0402');
  assert.equal(capacitor.url, 'https://a/1'); // seller url = product url
  assert.equal(capacitor.packQty, 1000);
  assert.equal(capacitor.packPrice, 339);
});

test('two-level format groups products under one seller', async () => {
  const response = await importCsv(TWO_LEVEL_CSV);
  assert.equal(response.body.summary.sellersCreated, 2);
  assert.equal(response.body.summary.added, 3);

  const sellers = (await request(app).get('/api/sellers')).body;
  const ali = sellers.find((seller) => seller.name === 'AliExpress');
  assert.equal(ali.url, 'https://aliexpress.ru/store/1');
  assert.equal(ali.productCount, 2);

  const products = (await request(app).get(`/api/products?sellerId=${ali._id}`)).body;
  assert.deepEqual(
    products.map((product) => product.name).sort(),
    ['Конденсаторы 0402', 'Резисторы 0402'],
  );
});

test('a repeated import updates only changed names and keeps pack data', async () => {
  await importCsv(TWO_LEVEL_CSV);
  const changed = TWO_LEVEL_CSV.replace('Резисторы 0402', 'Резисторы 0402 NEW');
  const response = await importCsv(changed);
  assert.equal(response.body.summary.updated, 1);
  assert.equal(response.body.summary.unchanged, 2);
  assert.equal(response.body.summary.added, 0);

  const products = (await request(app).get('/api/products')).body;
  const resistor = products.find((product) => product.url === 'https://aliexpress.ru/item/2');
  assert.equal(resistor.name, 'Резисторы 0402 NEW');
  assert.equal(resistor.packQty, 1000); // kept
  assert.equal(resistor.packPrice, 256); // kept
});

test('XLSX import lists sheets and reads the selected one', async () => {
  const workbook = new ExcelJS.Workbook();
  const main = workbook.addWorksheet('Товары');
  main.addRow(['Продавец', 'Товар', 'URL товара', 'Кол-во в упаковке', 'Цена за упаковку']);
  main.addRow(['Seller A', 'Product A', 'https://x/1', 10, 5]);
  const second = workbook.addWorksheet('Другое');
  second.addRow(['Продавец', 'Товар', 'URL товара', 'Кол-во в упаковке', 'Цена за упаковку']);
  second.addRow(['Seller B', 'Product B', 'https://x/2', 20, 6]);
  const buffer = await workbook.xlsx.writeBuffer();

  const sheets = await request(app)
    .post('/api/sellers/import/sheets')
    .attach('file', buffer, 'list.xlsx');
  assert.deepEqual(sheets.body.sheets, ['Товары', 'Другое']);

  const response = await request(app)
    .post('/api/sellers/import')
    .field('sheet', 'Другое')
    .attach('file', buffer, 'list.xlsx');
  assert.equal(response.body.summary.added, 1);

  const products = (await request(app).get('/api/products')).body;
  assert.equal(products.length, 1);
  assert.equal(products[0].name, 'Product B');
  assert.equal(products[0].sellerName, 'Seller B');
});

test('unknown sheet is rejected with the available names', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Товары');
  sheet.addRow(['Продавец', 'Товар']);
  sheet.addRow(['S', 'P']);
  const buffer = await workbook.xlsx.writeBuffer();

  const response = await request(app)
    .post('/api/sellers/import')
    .field('sheet', 'Нет такого')
    .attach('file', buffer, 'list.xlsx');
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Товары/);
});
