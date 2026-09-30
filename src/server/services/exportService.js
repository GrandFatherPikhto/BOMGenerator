// Export purchase tables to Excel (*.xlsx) or CSV.
//
// There are two datasets:
//   * one board's purchase table (rows come from `getBoardView`, so the order —
//     category/subcategory blocks — and the calculated columns match the screen);
//   * the "common purchases" sheet (rows come from `getCommonPurchases`).
// Both are rendered through the same column-driven builders below.
import ExcelJS from 'exceljs';

import { COMMON_MODES } from '../../shared/index.js';
import { badRequest } from '../lib/httpError.js';
import { Seller } from '../models/Seller.js';
import { SellerProduct } from '../models/SellerProduct.js';
import { getBoardView } from './boardService.js';
import { getCommonPurchases } from './commonPurchaseService.js';

export const EXPORT_FORMATS = ['xlsx', 'csv'];

const BOARD_COLUMNS = [
  { label: 'Категория', key: 'category' },
  { label: 'Подкатегория', key: 'subcategory' },
  { label: 'Обозначения', key: 'reference' },
  { label: 'Наименование', key: 'value' },
  { label: 'Корпус/Footprint', key: 'footprint' },
  { label: 'Штук на плату', key: 'qty', numeric: true },
  { label: 'Плат', key: 'boardCount', numeric: true },
  { label: 'Итого', key: 'totalQty', numeric: true },
  { label: 'Общие', key: 'commonLabel' },
  { label: 'Не закупается', key: 'notPurchasedLabel' },
  { label: 'Продавец', key: 'sellerName' },
  { label: 'URL', key: 'sellerUrl' },
  { label: 'В упаковке', key: 'packQty', numeric: true },
  { label: 'Цена упаковки', key: 'packPrice', numeric: true, money: true },
  { label: 'Упаковок', key: 'packs', numeric: true },
  { label: 'Доставка', key: 'shippingCost', numeric: true, money: true, total: true },
  { label: 'Стоимость', key: 'cost', numeric: true, money: true, total: true },
  { label: 'Описание', key: 'description' },
];

const COMMON_SHEET_NAME = 'Общие закупки';

function normalizeFormat(format) {
  const normalized = String(format ?? 'xlsx').toLowerCase();
  if (!EXPORT_FORMATS.includes(normalized)) {
    throw badRequest(`format must be one of ${EXPORT_FORMATS.join(', ')}`);
  }
  return normalized;
}

function toBoardRows(view, productMap, sellerMap) {
  return view.blocks
    .filter((block) => block.kind === 'line')
    .map((block) => block.line)
    .map((line) => {
      const product = line.productId
        ? productMap.get(String(line.productId)) ?? null
        : null;
      const seller = product ? sellerMap.get(String(product.sellerId)) ?? null : null;
      return {
        category: line.category ?? '',
        subcategory: line.subcategory ?? '',
        reference: line.reference ?? '',
        value: line.value ?? '',
        footprint: line.footprint ?? '',
        qty: line.qty ?? '',
        boardCount: view.board.count,
        totalQty: line.totalQty ?? '',
        commonLabel: line.common ? 'Да' : '',
        notPurchasedLabel: line.notPurchased ? 'Да' : '',
        sellerName: seller?.name ?? '',
        // The product link wins; the seller page is the fallback.
        sellerUrl: product?.url || seller?.url || '',
        packQty: product?.packQty ?? '',
        packPrice: product?.packPrice ?? '',
        packs: line.packs ?? '',
        shippingCost: line.shippingCost ?? '',
        cost: line.cost ?? '',
        description: line.description ?? '',
      };
    });
}

/** Columns of the "common purchases" sheet, matching its on-screen table. */
function commonColumns(view, mode) {
  const columns = [
    { label: 'Наименование', key: 'value' },
    { label: 'Корпус/Footprint', key: 'footprint' },
    { label: 'Нужно всего', key: 'totalQty', numeric: true },
  ];

  if (mode === 'by_board') {
    for (const boardName of view.boardNames ?? []) {
      columns.push({
        label: boardName,
        key: `board:${boardName}`,
        numeric: true,
      });
    }
  }

  columns.push(
    // Grouped rows stand for several values on one footprint; their names would
    // otherwise be lost, so they are listed here.
    { label: 'Позиции', key: 'names' },
    { label: 'Продавец', key: 'sellerName' },
    { label: 'Товар', key: 'productName' },
    { label: 'Не закупается', key: 'notPurchasedLabel' },
    { label: 'В упаковке', key: 'packQty', numeric: true },
    { label: 'Цена упаковки', key: 'packPrice', numeric: true, money: true },
    { label: 'Упаковок', key: 'packs', numeric: true },
    { label: 'Доставка', key: 'shippingCost', numeric: true, money: true, total: true },
    { label: 'Стоимость', key: 'cost', numeric: true, money: true, total: true },
  );

  return columns;
}

function toCommonRows(view, mode, productMap, sellerMap) {
  return view.blocks
    .filter((block) => block.kind === 'line')
    .map((block) => block.line)
    .map((line) => {
      const product = line.productId
        ? productMap.get(String(line.productId)) ?? null
        : null;
      const seller = product ? sellerMap.get(String(product.sellerId)) ?? null : null;
      const row = {
        value: line.grouped ? 'Группа по посадочному месту' : line.value ?? '',
        footprint: line.footprint ?? '',
        totalQty: line.totalQty ?? '',
        names: line.grouped ? (line.names ?? []).join(', ') : '',
        sellerName: seller?.name ?? '',
        productName: product?.name ?? '',
        notPurchasedLabel: line.notPurchased ? 'Да' : '',
        packQty: product?.packQty ?? '',
        packPrice: product?.packPrice ?? '',
        packs: line.packs ?? '',
        shippingCost: line.shippingCost ?? '',
        cost: line.cost ?? '',
      };
      if (mode === 'by_board') {
        for (const [boardName, qty] of Object.entries(line.byBoard ?? {})) {
          row[`board:${boardName}`] = qty;
        }
      }
      return row;
    });
}

function isBlank(value) {
  return value === null || value === undefined || value === '';
}

function numberText(value) {
  return isBlank(value) ? '' : String(value).replace('.', ',');
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[";\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** The "ИТОГО" row: the label in the first cell, the sums in the `total` ones. */
function buildTotalsRow(columns, totals) {
  return columns.map((column, index) => {
    if (index === 0) {
      return 'ИТОГО';
    }
    return column.total ? (totals[column.key] ?? '') : '';
  });
}

function buildCsv(columns, rows, totals) {
  const header = columns.map((column) => column.label);
  const body = rows.map((row) =>
    columns.map((column) => {
      const value = row[column.key];
      if (column.numeric) {
        return numberText(value);
      }
      return isBlank(value) ? '' : String(value);
    }),
  );

  const totalsRow = buildTotalsRow(columns, totals).map((value) =>
    typeof value === 'number' ? numberText(value) : value,
  );

  const lines = [header, ...body, totalsRow].map((row) =>
    row.map(csvEscape).join(';'),
  );
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function sanitizeSheetTitle(name) {
  const title = String(name ?? 'BOM')
    .replace(/[[\]:*?/\\]/g, ' ')
    .trim();
  return (title || 'BOM').slice(0, 31);
}

async function buildXlsx({ sheetName, columns, rows, totals }) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sanitizeSheetTitle(sheetName));

  worksheet.columns = columns.map((column) => ({
    header: column.label,
    key: column.key,
    width: Math.min(40, Math.max(10, column.label.length + 2)),
  }));

  for (const row of rows) {
    worksheet.addRow(
      columns.reduce((accumulator, column) => {
        const value = row[column.key];
        accumulator[column.key] =
          column.numeric && !isBlank(value) ? Number(value) : isBlank(value) ? '' : String(value);
        return accumulator;
      }, {}),
    );
  }

  const totalsRow = worksheet.addRow(
    columns.reduce((accumulator, column, index) => {
      if (index === 0) {
        accumulator[column.key] = 'ИТОГО';
      } else if (column.total) {
        accumulator[column.key] = totals[column.key] ?? '';
      } else {
        accumulator[column.key] = '';
      }
      return accumulator;
    }, {}),
  );

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' },
  };
  totalsRow.font = { bold: true };

  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  columns.forEach((column, index) => {
    if (column.money) {
      worksheet.getColumn(index + 1).numFmt = '#,##0.00';
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function fileName(baseName, format) {
  const base = String(baseName ?? 'export')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  return `${base || 'export'}.${format}`;
}

/**
 * Build a RFC 5987 `Content-Disposition`. HTTP headers are latin-1, so a
 * non-ASCII file name (e.g. «Общие закупки.xlsx») may only appear in the
 * `filename*` part; the quoted `filename` carries an ASCII-only fallback.
 */
export function contentDisposition(filename) {
  const name = String(filename ?? 'export');
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function loadCatalog() {
  const [products, sellers] = await Promise.all([
    SellerProduct.find().lean(),
    Seller.find().lean(),
  ]);
  return {
    productMap: new Map(products.map((product) => [String(product._id), product])),
    sellerMap: new Map(sellers.map((seller) => [String(seller._id), seller])),
  };
}

/**
 * Build an export for one board.
 * Returns `{ filename, contentType, body }` where `body` is a Buffer (xlsx) or
 * a string (csv).
 */
export async function exportBoard(boardId, format = 'xlsx') {
  const normalized = normalizeFormat(format);

  const view = await getBoardView(boardId);
  const { productMap, sellerMap } = await loadCatalog();
  const rows = toBoardRows(view, productMap, sellerMap);
  const totals = {
    shippingCost: view.totals.shippingCost,
    cost: view.totals.cost,
  };

  if (normalized === 'csv') {
    return {
      filename: fileName(view.board.name, 'csv'),
      contentType: 'text/csv; charset=utf-8',
      body: buildCsv(BOARD_COLUMNS, rows, totals),
    };
  }

  return {
    filename: fileName(view.board.name, 'xlsx'),
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: await buildXlsx({
      sheetName: view.board.name,
      columns: BOARD_COLUMNS,
      rows,
      totals,
    }),
  };
}

/**
 * Build an export for the "common purchases" sheet in the given mode.
 * Returns `{ filename, contentType, body }` where `body` is a Buffer (xlsx) or
 * a string (csv).
 */
export async function exportCommonPurchases(mode = 'merged', format = 'xlsx') {
  const normalizedFormat = normalizeFormat(format);
  const normalizedMode = String(mode ?? 'merged').toLowerCase();
  if (!COMMON_MODES.includes(normalizedMode)) {
    throw badRequest(`mode must be one of ${COMMON_MODES.join(', ')}`);
  }

  const view = await getCommonPurchases(normalizedMode);
  const { productMap, sellerMap } = await loadCatalog();
  const columns = commonColumns(view, normalizedMode);
  const rows = toCommonRows(view, normalizedMode, productMap, sellerMap);
  const totals = {
    shippingCost: view.totals.shippingCost,
    cost: view.totals.cost,
  };

  if (normalizedFormat === 'csv') {
    return {
      filename: fileName(COMMON_SHEET_NAME, 'csv'),
      contentType: 'text/csv; charset=utf-8',
      body: buildCsv(columns, rows, totals),
    };
  }

  return {
    filename: fileName(COMMON_SHEET_NAME, 'xlsx'),
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: await buildXlsx({
      sheetName: COMMON_SHEET_NAME,
      columns,
      rows,
      totals,
    }),
  };
}
