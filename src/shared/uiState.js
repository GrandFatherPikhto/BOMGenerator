// Pure helpers for the persisted UI state ("what the user was working with").
// Imported by the server (validation and merge before writing) and by the client
// (reading a section and merging optimistic patches), so both sides agree on the
// stored shape, the versioning and the "drop the junk" rules.
import { COMMON_MODES, PRODUCT_PICKER_COLUMNS } from './constants.js';
import { QTY_OPERATORS } from './lineFilter.js';

/** Bump when the stored shape changes, so older documents can be migrated. */
export const UI_STATE_VERSION = 1;

/** Sections that may be persisted. Anything else is dropped. */
export const UI_STATE_SECTIONS = [
  'boards',
  'purchases',
  'common',
  'manual',
  'sellers',
  'categories',
  'productPicker',
];

const TABS = ['boards', 'all'];
const SELLER_MODES = ['shop', 'all'];
const QTY_OPS = ['', ...QTY_OPERATORS];
const LINE_FILTER_TEXT_KEYS = ['value', 'footprint', 'qty'];
const LINE_FILTER_BOOL_KEYS = [
  'valueRegex',
  'valueCaseSensitive',
  'footprintRegex',
  'footprintCaseSensitive',
];

/** A plain `{}` (not an array, not null, not a class instance). */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keep the value only if it is a string. */
function asString(value) {
  return typeof value === 'string' ? value : undefined;
}

/** Keep the value only if it is a boolean. */
function asBool(value) {
  return typeof value === 'boolean' ? value : undefined;
}

/** Keep the value only if it is an integer >= min. */
function asInt(value, min = 0) {
  return Number.isInteger(value) && value >= min ? value : undefined;
}

/** `null` (meaning "use the default size") or a positive integer. */
function asSizeOrNull(value) {
  if (value === null) {
    return null;
  }
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/** Keep the value only if it is one of the allowed strings. */
function asEnum(value, allowed) {
  return typeof value === 'string' && allowed.includes(value) ? value : undefined;
}

/** Copy the known string/boolean keys of a line-filter object. */
function normalizeLineFilters(raw, { withSeller = false } = {}) {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const out = {};
  for (const key of LINE_FILTER_TEXT_KEYS) {
    const value = asString(raw[key]);
    if (value !== undefined) {
      out[key] = value;
    }
  }
  if (withSeller) {
    const seller = asString(raw.seller);
    if (seller !== undefined) {
      out.seller = seller;
    }
  }
  for (const key of LINE_FILTER_BOOL_KEYS) {
    const value = asBool(raw[key]);
    if (value !== undefined) {
      out[key] = value;
    }
  }
  const qtyOp = asEnum(raw.qtyOp, QTY_OPS);
  if (qtyOp !== undefined) {
    out.qtyOp = qtyOp;
  }
  return out;
}

/**
 * The seller chosen per board. Empty strings are kept on purpose: they mean
 * "cleared" and must be able to overwrite a previously remembered seller.
 */
function normalizeSellerByBoard(raw) {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const out = {};
  for (const [boardId, sellerId] of Object.entries(raw)) {
    if (boardId && typeof sellerId === 'string') {
      out[boardId] = sellerId;
    }
  }
  return out;
}

function normalizeBoards(raw) {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const lastOpenBoardId = asString(raw.lastOpenBoardId);
  return lastOpenBoardId === undefined ? {} : { lastOpenBoardId };
}

function normalizePurchases(raw) {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const out = {};
  const tab = asEnum(raw.tab, TABS);
  if (tab !== undefined) {
    out.tab = tab;
  }
  const boardId = asString(raw.boardId);
  if (boardId !== undefined) {
    out.boardId = boardId;
  }
  const page = asInt(raw.page);
  if (page !== undefined) {
    out.page = page;
  }
  const size = asSizeOrNull(raw.size);
  if (size !== undefined) {
    out.size = size;
  }
  if ('filters' in raw) {
    const filters = normalizeLineFilters(raw.filters);
    if (filters !== undefined) {
      out.filters = filters;
    }
  }
  if ('sellerByBoard' in raw) {
    const sellerByBoard = normalizeSellerByBoard(raw.sellerByBoard);
    if (sellerByBoard !== undefined) {
      out.sellerByBoard = sellerByBoard;
    }
  }
  return out;
}

function normalizeCommon(raw) {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const out = {};
  const mode = asEnum(raw.mode, COMMON_MODES);
  if (mode !== undefined) {
    out.mode = mode;
  }
  const page = asInt(raw.page);
  if (page !== undefined) {
    out.page = page;
  }
  const size = asSizeOrNull(raw.size);
  if (size !== undefined) {
    out.size = size;
  }
  if ('filters' in raw) {
    const filters = normalizeLineFilters(raw.filters, { withSeller: true });
    if (filters !== undefined) {
      out.filters = filters;
    }
  }
  return out;
}

function normalizeSellers(raw) {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const out = {};
  if (raw.selectedSellerId === null) {
    out.selectedSellerId = null;
  } else {
    const selectedSellerId = asString(raw.selectedSellerId);
    if (selectedSellerId !== undefined) {
      out.selectedSellerId = selectedSellerId;
    }
  }
  const mode = asEnum(raw.mode, SELLER_MODES);
  if (mode !== undefined) {
    out.mode = mode;
  }
  const page = asInt(raw.page);
  if (page !== undefined) {
    out.page = page;
  }
  const pageSize = asSizeOrNull(raw.pageSize);
  if (pageSize !== undefined) {
    out.pageSize = pageSize;
  }
  if ('filters' in raw) {
    if (!isPlainObject(raw.filters)) {
      return out;
    }
    const filters = {};
    for (const key of ['name', 'category']) {
      const value = asString(raw.filters[key]);
      if (value !== undefined) {
        filters[key] = value;
      }
    }
    for (const key of ['nameRegex', 'categoryRegex']) {
      const value = asBool(raw.filters[key]);
      if (value !== undefined) {
        filters[key] = value;
      }
    }
    out.filters = filters;
  }
  return out;
}

/**
 * Visible columns of the product picker dialog. Unknown and duplicated names are
 * dropped; `name` is always kept so the table never loses its anchor column.
 */
function normalizeProductPicker(raw) {
  if (!isPlainObject(raw)) {
    return undefined;
  }
  const out = {};
  if ('columns' in raw) {
    if (!Array.isArray(raw.columns)) {
      return out;
    }
    const columns = [];
    for (const value of raw.columns) {
      if (
        typeof value === 'string' &&
        PRODUCT_PICKER_COLUMNS.includes(value) &&
        !columns.includes(value)
      ) {
        columns.push(value);
      }
    }
    if (!columns.includes('name')) {
      columns.unshift('name');
    }
    out.columns = columns;
  }
  return out;
}

/** Sections with a schema. Placeholders keep unknown-but-known sections empty. */
const SECTION_NORMALIZERS = {
  boards: normalizeBoards,
  purchases: normalizePurchases,
  common: normalizeCommon,
  sellers: normalizeSellers,
  manual: (raw) => (isPlainObject(raw) ? {} : undefined),
  categories: (raw) => (isPlainObject(raw) ? {} : undefined),
  productPicker: normalizeProductPicker,
};

/** Keep only the known sections, with only their known, type-checked keys. */
export function normalizeSections(raw) {
  if (!isPlainObject(raw)) {
    return {};
  }
  const out = {};
  for (const name of UI_STATE_SECTIONS) {
    if (!(name in raw)) {
      continue;
    }
    const normalize = SECTION_NORMALIZERS[name];
    const section = normalize(raw[name]);
    if (section !== undefined) {
      out[name] = section;
    }
  }
  return out;
}

/** Normalise a whole stored document (or a bare sections object). */
export function normalizeUiState(raw = {}) {
  const source = isPlainObject(raw) ? raw : {};
  const sections = normalizeSections(
    isPlainObject(source.sections) ? source.sections : source,
  );
  return { version: UI_STATE_VERSION, sections };
}

/** Recursive merge of plain objects; anything else (arrays, scalars) replaces. */
export function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch;
  }
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    result[key] =
      isPlainObject(value) && isPlainObject(base[key])
        ? deepMerge(base[key], value)
        : value;
  }
  return result;
}

/** Merge a (normalised) patch into the current sections; never keeps junk. */
export function mergeSections(current = {}, patch = {}) {
  return deepMerge(normalizeSections(current), normalizeSections(patch));
}

/** The stored section merged over the caller's defaults. */
export function readSection(sections, name, defaults = {}) {
  const stored = normalizeSections(sections)[name];
  return stored ? deepMerge(defaults, stored) : { ...defaults };
}
