// Import a seller/product list from CSV or Excel.
//
// Two formats are accepted (see lib/sellerImport.js). Each row produces a
// seller (matched by name) and a product of that seller (matched by URL, or by
// name when the URL is empty). Existing products get only their name/URL
// refreshed; packaging, price, category and description are kept.
import { badRequest } from '../lib/httpError.js';
import {
  normalizeUrl,
  parseCsvSellers,
  parseXlsxSellers,
  readWorkbookSheetNames,
} from '../lib/sellerImport.js';
import { Seller } from '../models/Seller.js';
import { SellerProduct } from '../models/SellerProduct.js';

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
      'Could not find a header row with seller/product columns in the file',
    );
  }

  const warnings = [];
  const summary = {
    added: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    total: parsed.rows.length,
    sellersCreated: 0,
    sellersUpdated: 0,
  };

  // Deduplicate by seller + product (url when present, else name); first wins.
  const seen = new Map();
  const rows = [];
  for (const row of parsed.rows) {
    if (!row.sellerName) {
      warnings.push(`Row ${row.rowNumber}: skipped (no seller name)`);
      summary.skipped += 1;
      continue;
    }
    if (!row.productName) {
      warnings.push(`Row ${row.rowNumber}: skipped (no product name)`);
      summary.skipped += 1;
      continue;
    }
    const key = `${row.sellerName.toLowerCase()}\u0000${
      row.productUrl || row.productName.toLowerCase()
    }`;
    const first = seen.get(key);
    if (first) {
      warnings.push(`Row ${row.rowNumber}: duplicate, keeping row ${first}`);
      summary.skipped += 1;
      continue;
    }
    seen.set(key, row.rowNumber);
    rows.push(row);
  }

  const existingSellers = await Seller.find().lean();
  const sellerByName = new Map(existingSellers.map((seller) => [seller.name, seller]));
  const productsBySeller = new Map();

  async function productsOf(seller) {
    const key = String(seller._id);
    if (!productsBySeller.has(key)) {
      productsBySeller.set(key, await SellerProduct.find({ sellerId: seller._id }).lean());
    }
    return productsBySeller.get(key);
  }

  for (const row of rows) {
    let seller = sellerByName.get(row.sellerName);
    if (!seller) {
      seller = await Seller.create({ name: row.sellerName, url: row.sellerUrl });
      sellerByName.set(row.sellerName, seller);
      productsBySeller.set(String(seller._id), []);
      summary.sellersCreated += 1;
    } else if (row.sellerUrl && normalizeUrl(seller.url) !== row.sellerUrl) {
      await Seller.updateOne({ _id: seller._id }, { $set: { url: row.sellerUrl } });
      seller.url = row.sellerUrl;
      summary.sellersUpdated += 1;
    }

    const products = await productsOf(seller);
    const current = row.productUrl
      ? products.find((product) => normalizeUrl(product.url) === row.productUrl)
      : products.find((product) => product.name === row.productName);

    if (current) {
      const changes = {};
      if (current.name !== row.productName) {
        changes.name = row.productName;
      }
      if (row.productUrl && normalizeUrl(current.url) !== row.productUrl) {
        changes.url = row.productUrl;
      }
      if (Object.keys(changes).length === 0) {
        summary.unchanged += 1;
      } else {
        await SellerProduct.updateOne({ _id: current._id }, { $set: changes });
        Object.assign(current, changes);
        summary.updated += 1;
      }
      continue;
    }

    const created = await SellerProduct.create({
      sellerId: seller._id,
      name: row.productName,
      url: row.productUrl,
      packQty: row.packQty,
      packPrice: row.packPrice,
      // "Доставка" belongs to the offer, not to the shop.
      shippingCost: row.shippingCost,
      category: row.category,
      description: row.description,
      footprint: '',
    });
    products.push(created);
    summary.added += 1;
  }

  return { summary, warnings, sheets: parsed.sheetNames };
}
