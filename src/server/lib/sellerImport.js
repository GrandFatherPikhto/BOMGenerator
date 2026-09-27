// Parsing of seller/product lists from CSV and Excel (*.xlsx).
//
// Two formats are supported:
//   * two-level: "Продавец | URL продавца | Товар | URL товара | ..." — one
//     seller with many products;
//   * legacy: "Название | Категория | URL | Кол-во в упаковке | ..." — each row
//     becomes a seller (name/url) plus an attached product with the same
//     name/url, so the old files convert without any loss.
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

// Field -> accepted header names (compared case-insensitively).
const HEADER_ALIASES = {
  sellerName: ['продавец', 'название продавца', 'seller'],
  sellerUrl: ['url продавца', 'ссылка продавца', 'seller url'],
  productName: ['товар', 'название товара', 'продукт', 'product'],
  productUrl: ['url товара', 'ссылка товара', 'product url'],
  name: ['название', 'наименование', 'name'],
  url: ['url', 'ссылка', 'link'],
  category: ['категория', 'category'],
  packQty: [
    'кол-во в упаковке',
    'количество в упаковке',
    'кол-во',
    'количество',
    'упаковка',
    'packqty',
    'pack qty',
  ],
  packPrice: ['цена за упаковку', 'цена упаковки', 'цена', 'packprice', 'pack price'],
  shippingCost: ['доставка', 'shipping', 'shippingcost', 'shipping cost'],
  description: ['описание', 'комментарий', 'description', 'note'],
};

const SELLER_FIELDS = Object.keys(HEADER_ALIASES);
const HEADER_HINTS = ['sellerName', 'productName', 'name', 'url', 'productUrl'];

function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[:\s]+$/, '')
    .trim()
    .toLowerCase();
}

function aliasesFor(field) {
  return HEADER_ALIASES[field];
}

/**
 * Human-readable text of an ExcelJS cell value. Handles strings, numbers,
 * dates, hyperlinks, rich text and formula results.
 */
export function extractText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? '').join('');
    }
    if (value.text !== undefined && value.text !== null) {
      return extractText(value.text);
    }
    if (value.hyperlink) {
      return String(value.hyperlink);
    }
    if (value.result !== undefined) {
      return extractText(value.result);
    }
  }
  return '';
}

const HYPERLINK_ARG_RE = /HYPERLINK\(\s*"([^"]+)"/i;
const INLINE_URL_RE = /(https?:\/\/[^\s)]+)/i;

/**
 * Best-effort URL of a cell. Prefers a real Excel hyperlink, then the text,
 * and tolerates the "url (url)" artefact some exporters produce.
 */
export function extractUrl(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (typeof value.hyperlink === 'string' && value.hyperlink) {
      return value.hyperlink;
    }
    if (typeof value.formula === 'string') {
      const match = HYPERLINK_ARG_RE.exec(value.formula);
      if (match) {
        return match[1];
      }
    }
  }
  const text = extractText(value).trim();
  if (!text) {
    return '';
  }
  const inline = INLINE_URL_RE.exec(text);
  return inline ? inline[1] : text;
}

/**
 * Normalise a URL for matching: trim, drop a surrounding "<>", lowercase the
 * scheme and host, and remove a lone trailing slash. Keeps the path case.
 */
export function normalizeUrl(raw) {
  const text = String(raw ?? '').trim().replace(/^<|>$/g, '');
  if (!text) {
    return '';
  }
  try {
    const url = new URL(text);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    const base = `${url.protocol}//${url.host}`;
    const path = url.pathname === '/' ? '' : url.pathname;
    return `${base}${path}${url.search}${url.hash}`;
  } catch {
    return text;
  }
}

/** Decode a CSV buffer: UTF-8/UTF-16 by BOM, otherwise Windows-1251. */
export function decodeCsv(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  try {
    // `fatal` makes invalid UTF-8 throw instead of yielding U+FFFD.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}

/** Guess the delimiter from the header line: comma, semicolon, tab or pipe. */
export function detectDelimiter(text) {
  const headerLine = String(text).split(/\r?\n/).find((line) => line.trim()) ?? '';
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = headerLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function findHeaderRow(matrix) {
  const limit = Math.min(matrix.length, 25);
  for (let index = 0; index < limit; index += 1) {
    const cells = matrix[index].map(normalizeHeader);
    const matched = new Set();
    for (const field of SELLER_FIELDS) {
      if (cells.some((cell) => aliasesFor(field).includes(cell))) {
        matched.add(field);
      }
    }
    if (HEADER_HINTS.some((field) => matched.has(field))) {
      return { index, cells };
    }
  }
  return null;
}

function buildColumnMap(headerCells) {
  const map = {};
  for (const field of SELLER_FIELDS) {
    const index = headerCells.findIndex((cell) => aliasesFor(field).includes(cell));
    if (index >= 0) {
      map[field] = index;
    }
  }
  return map;
}

function toNumber(value, fallback) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) {
    return fallback;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return extractText(value).replace(/\s+/g, ' ').trim();
}

/**
 * Turn a matrix (array of rows of raw cells) into seller/product row objects.
 * The header row is detected by looking for the known columns, so leading title
 * rows are tolerated.
 */
export function mapSellerMatrix(matrix) {
  const header = findHeaderRow(matrix);
  if (!header) {
    return { rows: [], found: false, twoLevel: false };
  }
  const columnMap = buildColumnMap(header.cells);
  const twoLevel =
    columnMap.sellerName !== undefined || columnMap.productName !== undefined;
  const rows = [];

  for (let index = header.index + 1; index < matrix.length; index += 1) {
    const rawRow = matrix[index];
    const hasContent = rawRow.some(
      (cell) => extractText(cell).trim() !== '' || extractUrl(cell).trim() !== '',
    );
    if (!hasContent) {
      continue;
    }
    const pick = (field) =>
      columnMap[field] === undefined ? undefined : rawRow[columnMap[field]];
    const urlOf = (field) => normalizeUrl(extractUrl(pick(field)));

    const legacyName = normalizeText(pick('name'));
    const legacyUrl = urlOf('url');

    // Two-level format uses the dedicated columns; legacy rows are treated as a
    // seller with an attached product carrying the same name and URL.
    const sellerName = columnMap.sellerName === undefined
      ? legacyName
      : normalizeText(pick('sellerName'));
    const sellerUrl = columnMap.sellerUrl === undefined
      ? legacyUrl
      : urlOf('sellerUrl');
    const productName = columnMap.productName === undefined
      ? legacyName
      : normalizeText(pick('productName'));
    const productUrl = columnMap.productUrl === undefined
      ? legacyUrl
      : urlOf('productUrl');

    rows.push({
      rowNumber: index + 1,
      sellerName,
      sellerUrl,
      productName,
      productUrl,
      category: normalizeText(pick('category')),
      packQty: Math.max(1, Math.trunc(toNumber(pick('packQty'), 1))),
      packPrice: Math.max(0, toNumber(pick('packPrice'), 0)),
      shippingCost: Math.max(0, toNumber(pick('shippingCost'), 0)),
      description: normalizeText(pick('description')),
    });
  }

  return { rows, found: true, twoLevel };
}

/** Parse a CSV buffer (any of the supported encodings/delimiters). */
export function parseCsvSellers(buffer) {
  const text = decodeCsv(buffer);
  const delimiter = detectDelimiter(text);
  const matrix = parse(text, {
    bom: true,
    delimiter,
    skip_empty_lines: false,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  });
  return { ...mapSellerMatrix(matrix), delimiter };
}

/** Sheet names of an XLSX buffer. */
export async function readWorkbookSheetNames(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets.map((worksheet) => worksheet.name);
}

/** Parse one sheet of an XLSX buffer. */
export async function parseXlsxSellers(buffer, sheetName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheetNames = workbook.worksheets.map((worksheet) => worksheet.name);
  if (sheetNames.length === 0) {
    return { rows: [], sheetNames, found: false };
  }

  const worksheet = sheetName
    ? workbook.getWorksheet(sheetName)
    : workbook.worksheets[0];
  if (!worksheet) {
    return { rows: [], sheetNames, found: false, unknownSheet: true };
  }

  const matrix = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    matrix.push(values);
  });

  return { ...mapSellerMatrix(matrix), sheetNames };
}
