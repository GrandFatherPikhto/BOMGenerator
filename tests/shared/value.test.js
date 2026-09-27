// Tests for the nominal-value parser and the grouping key it feeds.
// Vectors are ported from python/tests/test_value_parsing.py and extended with
// the acceptance criteria of techdocs/plan-2026-09-27.md.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMatchKey,
  buildValueKey,
  chooseDisplay,
  collapseWhitespace,
  extractRefPrefix,
  normalizeFootprint,
  parseQty,
  parseValue,
} from '../../src/shared/index.js';

function approx(actual, expected) {
  const tolerance = Math.abs(expected) * 1e-12 || 1e-15;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

const RECOGNISED = [
  // capacitance
  ['1 pF', 1e-12, 'F'],
  ['100 nF', 100e-9, 'F'],
  ['100nF', 100e-9, 'F'],
  ['2.2 uF', 2.2e-6, 'F'],
  ['2.2uF', 2.2e-6, 'F'],
  ['2.2 \u00B5F', 2.2e-6, 'F'], // micro sign
  ['2.2 \u03BCF', 2.2e-6, 'F'], // greek mu
  ['2,2 uF', 2.2e-6, 'F'], // comma decimal separator
  ['4.7 mF', 4.7e-3, 'F'],
  ['10 F', 10.0, 'F'],
  ['470uF 35V', 470e-6, 'F'], // value + voltage tail
  // inductance
  ['1 nH', 1e-9, 'H'],
  ['47uH', 47e-6, 'H'],
  ['4.7mH', 4.7e-3, 'H'],
  ['1 H', 1.0, 'H'],
  // resistance
  ['240', 240.0, '\u03A9'],
  ['33', 33.0, '\u03A9'],
  ['10R', 10.0, '\u03A9'],
  ['2R2', 2.2, '\u03A9'],
  ['4K7', 4700.0, '\u03A9'], // RKM notation
  ['4.7K', 4700.0, '\u03A9'],
  ['100K', 100e3, '\u03A9'],
  ['1M', 1e6, '\u03A9'],
  ['1 k\u03A9', 1e3, '\u03A9'],
  ['10 ohm', 10.0, '\u03A9'],
  ['0', 0.0, '\u03A9'],
  // frequency (documented extension beyond capacitors/resistors/inductors)
  ['8MHz', 8e6, 'Hz'],
  ['32.768KHz', 32768.0, 'Hz'],
];

for (const [raw, magnitude, unit] of RECOGNISED) {
  test(`parseValue recognises ${JSON.stringify(raw)}`, () => {
    const parsed = parseValue(raw);
    assert.equal(parsed.parsed, true);
    assert.equal(parsed.unit, unit);
    approx(parsed.magnitude, magnitude);
    assert.equal(parsed.raw, raw); // original spelling is always kept
  });
}

const UNRECOGNISED = [
  'TAJD107K016RNJ',
  'TAJB476K010UNJ',
  'LED',
  '1N4148W',
  '1N4001-SMA',
  'US1M',
  '5KP400A',
  'C4D10120A',
  'M1',
  '24V Input',
  'CL_JTAG',
  'B2403S-2W',
  'SW_Push',
  'AMS1117-1.2',
  'MF-MSMF050-2',
  'SG-7050CAN',
  'Rotary Encoder',
  '10CL006YE144C8G',
  'ISO7720FDWR',
  '',
  '   ',
];

for (const raw of UNRECOGNISED) {
  test(`parseValue keeps ${JSON.stringify(raw)} unparsed`, () => {
    const parsed = parseValue(raw);
    assert.equal(parsed.parsed, false);
    assert.equal(parsed.magnitude, null);
    assert.equal(parsed.unit, null);
    assert.equal(parsed.suffix, '');
    assert.equal(parsed.raw, raw.trim());
  });
}

test('parseValue keeps the voltage tail verbatim', () => {
  assert.equal(parseValue('470uF 35V').suffix, '35V');
  assert.equal(parseValue('47 uF 35V').suffix, '35V');
  assert.equal(parseValue('2.2 uF 25V').suffix, '25V');
  assert.equal(parseValue('4.7 uF 25v').suffix, '25v'); // case kept
  assert.equal(parseValue('100 nF').suffix, '');
  assert.equal(parseValue('  100   nF  ').suffix, '');
});

test('parseValue collapses whitespace but keeps spelling', () => {
  assert.equal(parseValue('  100   nF ').raw, '100 nF');
  assert.equal(parseValue('  TAJD107K016RNJ\n').raw, 'TAJD107K016RNJ');
});

test('RKM and dot notation parse to the same magnitude', () => {
  assert.equal(parseValue('4K7').magnitude, parseValue('4.7K').magnitude);
  approx(parseValue('2R2').magnitude, 2.2);
  assert.equal(parseValue('1K').magnitude, parseValue('1 k\u03A9').magnitude);
});

test('same magnitude in different unit families stays apart', () => {
  const nanoFarad = parseValue('1 nF');
  const nanoHenry = parseValue('1 nH');
  approx(nanoFarad.magnitude, 1e-9);
  approx(nanoHenry.magnitude, 1e-9);
  assert.notEqual(nanoFarad.unit, nanoHenry.unit);
});

// ---------------------------------------------------------------------------
// buildValueKey
// ---------------------------------------------------------------------------

function key(raw, category = 'Конденсаторы', defaultCategory = 'Прочее') {
  return buildValueKey(parseValue(raw), category, defaultCategory);
}

const EQUAL_PAIRS = [
  ['2.2uF', '2.2 uF'],
  ['100 nF', '100nF'],
  ['4K7', '4.7K'],
  ['2K2', '2.2 k\u03A9'],
  ['4.7 mF', '4700uF'],
];

for (const [left, right] of EQUAL_PAIRS) {
  test(`value key is normalised: ${left} == ${right}`, () => {
    assert.deepEqual(key(left), key(right));
  });
}

const DIFFERENT_PAIRS = [
  ['2.2 uF', '2.2 uF 25V'],
  ['470uF 35V', '470uF 50V'],
  ['1 nF', '1 nH'],
  ['100 nF', '100 pF'],
];

for (const [left, right] of DIFFERENT_PAIRS) {
  test(`value key keeps a difference: ${left} != ${right}`, () => {
    assert.notDeepEqual(key(left), key(right));
  });
}

test('value key of unparsed values is the raw text', () => {
  assert.deepEqual(key('TAJD107K016RNJ'), key('TAJD107K016RNJ'));
  assert.notDeepEqual(key('TAJD107K016RNJ'), key('TAJB476K010UNJ'));
  assert.notDeepEqual(key('SW_Push'), key('sw_push')); // spelling matters
});

test('value key of the default category is never normalised', () => {
  assert.notDeepEqual(key('2.2uF', 'Прочее'), key('2.2 uF', 'Прочее'));
  assert.deepEqual(key('2.2uF', 'Прочее'), key('2.2uF', 'Прочее'));
});

// ---------------------------------------------------------------------------
// buildMatchKey (acceptance criterion 4)
// ---------------------------------------------------------------------------

test('matchKey unifies RKM and dot notation for the same footprint', () => {
  const footprint = 'Resistor_SMD:R_0402';
  assert.equal(buildMatchKey('4K7', footprint), buildMatchKey('4.7K', footprint));
});

test('matchKey keeps a different voltage tail apart', () => {
  const footprint = 'Capacitor_SMD:C_0603';
  assert.notEqual(
    buildMatchKey('2.2 uF', footprint),
    buildMatchKey('2.2 uF 25V', footprint),
  );
});

test('matchKey uses the footprint', () => {
  assert.notEqual(
    buildMatchKey('100 nF', 'Capacitor_SMD:C_0603'),
    buildMatchKey('100 nF', 'Capacitor_SMD:C_0402'),
  );
});

test('matchKey of an unparsed part number keeps its spelling', () => {
  const footprint = 'Capacitor_Tantalum_SMD:CP_EIA-7343-20';
  assert.equal(
    buildMatchKey('TAJD107K016RNJ', footprint),
    buildMatchKey('TAJD107K016RNJ', footprint),
  );
  assert.notEqual(
    buildMatchKey('TAJD107K016RNJ', footprint),
    buildMatchKey('TAJB476K010UNJ', footprint),
  );
});

// ---------------------------------------------------------------------------
// helpers: whitespace, footprint, qty, reference prefix
// ---------------------------------------------------------------------------

test('collapseWhitespace trims and collapses runs', () => {
  assert.equal(collapseWhitespace('  a   b  '), 'a b');
});

test('normalizeFootprint joins several footprints with ", "', () => {
  assert.equal(
    normalizeFootprint('  Capacitor_SMD:C_0603 ,  Capacitor_SMD:C_1210 '),
    'Capacitor_SMD:C_0603, Capacitor_SMD:C_1210',
  );
  assert.equal(normalizeFootprint('Capacitor_SMD:C_0603'), 'Capacitor_SMD:C_0603');
  assert.equal(normalizeFootprint(''), '');
  assert.equal(normalizeFootprint(','), '');
});

const QTY_CASES = [
  ['18', 'C2,C3,C4', 18],
  ['1.0', 'C1', 1],
  ['', 'C1,C2,C3', 3],
  ['', 'C1, C2 ,C3', 3],
  ['', '', 0],
  ['abc', 'C1,C2', 2],
];

for (const [rawQty, reference, expected] of QTY_CASES) {
  test(`parseQty(${JSON.stringify(rawQty)}, ${JSON.stringify(reference)}) === ${expected}`, () => {
    assert.equal(parseQty(rawQty, reference), expected);
  });
}

test('extractRefPrefix takes the letters of the first designator', () => {
  assert.equal(extractRefPrefix('C12'), 'C');
  assert.equal(extractRefPrefix('FB3'), 'FB');
  assert.equal(extractRefPrefix('FB3,FB4'), 'FB');
  assert.equal(extractRefPrefix('C2,C3,C4'), 'C');
  assert.equal(extractRefPrefix('1X'), '');
  assert.equal(extractRefPrefix(''), '');
});

test('chooseDisplay prefers the most frequent spelling, ties go first', () => {
  assert.equal(chooseDisplay(['2.2uF', '2.2 uF', '2.2 uF']), '2.2 uF');
  assert.equal(chooseDisplay(['2.2uF', '2.2 uF']), '2.2uF');
  assert.equal(chooseDisplay(['a', 'a', 'b']), 'a');
});
