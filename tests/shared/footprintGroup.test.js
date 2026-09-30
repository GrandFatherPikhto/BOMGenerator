// Footprint grouping helpers: normalisation, the "grouped" check and the
// aggregation key.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAggregationKey,
  isGroupedFootprint,
  normalizeFootprintKey,
} from '../../src/shared/index.js';

test('normalizeFootprintKey collapses whitespace and case', () => {
  assert.equal(normalizeFootprintKey('  R_0603  '), 'r_0603');
  assert.equal(normalizeFootprintKey('R_0603'), normalizeFootprintKey(' r_0603 '));
});

test('isGroupedFootprint matches a normalised key in a Set or an array', () => {
  const grouped = new Set(['r_0603']);
  assert.equal(isGroupedFootprint(grouped, 'R_0603'), true);
  assert.equal(isGroupedFootprint(grouped, 'C_0402'), false);
  assert.equal(isGroupedFootprint(['r_0603'], ' R_0603 '), true);
});

test('isGroupedFootprint never groups an empty footprint', () => {
  assert.equal(isGroupedFootprint(new Set(['']), ''), false);
  assert.equal(isGroupedFootprint([''], '   '), false);
  assert.equal(isGroupedFootprint(undefined, 'R_0603'), false);
});

test('buildAggregationKey keeps the matchKey unless the footprint is grouped', () => {
  assert.equal(
    buildAggregationKey({ matchKey: 'mk1', footprint: 'R_0603', grouped: false }),
    'mk\u0000mk1',
  );
  assert.equal(
    buildAggregationKey({ matchKey: 'mk1', footprint: ' R_0603 ', grouped: true }),
    'fp\u0000r_0603',
  );
});

test('buildAggregationKey collapses different values on one footprint', () => {
  const first = buildAggregationKey({
    matchKey: '100R',
    footprint: 'R_0603',
    grouped: true,
  });
  const second = buildAggregationKey({
    matchKey: '10K',
    footprint: 'R_0603',
    grouped: true,
  });
  assert.equal(first, second);
});
