// Integration tests for seller import (CSV + XLSX).
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

const CSV = [
  'Название;Категория;URL;Кол-во в упаковке;Цена за упаковку;Доставка;Описание',
  'Конденсаторы 0402;Cat A;https://a/1;1000;339;509;desc A',
  'Резисторы;Cat B;https://a/2;100;62;87;desc B',
  'Без ссылки;Cat C;;10;5;0;no url',
  '',
].join('\r\n');

function importCsv(csv, fileName = 'sellers.csv') {
  return request(app)
    .post('/api/sellers/import')
    .attach('file', Buffer.from(csv, 'utf8'), fileName);
}

test('CSV import creates sellers and skips rows without a URL', async () => {
  const response = await importCsv(CSV);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.summary, {
    added: 2,
    updated: 0,
    unchanged: 0,
    skipped: 1,
    total: 3,
  });
  assert.ok(response.body.warnings.some((warning) => warning.includes('no URL')));

  const sellers = (await request(app).get('/api/sellers')).body;
  assert.equal(sellers.length, 2);
  const capacitor = sellers.find((seller) => seller.url === 'https://a/1');
  assert.equal(capacitor.name, 'Конденсаторы 0402');
  assert.equal(capacitor.packQty, 1000);
  assert.equal(capacitor.packPrice, 339);
});

test('an existing seller (by URL) gets only its name and URL updated', async () => {
  await request(app).post('/api/sellers').send({
    name: 'Старое имя',
    category: 'KeepCat',
    url: 'https://a/1',
    packQty: 500,
    packPrice: 999,
    shippingCost: 7,
    description: 'KeepDesc',
  });

  const csv = [
    'Название;Категория;URL;Кол-во в упаковке;Цена за упаковку;Доставка;Описание',
    'Новое имя;NewCat;https://a/1;11;22;33;NewDesc',
    '',
  ].join('\r\n');
  const response = await importCsv(csv);
  assert.equal(response.body.summary.updated, 1);
  assert.equal(response.body.summary.added, 0);

  const sellers = (await request(app).get('/api/sellers')).body;
  const seller = sellers.find((item) => item.url === 'https://a/1');
  assert.equal(seller.name, 'Новое имя'); // updated
  assert.equal(seller.packQty, 500); // kept
  assert.equal(seller.packPrice, 999); // kept
  assert.equal(seller.shippingCost, 7); // kept
  assert.equal(seller.category, 'KeepCat'); // kept
  assert.equal(seller.description, 'KeepDesc'); // kept
});

test('duplicate URLs in the file keep the first row', async () => {
  const csv = [
    'Название;URL',
    'Первое имя;https://dup/1',
    'Второе имя;https://dup/1',
    '',
  ].join('\r\n');
  const response = await importCsv(csv);
  assert.equal(response.body.summary.added, 1);
  assert.equal(response.body.summary.skipped, 1);

  const sellers = (await request(app).get('/api/sellers')).body;
  assert.equal(sellers.length, 1);
  assert.equal(sellers[0].name, 'Первое имя');
});

test('XLSX import lists sheets and reads the selected one', async () => {
  const workbook = new ExcelJS.Workbook();
  const main = workbook.addWorksheet('Продавцы');
  main.addRow(['Название', 'URL', 'Кол-во в упаковке', 'Цена за упаковку']);
  main.addRow(['Главный', 'https://x/1', 10, 5]);
  const second = workbook.addWorksheet('Ali');
  second.addRow(['Название', 'URL', 'Кол-во в упаковке', 'Цена за упаковку']);
  second.addRow(['Из второго листа', 'https://x/2', 20, 6]);
  const buffer = await workbook.xlsx.writeBuffer();

  const sheets = await request(app)
    .post('/api/sellers/import/sheets')
    .attach('file', buffer, 'sellers.xlsx');
  assert.equal(sheets.status, 200);
  assert.deepEqual(sheets.body.sheets, ['Продавцы', 'Ali']);

  const response = await request(app)
    .post('/api/sellers/import')
    .field('sheet', 'Ali')
    .attach('file', buffer, 'sellers.xlsx');
  assert.equal(response.status, 200);
  assert.equal(response.body.summary.added, 1);

  const sellers = (await request(app).get('/api/sellers')).body;
  assert.equal(sellers.length, 1);
  assert.equal(sellers[0].name, 'Из второго листа');
  assert.equal(sellers[0].url, 'https://x/2');
});

test('unknown sheet is rejected with the available names', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Продавцы');
  sheet.addRow(['Название', 'URL']);
  sheet.addRow(['X', 'https://x/1']);
  const buffer = await workbook.xlsx.writeBuffer();

  const response = await request(app)
    .post('/api/sellers/import')
    .field('sheet', 'Нет такого')
    .attach('file', buffer, 'sellers.xlsx');
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Продавцы/);
});
