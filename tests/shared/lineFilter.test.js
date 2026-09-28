// Row filters of the purchase tables (a single board and common purchases):
// substring/regex text matching of `value`/`footprint`, numeric operators on
// `totalQty`, and dropping the headers left without matching lines.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  compileLineFilter,
  compileTextMatch,
  filterBlocks,
} from '../../src/shared/index.js';

test('an empty text pattern means "no condition"', () => {
  for (const value of ['', '   ', null, undefined]) {
    const filter = compileTextMatch(value);
    assert.equal(filter.active, false);
    assert.equal(filter.match, null);
    assert.equal(filter.error, null);
  }
});

test('a plain text pattern matches a substring, ignoring case by default', () => {
  const filter = compileTextMatch('lcd');
  assert.equal(filter.active, true);
  assert.equal(filter.match('LCD1602 c I2C'), true);
  assert.equal(filter.match('AD9707BCPZ'), false);
});

test('case sensitivity can be requested', () => {
  const filter = compileTextMatch('lcd', { caseSensitive: true });
  assert.equal(filter.match('lcd1602'), true);
  assert.equal(filter.match('LCD1602'), false);
});

test('a regex pattern matches partially and is case-insensitive unless asked', () => {
  const digits = compileTextMatch('\\d+', { regex: true });
  assert.equal(digits.error, null);
  assert.equal(digits.match('LCD1602'), true);
  assert.equal(digits.match('Capacitor'), false);

  const upper = compileTextMatch('^LCD', { regex: true, caseSensitive: true });
  assert.equal(upper.match('LCD1602'), true);
  assert.equal(upper.match('lcd1602'), false);
});

test('an invalid regex is reported instead of thrown', () => {
  const filter = compileTextMatch('(unclosed', { regex: true });
  assert.equal(filter.active, true);
  assert.equal(filter.match, null);
  assert.match(filter.error, /Invalid regular expression/i);
});

test('the line filter combines value, footprint and quantity with AND', () => {
  const rows = [
    { value: '100 nF', footprint: 'C_0402', totalQty: 10 },
    { value: '10 kOhm', footprint: 'R_0603', totalQty: 3 },
    { value: '100 nF', footprint: 'C_0603', totalQty: 2 },
  ];

  const byValue = compileLineFilter({ value: 'nf' });
  assert.deepEqual(rows.filter(byValue.match).map((row) => row.totalQty), [10, 2]);

  const byValueAndFootprint = compileLineFilter({ value: '100 nF', footprint: '0402' });
  assert.deepEqual(byValueAndFootprint.match(rows[0]), true);
  assert.deepEqual(byValueAndFootprint.match(rows[2]), false);

  // No condition matches everything.
  const empty = compileLineFilter({});
  assert.equal(empty.active, false);
  assert.equal(rows.every(empty.match), true);
});

test('the quantity filter supports greater, less and equal', () => {
  const rows = [{ totalQty: 10 }, { totalQty: 3 }, { totalQty: 2 }];

  assert.deepEqual(
    rows.filter(compileLineFilter({ qtyOp: 'gt', qty: '3' }).match).map((r) => r.totalQty),
    [10],
  );
  assert.deepEqual(
    rows.filter(compileLineFilter({ qtyOp: 'lt', qty: '3' }).match).map((r) => r.totalQty),
    [2],
  );
  assert.deepEqual(
    rows.filter(compileLineFilter({ qtyOp: 'eq', qty: '3' }).match).map((r) => r.totalQty),
    [3],
  );

  // An operator without a number (or vice versa) is ignored.
  assert.equal(compileLineFilter({ qtyOp: 'gt' }).active, false);
  assert.equal(compileLineFilter({ qty: '5' }).active, false);
});

test('the line filter reports a broken regex without breaking the others', () => {
  const filter = compileLineFilter({
    value: 'ok',
    footprint: '(bad',
    footprintRegex: true,
  });
  assert.equal(filter.errors.value, null);
  assert.match(filter.errors.footprint, /Invalid regular expression/i);

  // The broken field is ignored, the valid one still applies.
  assert.equal(filter.match({ value: 'OK value', footprint: 'any', totalQty: 1 }), true);
  assert.equal(filter.match({ value: 'other', footprint: 'any', totalQty: 1 }), false);
});

test('filterBlocks drops headers left without matching lines', () => {
  const blocks = [
    { kind: 'category', name: 'Резисторы' },
    { kind: 'subcategory', name: 'SMD' },
    { kind: 'line', line: { value: '10 kOhm', totalQty: 3 } },
    { kind: 'category', name: 'Конденсаторы' },
    { kind: 'subcategory', name: 'Керамика' },
    { kind: 'line', line: { value: '100 nF', totalQty: 10 } },
    { kind: 'line', line: { value: '1 uF', totalQty: 1 } },
  ];

  const filter = compileLineFilter({ qtyOp: 'gt', qty: '5' });
  const visible = filterBlocks(blocks, filter.match);

  assert.deepEqual(
    visible.map((block) =>
      block.kind === 'line' ? `line:${block.line.value}` : `${block.kind}:${block.name}`,
    ),
    ['category:Конденсаторы', 'subcategory:Керамика', 'line:100 nF'],
  );

  // Without a match nothing is left; the input is not mutated.
  assert.deepEqual(filterBlocks(blocks, () => false), []);
  assert.equal(blocks.length, 7);
});

test('filterBlocks keeps a category that has no subcategories', () => {
  const blocks = [
    { kind: 'category', name: 'Прочее' },
    { kind: 'line', line: { value: 'X', totalQty: 1 } },
    { kind: 'line', line: { value: 'Y', totalQty: 1 } },
  ];
  const visible = filterBlocks(blocks, compileLineFilter({ value: 'x' }).match);
  assert.deepEqual(
    visible.map((block) => (block.kind === 'line' ? block.line.value : block.name)),
    ['Прочее', 'X'],
  );
});

test('the seller condition keeps only the rows of that seller', () => {
  const rows = [
    { sellerId: 's1', totalQty: 1 },
    { sellerId: 's2', totalQty: 1 },
    { sellerId: null, totalQty: 1 },
  ];

  const filter = compileLineFilter({ seller: 's1' });
  assert.equal(filter.active, true);
  assert.deepEqual(rows.filter(filter.match), [rows[0]]);

  // No seller picked -> no condition.
  assert.equal(compileLineFilter({ seller: '' }).active, false);
  assert.equal(rows.every(compileLineFilter({}).match), true);
});

test('filterBlocks without a matcher returns the input unchanged', () => {
  const blocks = [{ kind: 'line', line: { value: 'X' } }];
  assert.equal(filterBlocks(blocks, null), blocks);
});
