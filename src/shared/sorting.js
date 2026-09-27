// Sorting of grouped BOM rows, ported from `sort_groups` in python/bom_merge.py.

function casefold(value) {
  return String(value ?? '').toLowerCase();
}

function compareText(left, right) {
  return casefold(left).localeCompare(casefold(right));
}

/**
 * Sort one category block.
 *
 * * `value_desc`: recognised nominals first (descending magnitude, then
 *   suffix/display/footprint), unparsed values (part numbers) last,
 *   alphabetically.
 * * `value_asc`: ascending magnitude, unparsed values last.
 * * `name` (default): alphabetically by the displayed name, then footprint.
 */
export function sortGroups(groups, sortSpec) {
  const spec = sortSpec || 'name';

  if (spec === 'value_desc') {
    const parsedGroups = groups.filter((group) => group.parsed?.parsed);
    const unparsedGroups = groups.filter((group) => !group.parsed?.parsed);
    parsedGroups.sort(
      (left, right) =>
        right.parsed.magnitude - left.parsed.magnitude ||
        compareText(left.parsed.suffix, right.parsed.suffix) ||
        compareText(left.display, right.display) ||
        compareText(left.footprint, right.footprint),
    );
    unparsedGroups.sort(
      (left, right) =>
        compareText(left.display, right.display) ||
        compareText(left.footprint, right.footprint),
    );
    return [...parsedGroups, ...unparsedGroups];
  }

  if (spec === 'value_asc') {
    const magnitudeOf = (group) =>
      group.parsed?.parsed ? group.parsed.magnitude : Number.POSITIVE_INFINITY;
    return [...groups].sort(
      (left, right) =>
        magnitudeOf(left) - magnitudeOf(right) ||
        compareText(left.display, right.display) ||
        compareText(left.footprint, right.footprint),
    );
  }

  return [...groups].sort(
    (left, right) =>
      compareText(left.display, right.display) ||
      compareText(left.footprint, right.footprint),
  );
}
