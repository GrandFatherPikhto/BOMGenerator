// Tests for categorisation: prefix and regex modes (acceptance criterion 4a)
// and category validation.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractRefPrefix,
  resolveCategory,
  validateCategory,
} from '../../src/shared/index.js';

function resolve(reference, value, categories, options = {}) {
  return resolveCategory({
    reference,
    refPrefix: extractRefPrefix(reference),
    value,
    footprint: options.footprint ?? '',
    categories,
    defaultCategory: options.defaultCategory ?? 'Прочее',
    defaultSort: options.defaultSort ?? 'name',
  });
}

test('prefix mode: FB never matches the fuse category F', () => {
  const categories = [
    { name: 'Ферритовые бусины', refMode: 'prefix', refPatterns: ['FB'] },
    { name: 'Предохранители', refMode: 'prefix', refPatterns: ['F'] },
  ];
  assert.equal(resolve('FB3', 'BLM21', categories).category, 'Ферритовые бусины');
  assert.equal(resolve('F1', 'MF-MSMF', categories).category, 'Предохранители');
});

test('prefix mode: name prefix matches the beginning of the value', () => {
  const categories = [
    { name: 'ЦАП', nameMode: 'prefix', namePatterns: ['AD970'] },
  ];
  assert.equal(resolve('U1', 'AD9705', categories).category, 'ЦАП');
  assert.equal(resolve('U2', 'AD9704', categories).category, 'ЦАП');
  assert.equal(resolve('U3', 'XAD9705', categories).category, 'Прочее');
});

test('prefix mode: both ref and name must match when both are set', () => {
  const categories = [
    { name: 'ЦАП U', refPatterns: ['U'], namePatterns: ['AD970'] },
  ];
  assert.equal(resolve('U1', 'AD9705', categories).category, 'ЦАП U');
  assert.equal(resolve('IC1', 'AD9705', categories).category, 'Прочее');
  assert.equal(resolve('U2', 'LM317', categories).category, 'Прочее');
});

test('regex ref mode matches a single token, not a substring', () => {
  const categories = [
    { name: 'Special U3', refMode: 'regex', refPatterns: ['^U3$'] },
  ];
  assert.equal(resolve('U3', 'anything', categories).category, 'Special U3');
  assert.notEqual(resolve('U30', 'anything', categories).category, 'Special U3');
  assert.notEqual(resolve('U4', 'anything', categories).category, 'Special U3');
});

test('regex ref mode splits "U3,U4" into tokens and matches any of them', () => {
  const categories = [
    { name: 'Special U3', refMode: 'regex', refPatterns: ['^U3$'] },
  ];
  const result = resolve('U3,U4', 'anything', categories);
  assert.equal(result.category, 'Special U3');
  // "U30,U4" must not match: "U30" fails ^U3$ and "U4" too.
  assert.notEqual(resolve('U30,U4', 'anything', categories).category, 'Special U3');
});

test('regex ref mode supports ranges', () => {
  const categories = [
    { name: 'R10-R29', refMode: 'regex', refPatterns: ['^R(1[0-9]|2[0-9])$'] },
  ];
  assert.equal(resolve('R15', 'x', categories).category, 'R10-R29');
  assert.notEqual(resolve('R9', 'x', categories).category, 'R10-R29');
  assert.notEqual(resolve('R30', 'x', categories).category, 'R10-R29');
});

test('regex name mode is anchored and case-insensitive', () => {
  const categories = [
    { name: 'AD97xx', nameMode: 'regex', namePatterns: ['^AD97\\d\\d'] },
  ];
  assert.equal(resolve('U1', 'AD9705', categories).category, 'AD97xx');
  assert.equal(resolve('U2', 'ad9705', categories).category, 'AD97xx');
  assert.equal(resolve('U3', 'XAD9705', categories).category, 'Прочее');
});

test('subcategory: first matching footprintContains wins', () => {
  const categories = [
    {
      name: 'Конденсаторы',
      refPatterns: ['C'],
      subcategories: [
        { name: 'Танталовые', footprintContains: 'Tantalum' },
        { name: 'Электролитические', footprintContains: 'Radial' },
      ],
    },
  ];
  const tantalum = resolve('C1', 'TAJD107', categories, {
    footprint: 'Capacitor_Tantalum_SMD:CP_EIA-7343-20',
  });
  assert.equal(tantalum.subcategory, 'Танталовые');

  const radial = resolve('C2', '470uF', categories, {
    footprint: 'Capacitor_THT:C_Radial_D10.0mm',
  });
  assert.equal(radial.subcategory, 'Электролитические');

  const plain = resolve('C3', '100 nF', categories, {
    footprint: 'Capacitor_SMD:C_0603',
  });
  assert.equal(plain.subcategory, null);
});

test('first matching category wins by order', () => {
  const categories = [
    { name: 'Narrow', refPatterns: ['U'], namePatterns: ['AD970'] },
    { name: 'General', refPatterns: ['U'] },
  ];
  assert.equal(resolve('U1', 'AD9705', categories).category, 'Narrow');
  assert.equal(resolve('U2', 'LM317', categories).category, 'General');
});

test('unknown rows fall into the default category', () => {
  const categories = [{ name: 'Конденсаторы', refPatterns: ['C'] }];
  const result = resolve('SW1', 'SW_Push', categories);
  assert.equal(result.category, 'Прочее');
  assert.equal(result.sort, 'name');
});

// ---------------------------------------------------------------------------
// validateCategory
// ---------------------------------------------------------------------------

test('validateCategory requires at least one pattern list', () => {
  const errors = validateCategory({ name: 'x' });
  assert.ok(errors.some((message) => message.includes('at least one')));
});

test('validateCategory rejects an invalid regex only in regex mode', () => {
  const regexErrors = validateCategory({
    name: 'x',
    refMode: 'regex',
    refPatterns: ['(unclosed'],
  });
  assert.equal(regexErrors.length, 1);
  assert.ok(regexErrors[0].includes('refPatterns[0]'));
  assert.ok(regexErrors[0].includes('(unclosed'));

  const prefixErrors = validateCategory({
    name: 'x',
    refMode: 'prefix',
    refPatterns: ['(unclosed'],
  });
  assert.deepEqual(prefixErrors, []);
});

test('validateCategory accepts a valid regex category', () => {
  const errors = validateCategory({
    name: 'U3',
    refMode: 'regex',
    refPatterns: ['^U3$'],
  });
  assert.deepEqual(errors, []);
});

test('validateCategory checks subcategories', () => {
  const errors = validateCategory({
    name: 'x',
    refPatterns: ['C'],
    subcategories: [{ name: 'ok', footprintContains: 'Radial' }, {}],
  });
  assert.ok(errors.some((message) => message.includes('subcategories[1].name')));
  assert.ok(
    errors.some((message) => message.includes('subcategories[1].footprintContains')),
  );
});

// ---------------------------------------------------------------------------
// Footprint condition, AND combination and case sensitivity
// ---------------------------------------------------------------------------

test('footprint condition: contains matches a substring', () => {
  const categories = [
    { name: 'Танталовые', footprintMode: 'contains', footprintPatterns: ['Tantalum'] },
  ];
  assert.equal(
    resolve('C1', 'TAJ', categories, { footprint: 'Capacitor_Tantalum_SMD:CP' }).category,
    'Танталовые',
  );
  assert.notEqual(
    resolve('C2', '100 nF', categories, { footprint: 'Capacitor_SMD:C_0603' }).category,
    'Танталовые',
  );
});

test('footprint condition: prefix matches the start of the footprint', () => {
  const categories = [
    { name: 'THT', footprintMode: 'prefix', footprintPatterns: ['Capacitor_THT'] },
  ];
  assert.equal(
    resolve('C1', '470uF', categories, { footprint: 'Capacitor_THT:C_Radial' }).category,
    'THT',
  );
  assert.notEqual(
    resolve('C2', '470uF', categories, { footprint: 'Capacitor_SMD:C_1206' }).category,
    'THT',
  );
});

test('footprint condition: regex', () => {
  const categories = [
    { name: '0402', footprintMode: 'regex', footprintPatterns: ['C_0402'] },
  ];
  assert.equal(
    resolve('C1', '100 nF', categories, {
      footprint: 'Capacitor_SMD:C_0402_1005Metric',
    }).category,
    '0402',
  );
});

test('several conditions are combined with AND', () => {
  const categories = [
    {
      name: 'Tantalum C',
      refPatterns: ['C'],
      footprintMode: 'contains',
      footprintPatterns: ['Tantalum'],
    },
  ];
  assert.equal(
    resolve('C1', 'TAJ', categories, { footprint: 'Capacitor_Tantalum_SMD:x' }).category,
    'Tantalum C',
  );
  // ref matches, footprint does not
  assert.notEqual(
    resolve('C2', '100 nF', categories, { footprint: 'Capacitor_SMD:C_0603' }).category,
    'Tantalum C',
  );
  // footprint matches, ref does not
  assert.notEqual(
    resolve('R1', 'x', categories, { footprint: 'Capacitor_Tantalum_SMD:x' }).category,
    'Tantalum C',
  );
});

test('a single condition is enough (empty groups are not ANDed)', () => {
  const categories = [
    { name: 'OnlyFp', footprintMode: 'contains', footprintPatterns: ['Radial'] },
  ];
  assert.equal(
    resolve('X1', 'y', categories, { footprint: 'Capacitor_THT:Radial_10mm' }).category,
    'OnlyFp',
  );
});

test('case is ignored by default and can be required', () => {
  const insensitive = [{ name: 'TAJ', nameMode: 'prefix', namePatterns: ['taj'] }];
  assert.equal(resolve('C1', 'TAJD107', insensitive).category, 'TAJ');

  const sensitive = [
    { name: 'TAJ', nameMode: 'prefix', namePatterns: ['taj'], caseSensitive: true },
  ];
  assert.notEqual(resolve('C1', 'TAJD107', sensitive).category, 'TAJ');

  const sensitiveMatch = [
    { name: 'TAJ', nameMode: 'prefix', namePatterns: ['TAJ'], caseSensitive: true },
  ];
  assert.equal(resolve('C1', 'TAJD107', sensitiveMatch).category, 'TAJ');
});

test('footprint regex mode is validated, prefix/contains are not', () => {
  const bad = validateCategory({
    name: 'x',
    footprintMode: 'regex',
    footprintPatterns: ['(unclosed'],
  });
  assert.equal(bad.length, 1);
  assert.ok(bad[0].includes('footprintPatterns[0]'));

  const ok = validateCategory({
    name: 'x',
    footprintMode: 'contains',
    footprintPatterns: ['(unclosed'],
  });
  assert.deepEqual(ok, []);
});
