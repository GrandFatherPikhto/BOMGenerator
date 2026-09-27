// Nominal value parsing and the grouping key it feeds.
//
// This is a JavaScript port of `parse_value`, `_resolve_unit`, `build_value_key`,
// `parse_qty`, `normalize_footprint`, `normalize_match_text` and
// `collapse_whitespace` from the original Python project (`python/bom_merge.py`).
// The behaviour must match the Python implementation, see techdocs/plan-2026-09-27.md.

// SI prefixes found in KiCad BOM values. "R" is the root multiplier of the
// RKM notation ("10R" == 10 ohm) and is handled separately.
export const SI_PREFIXES = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  '\u00B5': 1e-6, // micro sign
  '\u03BC': 1e-6, // greek small letter mu
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
};

// Recognised base units mapped to [canonical unit, multiplier].
// "Hz" is a small extension beyond the specification so that crystals
// ("8MHz", "32.768KHz") can be sorted meaningfully.
export const BASE_UNITS = {
  F: ['F', 1.0],
  H: ['H', 1.0],
  '\u03A9': ['\u03A9', 1.0],
  R: ['\u03A9', 1.0], // "10R" == 10 ohm
  ohm: ['\u03A9', 1.0],
  Ohm: ['\u03A9', 1.0],
  OHM: ['\u03A9', 1.0],
  Hz: ['Hz', 1.0],
  hz: ['Hz', 1.0],
  HZ: ['Hz', 1.0],
};

// "R" of the RKM notation is a factor of 1, not an SI prefix.
export const RKM_ROOT_MULTIPLIERS = { R: 1.0, r: 1.0 };

// <mantissa><multiplier><fraction><unit><tail>
// Examples: "100 nF", "470uF 35V", "4K7", "2R2", "1M", "10R", "32.768KHz".
const VALUE_RE =
  /^\s*(\d+(?:[.,]\d+)?)(\s?[RrKkMmGg])?(\d+)?(\s?[A-Za-z\u00B5\u03BC\u03A9]+)?\s*(.*)$/;

const WHITESPACE_RE = /\s+/g;

/** Collapse runs of whitespace and trim the edges. */
export function collapseWhitespace(text) {
  return String(text ?? '')
    .replace(WHITESPACE_RE, ' ')
    .trim();
}

/**
 * Map a unit token to `{ canonical, factor }`, or `null` when unknown.
 * A bare number (or an RKM letter without a unit) means ohms.
 */
export function resolveUnit(unit, multiplier) {
  const unitText = String(unit ?? '').trim();
  let factor = 1.0;
  let canonical = null;

  if (unitText) {
    if (Object.prototype.hasOwnProperty.call(BASE_UNITS, unitText)) {
      [canonical] = BASE_UNITS[unitText];
      factor *= BASE_UNITS[unitText][1];
    } else if (
      unitText.length >= 2 &&
      Object.prototype.hasOwnProperty.call(SI_PREFIXES, unitText[0]) &&
      Object.prototype.hasOwnProperty.call(BASE_UNITS, unitText.slice(1))
    ) {
      const base = BASE_UNITS[unitText.slice(1)];
      canonical = base[0];
      factor *= base[1] * SI_PREFIXES[unitText[0]];
    } else {
      return null; // unknown unit -> value stays unparsed
    }
  }

  const multiplierText = String(multiplier ?? '').trim();
  if (multiplierText) {
    if (Object.prototype.hasOwnProperty.call(SI_PREFIXES, multiplierText)) {
      factor *= SI_PREFIXES[multiplierText];
    } else if (
      Object.prototype.hasOwnProperty.call(RKM_ROOT_MULTIPLIERS, multiplierText)
    ) {
      factor *= RKM_ROOT_MULTIPLIERS[multiplierText];
    } else {
      return null;
    }
  }

  if (canonical === null) {
    canonical = '\u03A9'; // bare number / RKM letter without a unit means ohms
  }

  return { canonical, factor };
}

/**
 * Parse a KiCad `Value` into something comparable and sortable.
 *
 * * `"100 nF"`   -> 1e-7 F, unit `F`
 * * `"4K7"`      -> 4700 ohm (RKM notation)
 * * `"470uF 35V"`-> 4.7e-4 F with suffix `"35V"`
 * * part numbers (`"TAJD107K016RNJ"`) stay unparsed, the original string is kept
 *
 * The suffix (voltage/tolerance tail) is kept verbatim so that two parts with
 * different tails never collapse into one row.
 */
export function parseValue(rawValue) {
  const display = collapseWhitespace(rawValue);
  const match = VALUE_RE.exec(display);
  if (!match) {
    return { raw: display, parsed: false, magnitude: null, unit: null, suffix: '' };
  }

  const [, numText, multiplier, fraction, unitText, tail] = match;
  let number = Number.parseFloat(numText.replace(',', '.'));
  const resolved = resolveUnit(unitText, multiplier);
  if (resolved === null) {
    return { raw: display, parsed: false, magnitude: null, unit: null, suffix: '' };
  }

  if (multiplier && fraction) {
    // RKM notation: "4K7" -> 4.7k, "2R2" -> 2.2 ohm
    number = Number.parseFloat(`${Number.parseInt(numText, 10)}.${fraction}`);
  }

  return {
    raw: display,
    parsed: true,
    magnitude: number * resolved.factor,
    unit: resolved.canonical,
    suffix: collapseWhitespace(tail ?? ''),
  };
}

/**
 * Stable textual form of the parsed magnitude. Nine exponent digits remove
 * float noise so that equal nominals written differently map to the same key.
 */
export function formatMagnitude(magnitude) {
  return Number(magnitude).toExponential(9);
}

/**
 * Grouping component that represents the nominal value.
 *
 * Unparsed values (part numbers) keep their raw spelling and the default
 * category is compared "as is" without normalisation.
 */
export function buildValueKey(parsed, category, defaultCategory) {
  if (category === defaultCategory || !parsed.parsed) {
    return ['raw', parsed.raw];
  }
  return ['num', parsed.unit ?? '', formatMagnitude(parsed.magnitude), parsed.suffix];
}

/**
 * Case/whitespace-insensitive key used to match rows between runs and to group
 * positions in the "Common purchases" sheet.
 */
export function normalizeMatchText(value) {
  return collapseWhitespace(value).toLowerCase();
}

/**
 * KiCad puts several comma-separated footprints in one cell; the string is
 * normalised (trimmed, single comma+space separators) and used as-is.
 */
export function normalizeFootprint(rawFootprint) {
  return String(rawFootprint ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

/** Return the KiCad `Qty`; fall back to counting `Reference` entries. */
export function parseQty(rawQty, reference) {
  const text = String(rawQty ?? '').trim();
  if (text) {
    const parsed = Number.parseFloat(text);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return String(reference ?? '')
    .split(',')
    .filter((part) => part.trim()).length;
}

/**
 * Nominal token of one row, independent of the category. Parsed values are
 * normalised (unit + magnitude + suffix); unparsed values keep their raw
 * spelling.
 */
export function buildNominalToken(parsed) {
  if (parsed.parsed) {
    return `num|${parsed.unit ?? ''}|${formatMagnitude(parsed.magnitude)}|${parsed.suffix}`;
  }
  return `raw|${parsed.raw}`;
}

/**
 * Persistent key of a BOM line: normalised nominal + normalised footprint.
 *
 * NOTE: this is the key of re-import matching and of the "Common purchases"
 * grouping. It deliberately does not involve the category, so that editing
 * categorisation rules never invalidates hand-filled seller/shipping values.
 * The nominal part is normalised ("4K7" == "4.7K") per acceptance criterion 4;
 * unparsed values keep their spelling.
 */
export function buildMatchKey(parsedOrValue, footprint) {
  const parsed =
    typeof parsedOrValue === 'string' ? parseValue(parsedOrValue) : parsedOrValue;
  return `${buildNominalToken(parsed)}\u0001${normalizeMatchText(footprint)}`;
}

/** Pick the most frequent spelling; ties go to the first occurrence. */
export function chooseDisplay(displays) {
  const counts = new Map();
  const firstPosition = new Map();
  displays.forEach((display, index) => {
    counts.set(display, (counts.get(display) ?? 0) + 1);
    if (!firstPosition.has(display)) {
      firstPosition.set(display, index);
    }
  });

  let best = null;
  let bestCount = -1;
  let bestPosition = Number.POSITIVE_INFINITY;
  for (const [display, count] of counts) {
    const position = firstPosition.get(display);
    if (count > bestCount || (count === bestCount && position < bestPosition)) {
      best = display;
      bestCount = count;
      bestPosition = position;
    }
  }
  return best;
}
