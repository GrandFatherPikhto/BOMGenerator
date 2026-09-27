// Export one board's purchase table to Excel (*.xlsx) or CSV.
//
// The rows come from `getBoardView`, so the order (category/subcategory blocks)
// and the calculated columns are exactly the same as on screen.
import ExcelJS from 'exceljs';

import { badRequest } from '../lib/httpError.js';
import { Seller } from '../models/Seller.js';
import { getBoardView } from './boardService.js';

export const EXPORT_FORMATS = ['xlsx', 'csv'];

const COLUMNS = [
  { label: 'Категория', key: 'category' },
  { label: 'Подкатегория', key: 'subcategory' },
  { label: 'Обозначения', key: 'reference' },
  { label: 'Наименование', key: 'value' },
  { label: 'Корпус/Footprint', key: 'footprint' },
  { label: 'Штук на плату', key: 'qty', numeric: true },
  { label: 'Плат', key: 'boardCount', numeric: true },
  { label: 'Итого', key: 'totalQty', numeric: true },
  { label: 'Общие', key: 'commonLabel' },
  { label: 'Продавец', key: 'sellerName' },
  { label: 'URL', key: 'sellerUrl' },
  { label: 'В упаковке', key: 'packQty', numeric: true },
  { label: 'Цена упаковки', key: 'packPrice', numeric: true, money: true },
  { label: 'Упаковок', key: 'packs', numeric: true },
  { label: 'Доставка', key: 'shippingCost', numeric: true, money: true },
  { label: 'Стоимость', key: 'cost', numeric: true, money: true },
  { label: 'Описание', key: 'description' },
];

function toRows(view, sellerMap) {
  return view.blocks
    .filter((block) => block.kind === 'line')
    .map((block) => block.line)
    .map((line) => {
      const seller = line.sellerId ? sellerMap.get(String(line.sellerId)) : null;
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
        sellerName: seller?.name ?? '',
        sellerUrl: seller?.url ?? '',
        packQty: seller?.packQty ?? '',
        packPrice: seller?.packPrice ?? '',
        packs: line.packs ?? '',
        shippingCost: line.shippingCost ?? '',
        cost: line.cost ?? '',
        description: line.description ?? '',
      };
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

function buildCsv(rows, totals) {
  const header = COLUMNS.map((column) => column.label);
  const body = rows.map((row) =>
    COLUMNS.map((column) => {
      const value = row[column.key];
      if (column.numeric) {
        return numberText(value);
      }
      return isBlank(value) ? '' : String(value);
    }),
  );

  const totalsRow = COLUMNS.map((column, index) => {
    if (index === 0) {
      return 'ИТОГО';
    }
    if (column.key === 'shippingCost') {
      return numberText(totals.shippingCost);
    }
    if (column.key === 'cost') {
      return numberText(totals.cost);
    }
    return '';
  });

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

async function buildXlsx(board, rows, totals) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sanitizeSheetTitle(board.name));

  worksheet.columns = COLUMNS.map((column) => ({
    header: column.label,
    key: column.key,
    width: Math.min(40, Math.max(10, column.label.length + 2)),
  }));

  for (const row of rows) {
    worksheet.addRow(
      COLUMNS.reduce((accumulator, column) => {
        const value = row[column.key];
        accumulator[column.key] =
          column.numeric && !isBlank(value) ? Number(value) : isBlank(value) ? '' : String(value);
        return accumulator;
      }, {}),
    );
  }

  const totalsRow = worksheet.addRow(
    COLUMNS.reduce((accumulator, column, index) => {
      if (index === 0) {
        accumulator[column.key] = 'ИТОГО';
      } else if (column.key === 'shippingCost') {
        accumulator[column.key] = totals.shippingCost;
      } else if (column.key === 'cost') {
        accumulator[column.key] = totals.cost;
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
    to: { row: 1, column: COLUMNS.length },
  };

  COLUMNS.forEach((column, index) => {
    if (column.money) {
      worksheet.getColumn(index + 1).numFmt = '#,##0.00';
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function fileName(boardName, format) {
  const base = String(boardName ?? 'board')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  return `${base || 'board'}.${format}`;
}

/**
 * Build an export for one board.
 * Returns `{ filename, contentType, body }` where `body` is a Buffer (xlsx) or
 * a string (csv).
 */
export async function exportBoard(boardId, format = 'xlsx') {
  const normalized = String(format).toLowerCase();
  if (!EXPORT_FORMATS.includes(normalized)) {
    throw badRequest(`format must be one of ${EXPORT_FORMATS.join(', ')}`);
  }

  const view = await getBoardView(boardId);
  const sellers = await Seller.find().lean();
  const sellerMap = new Map(sellers.map((seller) => [String(seller._id), seller]));
  const rows = toRows(view, sellerMap);
  const totals = {
    shippingCost: view.totals.shippingCost,
    cost: view.totals.cost,
  };

  if (normalized === 'csv') {
    return {
      filename: fileName(view.board.name, 'csv'),
      contentType: 'text/csv; charset=utf-8',
      body: buildCsv(rows, totals),
    };
  }

  return {
    filename: fileName(view.board.name, 'xlsx'),
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: await buildXlsx(view.board, rows, totals),
  };
}
