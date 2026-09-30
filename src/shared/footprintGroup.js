// Footprint ("посадочное место") grouping of purchase rows.
//
// The persisted set of footprints (the server `GroupedFootprint` collection)
// decides whether positions that share a footprint but differ by value are
// aggregated into a single purchase row. These helpers are dependency-free and
// shared by the server and the tests.
import { normalizeMatchText } from './value.js';

/**
 * Normalised footprint used as the grouping key. An empty footprint has no key
 * (an empty footprint cannot be grouped).
 */
export function normalizeFootprintKey(footprint) {
  return normalizeMatchText(footprint);
}

/**
 * Is this footprint marked for footprint grouping?
 *
 * @param {Set<string>|string[]} groupedFootprints Normalised footprint keys.
 * @param {string} footprint The raw footprint of a row; normalised here.
 */
export function isGroupedFootprint(groupedFootprints, footprint) {
  const key = normalizeFootprintKey(footprint);
  if (!key) {
    return false;
  }
  if (groupedFootprints instanceof Set) {
    return groupedFootprints.has(key);
  }
  return Array.isArray(groupedFootprints) ? groupedFootprints.includes(key) : false;
}

/**
 * Aggregation key of one row.
 *
 * Grouped footprints collapse every value on that footprint into one key;
 * everything else keeps the per-position `matchKey`.
 *
 * @param {object} input
 * @param {string} input.matchKey The persistent line key.
 * @param {string} input.footprint The raw footprint of the row.
 * @param {boolean} input.grouped Whether the footprint is marked for grouping.
 */
export function buildAggregationKey({ matchKey, footprint, grouped }) {
  return grouped
    ? `fp\u0000${normalizeFootprintKey(footprint)}`
    : `mk\u0000${matchKey}`;
}
