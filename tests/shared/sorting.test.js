// Tests for block sorting, ported from the behaviour of sort_groups.
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseValue, sortGroups } from '../../src/shared/index.js';

function group(display, footprint = 'FP') {
  return { display, footprint, parsed: parseValue(display) };
}

test('value_desc: descending magnitude, unparsed values last alphabetically', () => {
  const groups = [
    group('100 nF'),
    group('TAJD107K016RNJ'),
    group('10 uF'),
    group('1 nF'),
    group('LED'),
  ];
  const sorted = sortGroups(groups, 'value_desc').map((item) => item.display);
  assert.deepEqual(sorted, [
    '10 uF',
    '100 nF',
    '1 nF',
    'LED',
    'TAJD107K016RNJ',
  ]);
});

test('value_desc scores "4K7" and "4.7K" by the same magnitude', () => {
  const groups = [group('100K'), group('4K7'), group('10K')];
  const sorted = sortGroups(groups, 'value_desc').map((item) => item.display);
  assert.deepEqual(sorted, ['100K', '10K', '4K7']);
});

test('value_asc puts unparsed values last', () => {
  const groups = [group('TAJD107K016RNJ'), group('10 uF'), group('1 nF')];
  const sorted = sortGroups(groups, 'value_asc').map((item) => item.display);
  assert.deepEqual(sorted, ['1 nF', '10 uF', 'TAJD107K016RNJ']);
});

test('name sort is alphabetical by displayed value', () => {
  const groups = [group('b'), group('A'), group('C')];
  const sorted = sortGroups(groups, 'name').map((item) => item.display);
  assert.deepEqual(sorted, ['A', 'b', 'C']);
});

test('unknown sort spec falls back to name', () => {
  const groups = [group('b'), group('A')];
  const sorted = sortGroups(groups, 'whatever').map((item) => item.display);
  assert.deepEqual(sorted, ['A', 'b']);
});
