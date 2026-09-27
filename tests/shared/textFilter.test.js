// Filters of the "Продавцы/Товары" screen: substring and regex matching of the
// product name and category.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  compileProductFilter,
  compileTextFilter,
  escapeRegExp,
  scopeProducts,
} from '../../src/shared/index.js';

test('an empty pattern means "no condition"', () => {
  for (const value of ['', '   ', null, undefined]) {
    const filter = compileTextFilter(value);
    assert.equal(filter.active, false);
    assert.equal(filter.match, null);
    assert.equal(filter.error, null);
  }
});

test('a plain pattern matches a substring, ignoring case', () => {
  const filter = compileTextFilter('lcd');
  assert.equal(filter.active, true);
  assert.equal(filter.error, null);
  assert.equal(filter.match('LCD1602 c I2C'), true);
  assert.equal(filter.match('LCD1602'), true);
  assert.equal(filter.match('AD9707BCPZ'), false);
  assert.equal(filter.match(undefined), false);
});

test('a plain pattern is treated literally, not as a regex', () => {
  const filter = compileTextFilter('a.b');
  assert.equal(filter.match('a.b'), true);
  assert.equal(filter.match('aXb'), false);
});

test('a regex pattern matches partially and ignoring case', () => {
  const digits = compileTextFilter('\\d+', { regex: true });
  assert.equal(digits.error, null);
  assert.equal(digits.match('LCD1602'), true);
  assert.equal(digits.match('Capacitor'), false);

  const anchored = compileTextFilter('^LCD', { regex: true });
  assert.equal(anchored.match('LCD1602 c I2C'), true);
  assert.equal(anchored.match('USB-LCD'), false);
});

test('an invalid regex is reported instead of thrown', () => {
  const filter = compileTextFilter('(unclosed', { regex: true });
  assert.equal(filter.active, true);
  assert.equal(filter.match, null);
  assert.match(filter.error, /Invalid regular expression/i);
});

test('the pattern is trimmed before compiling', () => {
  const filter = compileTextFilter('  C_0402  ');
  assert.equal(filter.match('Capacitor_SMD:C_0402_HandSolder'), true);
});

test('the product filter combines the name and the category with AND', () => {
  const product = { name: 'AD9707BCPZ', category: 'ЦАП' };

  // Only the name, only the category, both — and a mismatch in either field.
  assert.equal(compileProductFilter({ name: '9707' }).match(product), true);
  assert.equal(compileProductFilter({ category: 'цап' }).match(product), true);
  assert.equal(
    compileProductFilter({ name: '9707', category: 'ЦАП' }).match(product),
    true,
  );
  assert.equal(
    compileProductFilter({ name: '9707', category: 'резистор' }).match(product),
    false,
  );

  // No condition matches everything.
  const empty = compileProductFilter({});
  assert.equal(empty.active, false);
  assert.equal(empty.match(product), true);
  assert.equal(empty.match({}), true);
});

test('the product filter reports the field that holds a broken regex', () => {
  const filter = compileProductFilter({ name: 'ok', category: '(bad' , categoryRegex: true });
  assert.equal(filter.errors.name, null);
  assert.match(filter.errors.category, /Invalid regular expression/i);
  assert.equal(filter.active, true);

  // The broken field is ignored, the valid one still applies.
  assert.equal(filter.match({ name: 'OK value', category: 'any' }), true);
  assert.equal(filter.match({ name: 'other', category: 'any' }), false);
});

test('the product filter understands regexes in both fields', () => {
  const filter = compileProductFilter({
    name: '^AD',
    nameRegex: true,
    category: 'цап',
    categoryRegex: true,
  });
  assert.equal(filter.match({ name: 'AD9707BCPZ', category: 'ЦАП' }), true);
  assert.equal(filter.match({ name: 'ADA4807-2ARM', category: 'ЦАП' }), true);
  assert.equal(filter.match({ name: 'LCD1602', category: 'Дисплеи' }), false);
});

test('scopeProducts narrows the list to one seller', () => {
  const products = [
    { name: 'A', sellerId: 's1' },
    { name: 'B', sellerId: 's2' },
    { name: 'C', sellerId: 's1' },
  ];

  const scoped = scopeProducts(products, { sellerId: 's1' });
  assert.deepEqual(
    scoped.map((product) => product.name),
    ['A', 'C'],
  );

  // Scope off, or no seller picked: the whole list, so the search covers
  // every shop.
  assert.equal(
    scopeProducts(products, { sellerId: 's1', onlySelectedSeller: false }).length,
    3,
  );
  assert.equal(scopeProducts(products, { sellerId: null }).length, 3);
  assert.equal(scopeProducts(products).length, 3);
});

test('escapeRegExp neutralises regex characters', () => {
  const escaped = escapeRegExp('C_0402 (100 nF)');
  assert.equal(new RegExp(escaped).test('Capacitor_SMD:C_0402 (100 nF)'), true);
  assert.equal(new RegExp(escaped).test('Capacitor_SMD:C_0402 HandSolder'), false);
});
