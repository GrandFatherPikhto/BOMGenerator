// Reusable grouping of BOM rows into category/subcategory blocks.
//
// Used both by the board screen and by the "Common purchases" screen, so the
// two always present the same block order and sorting.
import {
  extractRefPrefix,
  parseValue,
  resolveCategory,
  sortGroups,
} from '../../shared/index.js';

/**
 * Resolve the category/subcategory/sort of one stored BOM line.
 * The displayed name is the collapsed `value` (or the reference when empty).
 */
export function classifyLine(line, categories, settings) {
  const rawValue = String(line.value ?? '').trim();
  const parsed = parseValue(rawValue || line.reference || '');
  const refPrefix = extractRefPrefix(line.reference ?? '');
  const { category, subcategory, sort } = resolveCategory({
    reference: line.reference ?? '',
    refPrefix,
    value: parsed.raw,
    footprint: line.footprint ?? '',
    categories,
    defaultCategory: settings.defaultCategoryName,
    defaultSort: settings.defaultSort,
  });
  return { parsed, display: parsed.raw, category, subcategory, sort };
}

function pushLines(blocks, rows, sortSpec) {
  for (const row of sortGroups(rows, sortSpec)) {
    blocks.push({ kind: 'line', row });
  }
}

function pushCategory(blocks, name, categoryDef, rows, settings, fallbackSort) {
  blocks.push({ kind: 'category', name });
  const subcategories = categoryDef?.subcategories ?? [];

  if (subcategories.length === 0) {
    pushLines(blocks, rows, fallbackSort);
    return;
  }

  for (const sub of subcategories) {
    const subRows = rows.filter((row) => row.subcategory === sub.name);
    if (subRows.length === 0) {
      continue;
    }
    blocks.push({ kind: 'subcategory', name: sub.name });
    pushLines(blocks, subRows, fallbackSort);
  }

  const otherRows = rows.filter((row) => !row.subcategory);
  if (otherRows.length > 0) {
    blocks.push({ kind: 'subcategory', name: settings.subcategoryOtherLabel });
    pushLines(blocks, otherRows, fallbackSort);
  }
}

/**
 * Turn classified rows into an ordered list of blocks:
 * `{ kind: 'category' | 'subcategory' | 'line', ... }`.
 *
 * Categories follow their configured order; the default category (and any
 * unknown name) goes last.
 */
export function groupIntoBlocks(rows, categories, settings) {
  const blocks = [];
  const byCategory = new Map();
  for (const row of rows) {
    if (!byCategory.has(row.category)) {
      byCategory.set(row.category, []);
    }
    byCategory.get(row.category).push(row);
  }

  const seen = new Set();
  for (const category of categories) {
    const categoryRows = byCategory.get(category.name);
    if (!categoryRows || categoryRows.length === 0) {
      continue;
    }
    seen.add(category.name);
    const fallbackSort = categoryRows[0].sort || settings.defaultSort;
    pushCategory(blocks, category.name, category, categoryRows, settings, fallbackSort);
  }

  const leftovers = [...byCategory.keys()]
    .filter((name) => !seen.has(name))
    .sort((left, right) => {
      const leftDefault = left === settings.defaultCategoryName ? 1 : 0;
      const rightDefault = right === settings.defaultCategoryName ? 1 : 0;
      return leftDefault - rightDefault || left.localeCompare(right);
    });

  for (const name of leftovers) {
    const categoryRows = byCategory.get(name);
    const fallbackSort = categoryRows[0].sort || settings.defaultSort;
    pushCategory(blocks, name, null, categoryRows, settings, fallbackSort);
  }

  return blocks;
}

/** Strip internal grouping helpers before sending blocks over the API. */
export function serializeBlocks(blocks) {
  return blocks.map((block) => {
    if (block.kind !== 'line') {
      return block;
    }
    const { parsed: _parsed, display: _display, sort: _sort, ...line } = block.row;
    return { kind: 'line', line };
  });
}
