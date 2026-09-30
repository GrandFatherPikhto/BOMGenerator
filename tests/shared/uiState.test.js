// Persisted UI state: normalisation (drop the junk, coerce the types),
// section-aware merge and reading a section over the caller's defaults.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  UI_STATE_VERSION,
  deepMerge,
  mergeSections,
  normalizeSections,
  normalizeUiState,
  readSection,
} from '../../src/shared/index.js';

test('normalizeSections keeps only the known sections and their known keys', () => {
  const sections = normalizeSections({
    purchases: { tab: 'all', nope: 1, page: 2 },
    unknown: { anything: true },
  });
  assert.deepEqual(sections, { purchases: { tab: 'all', page: 2 } });
});

test('normalizeSections coerces types and drops invalid values', () => {
  const sections = normalizeSections({
    purchases: {
      tab: 'sideways',
      boardId: 42,
      page: -1,
      size: 0,
      filters: { value: 'LCD', valueRegex: 'yes', qtyOp: 'gt', qty: 5 },
      sellerByBoard: { b1: 's1', b2: 7, b3: '' },
    },
  });
  assert.deepEqual(sections, {
    purchases: {
      filters: { value: 'LCD', qtyOp: 'gt' },
      sellerByBoard: { b1: 's1', b3: '' },
    },
  });
});

test('normalizeSections keeps only known product-picker columns and drops duplicates', () => {
  const sections = normalizeSections({
    productPicker: { columns: ['total', 'nope', 'name', 'total'], extra: 1 },
  });
  assert.deepEqual(sections, { productPicker: { columns: ['total', 'name'] } });
});

test('normalizeSections always keeps the name column in the product picker', () => {
  const sections = normalizeSections({ productPicker: { columns: ['total'] } });
  assert.deepEqual(sections, { productPicker: { columns: ['name', 'total'] } });
});

test('normalizeSections drops a non-array product-picker columns list', () => {
  const sections = normalizeSections({ productPicker: { columns: 'name' } });
  assert.deepEqual(sections, { productPicker: {} });
});

test('normalizeSections keeps a null size and a cleared seller', () => {
  const sections = normalizeSections({
    purchases: { size: null, sellerByBoard: { b1: '' } },
    sellers: { selectedSellerId: null, pageSize: null },
  });
  assert.deepEqual(sections, {
    purchases: { size: null, sellerByBoard: { b1: '' } },
    sellers: { selectedSellerId: null, pageSize: null },
  });
});

test('normalizeSections rejects non-object input', () => {
  for (const value of [null, undefined, 'x', 7, []]) {
    assert.deepEqual(normalizeSections(value), {});
  }
});

test('normalizeUiState wraps sections and stamps the current version', () => {
  const state = normalizeUiState({ sections: { boards: { lastOpenBoardId: 'b1' } } });
  assert.equal(state.version, UI_STATE_VERSION);
  assert.deepEqual(state.sections, { boards: { lastOpenBoardId: 'b1' } });

  const bare = normalizeUiState({ boards: { lastOpenBoardId: 'b2' } });
  assert.deepEqual(bare.sections, { boards: { lastOpenBoardId: 'b2' } });
});

test('deepMerge merges nested plain objects and replaces everything else', () => {
  const merged = deepMerge(
    { a: { x: 1, y: 2 }, list: [1, 2] },
    { a: { y: 3, z: 4 }, list: [3] },
  );
  assert.deepEqual(merged, { a: { x: 1, y: 3, z: 4 }, list: [3] });
});

test('mergeSections keeps other sections and clears a seller with an empty string', () => {
  const current = {
    purchases: { boardId: 'b1', sellerByBoard: { b1: 's1' } },
    sellers: { mode: 'shop' },
  };
  const merged = mergeSections(current, {
    purchases: { sellerByBoard: { b1: '' } },
  });
  assert.deepEqual(merged, {
    purchases: { boardId: 'b1', sellerByBoard: { b1: '' } },
    sellers: { mode: 'shop' },
  });
});

test('mergeSections never keeps junk from the current document', () => {
  const merged = mergeSections({ purchases: { nope: 1, page: 3 } }, {});
  assert.deepEqual(merged, { purchases: { page: 3 } });
});

test('readSection merges the stored slice over the defaults', () => {
  const sections = { sellers: { mode: 'all', page: 2 } };
  const state = readSection(sections, 'sellers', {
    mode: 'shop',
    page: 0,
    filters: { name: '' },
  });
  assert.deepEqual(state, { mode: 'all', page: 2, filters: { name: '' } });
});

test('readSection returns a copy of the defaults when nothing is stored', () => {
  const defaults = { mode: 'shop', filters: { name: '' } };
  const state = readSection({}, 'sellers', defaults);
  assert.deepEqual(state, defaults);
  assert.notEqual(state, defaults);
});

test('normalizeSections keeps a valid row mode and drops an unknown one', () => {
  assert.deepEqual(
    normalizeSections({ purchases: { filters: { rowMode: 'unfilled' } } }),
    { purchases: { filters: { rowMode: 'unfilled' } } },
  );
  // An unknown mode (and the old boolean flag) is not part of the shape.
  assert.deepEqual(
    normalizeSections({ purchases: { filters: { rowMode: 'sideways' } } }),
    { purchases: { filters: {} } },
  );
  assert.deepEqual(
    normalizeSections({ common: { filters: { showNotPurchased: true } } }),
    { common: { filters: {} } },
  );
});

test('normalizeSections keeps the footprints filter, page and size', () => {
  assert.deepEqual(
    normalizeSections({
      footprints: { filter: 'R_06', page: 2, size: 50, nope: 1 },
    }),
    { footprints: { filter: 'R_06', page: 2, size: 50 } },
  );
  assert.deepEqual(normalizeSections({ footprints: { page: -1, size: 0 } }), {
    footprints: {},
  });
});
