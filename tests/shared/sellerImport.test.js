// Unit tests for the seller-list parsing helpers (CSV encodings + XLSX cells).
import assert from 'node:assert/strict';
import test from 'node:test';

import ExcelJS from 'exceljs';

import {
  decodeCsv,
  detectDelimiter,
  extractUrl,
  mapSellerMatrix,
  normalizeUrl,
  parseCsvSellers,
  parseXlsxSellers,
  readWorkbookSheetNames,
} from '../../src/server/lib/sellerImport.js';

test('normalizeUrl lowercases scheme/host and trims', () => {
  assert.equal(normalizeUrl('  <https://Example.COM> '), 'https://example.com');
  assert.equal(normalizeUrl('https://example.com/'), 'https://example.com');
  assert.equal(normalizeUrl(''), '');
  assert.equal(normalizeUrl('not a url'), 'not a url');
});

test('detectDelimiter picks the most frequent separator', () => {
  assert.equal(detectDelimiter('a;b;c'), ';');
  assert.equal(detectDelimiter('a,b,c'), ',');
  assert.equal(detectDelimiter('a\tb\tc'), '\t');
});

test('decodeCsv decodes Windows-1251 without BOM', () => {
  // "Название" in CP1251
  const bytes = Buffer.from([0xcd, 0xe0, 0xe7, 0xe2, 0xe0, 0xed, 0xe8, 0xe5]);
  assert.equal(decodeCsv(bytes), 'Название');
});

test('decodeCsv strips a UTF-8 BOM', () => {
  const bytes = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from('URL', 'utf8'),
  ]);
  assert.equal(decodeCsv(bytes), 'URL');
});

test('parseCsvSellers reads a cp1251 semicolon CSV', () => {
  // The whole file is Windows-1251: "Название;URL" then "Тест;https://a/1;".
  const header = Buffer.from([
    0xcd, 0xe0, 0xe7, 0xe2, 0xe0, 0xed, 0xe8, 0xe5, // Название
    0x3b, // ;
    0x55, 0x52, 0x4c, // URL
    0x0d, 0x0a,
  ]);
  const body = Buffer.concat([
    Buffer.from([0xd2, 0xe5, 0xf1, 0xf2]), // Тест
    Buffer.from(';https://a/1;\r\n', 'ascii'),
  ]);
  const parsed = parseCsvSellers(Buffer.concat([header, body]));

  assert.equal(parsed.delimiter, ';');
  assert.equal(parsed.found, true);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].name, 'Тест');
  assert.equal(parsed.rows[0].url, 'https://a/1');
});

test('mapSellerMatrix detects the header row and maps columns', () => {
  const matrix = [
    ['Отчёт по продавцам'],
    ['Название', 'Категория', 'URL', 'Кол-во в упаковке', 'Цена за упаковку'],
    ['Конденсаторы', 'Cat', 'https://a/1', '1000', '339'],
  ];
  const { rows, found } = mapSellerMatrix(matrix);
  assert.equal(found, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Конденсаторы');
  assert.equal(rows[0].category, 'Cat');
  assert.equal(rows[0].url, 'https://a/1');
  assert.equal(rows[0].packQty, 1000);
  assert.equal(rows[0].packPrice, 339);
});

test('extractUrl prefers hyperlinks and tolerates "url (url)" text', () => {
  assert.equal(
    extractUrl({ text: 'https://a/1', hyperlink: 'https://a/1' }),
    'https://a/1',
  );
  assert.equal(
    extractUrl({
      formula: 'HYPERLINK("https://x/y","https://x/y")',
      result: 'https://x/y',
    }),
    'https://x/y',
  );
  assert.equal(extractUrl('https://a/1 (https://a/1)'), 'https://a/1');
  assert.equal(extractUrl({ richText: [{ text: 'https://z/9' }] }), 'https://z/9');
  assert.equal(extractUrl(undefined), '');
});

test('parseXlsxSellers lists sheets and reads the requested one', async () => {
  const workbook = new ExcelJS.Workbook();
  const main = workbook.addWorksheet('Продавцы');
  main.addRow(['Название', 'Категория', 'URL', 'Кол-во в упаковке']);
  main.addRow(['Первый', 'Cat', 'https://a/1', 100]);
  const second = workbook.addWorksheet('Лист2');
  second.addRow(['Название', 'URL']);
  second.addRow(['Второй', 'https://a/2']);
  const buffer = await workbook.xlsx.writeBuffer();

  const sheetNames = await readWorkbookSheetNames(buffer);
  assert.deepEqual(sheetNames, ['Продавцы', 'Лист2']);

  const fromMain = await parseXlsxSellers(buffer, 'Продавцы');
  assert.equal(fromMain.rows[0].name, 'Первый');
  assert.equal(fromMain.rows[0].url, 'https://a/1');

  const fromSecond = await parseXlsxSellers(buffer, 'Лист2');
  assert.equal(fromSecond.rows[0].name, 'Второй');
  assert.equal(fromSecond.rows[0].url, 'https://a/2');

  const unknown = await parseXlsxSellers(buffer, 'Нет такого');
  assert.equal(unknown.unknownSheet, true);
});
