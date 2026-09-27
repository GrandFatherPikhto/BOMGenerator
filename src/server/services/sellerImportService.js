// Import a seller list from CSV or Excel.
//
// Rules (agreed with the owner):
// * sellers are matched by URL;
// * an existing seller (same URL) gets only `name` and `url` updated — its
//   packaging quantity, price, shipping, category and description are kept;
// * a new seller is created with every column of the file;
// * duplicate URLs inside the file: the first row wins;
// * rows without a URL or without a name are skipped with a warning.
import { badRequest } from '../lib/httpError.js';
import {
  normalizeUrl,
  parseCsvSellers,
  parseXlsxSellers,
  readWorkbookSheetNames,
} from '../lib/sellerImport.js';
import { Seller } from '../models/Seller.js';

const XLSX_EXTENSION = /\.(xlsx|xlsm)$/i;

/** Sheet names of an uploaded workbook (empty for CSV). */
export async function listSellerSheets({ buffer, fileName }) {
  if (!buffer) {
    throw badRequest('A file is required');
  }
  if (!XLSX_EXTENSION.test(fileName || '')) {
    return { kind: 'csv', sheets: [] };
  }
  const sheets = await readWorkbookSheetNames(buffer);
  return { kind: 'xlsx', sheets };
}

export async function importSellers({ buffer, fileName, sheet }) {
  if (!buffer) {
    throw badRequest('A file is required');
  }

  const isXlsx = XLSX_EXTENSION.test(fileName || '');
  let parsed;
  if (isXlsx) {
    parsed = await parseXlsxSellers(buffer, sheet || undefined);
    if (parsed.unknownSheet) {
      throw badRequest(
        `Sheet "${sheet}" not found. Available: ${parsed.sheetNames.join(', ')}`,
      );
    }
  } else {
    parsed = parseCsvSellers(buffer);
  }
  if (!parsed.found) {
    throw badRequest(
      'Could not find a header row with "URL"/"Название" columns in the file',
    );
  }

  const warnings = [];
  const summary = { added: 0, updated: 0, unchanged: 0, skipped: 0, total: parsed.rows.length };

  // First-occurrence-wins deduplication by URL.
  const rowsByUrl = new Map();
  for (const row of parsed.rows) {
    if (!row.url) {
      warnings.push(`Row ${row.rowNumber}: skipped (no URL)`);
      summary.skipped += 1;
      continue;
    }
    if (!row.name) {
      warnings.push(`Row ${row.rowNumber}: skipped (no name) for ${row.url}`);
      summary.skipped += 1;
      continue;
    }
    const first = rowsByUrl.get(row.url);
    if (first) {
      warnings.push(
        `Row ${row.rowNumber}: duplicate URL, keeping row ${first.rowNumber}`,
      );
      summary.skipped += 1;
      continue;
    }
    rowsByUrl.set(row.url, row);
  }

  const existingSellers = await Seller.find().lean();
  const sellerByUrl = new Map();
  const sellerByName = new Map();
  for (const seller of existingSellers) {
    const key = normalizeUrl(seller.url);
    if (key) {
      sellerByUrl.set(key, seller);
    }
    sellerByName.set(seller.name, seller);
  }

  for (const row of rowsByUrl.values()) {
    const current = sellerByUrl.get(row.url);

    if (current) {
      const nameOwner = sellerByName.get(row.name);
      if (nameOwner && String(nameOwner._id) !== String(current._id)) {
        warnings.push(
          `Row ${row.rowNumber}: name "${row.name}" already belongs to another seller, skipped`,
        );
        summary.skipped += 1;
        continue;
      }

      const changes = {};
      if (current.name !== row.name) {
        changes.name = row.name;
        sellerByName.delete(current.name);
        sellerByName.set(row.name, current);
      }
      if (normalizeUrl(current.url) !== row.url) {
        changes.url = row.url;
      }

      if (Object.keys(changes).length === 0) {
        summary.unchanged += 1;
      } else {
        // Only name/url: packaging, price, shipping, category, description stay.
        await Seller.updateOne({ _id: current._id }, { $set: changes });
        summary.updated += 1;
      }
      continue;
    }

    if (sellerByName.has(row.name)) {
      warnings.push(
        `Row ${row.rowNumber}: name "${row.name}" is already in use, skipped`,
      );
      summary.skipped += 1;
      continue;
    }

    try {
      const created = await Seller.create({
        name: row.name,
        category: row.category,
        url: row.url,
        packQty: row.packQty,
        packPrice: row.packPrice,
        shippingCost: row.shippingCost,
        description: row.description,
      });
      sellerByName.set(created.name, created);
      sellerByUrl.set(row.url, created);
      summary.added += 1;
    } catch (error) {
      if (error?.code === 11000) {
        warnings.push(`Row ${row.rowNumber}: duplicate name "${row.name}", skipped`);
        summary.skipped += 1;
      } else {
        throw error;
      }
    }
  }

  return { summary, warnings, sheets: parsed.sheetNames };
}
