// Categorisation rules: match a BOM row against `ParseCategory` documents.
//
// This is a JavaScript port of `extract_ref_prefix` and `resolve_category` from
// `python/bom_merge.py`, extended with regex modes and a third Footprint
// condition (see techdocs/plan-2026-09-27.md). It also contains the validation
// used before saving a category through the API/UI.

const REF_PREFIX_RE = /^[A-Za-z]+/;
const FOOTPRINT_MODES = ['prefix', 'regex', 'contains'];

/**
 * `"C2,C3,C4"` -> `"C"`, `"FB3,FB4"` -> `"FB"`, `"1X"` -> `""`.
 * The alphabetic part of the first reference designator is taken.
 */
export function extractRefPrefix(reference) {
  const firstReference = String(reference ?? '')
    .split(',')[0]
    .trim();
  const match = REF_PREFIX_RE.exec(firstReference);
  return match ? match[0] : '';
}

// Compiled regular expressions are cached by source + case sensitivity; patterns
// come from the database and are validated on save, so a failure here is only a
// safety net (invalid patterns never match instead of crashing a whole request).
const regexCache = new Map();

function getRegex(pattern, caseSensitive) {
  const key = `${caseSensitive ? 's' : 'i'}\u0000${String(pattern)}`;
  if (!regexCache.has(key)) {
    regexCache.set(key, new RegExp(String(pattern), caseSensitive ? '' : 'i'));
  }
  return regexCache.get(key);
}

function safeTest(pattern, text, caseSensitive) {
  try {
    return getRegex(pattern, caseSensitive).test(text);
  } catch {
    return false;
  }
}

function makeFold(caseSensitive) {
  return (value) =>
    caseSensitive ? String(value ?? '') : String(value ?? '').toLowerCase();
}

/**
 * Return `{ category, subcategory, sort }` for one BOM row.
 *
 * Categories are checked by ascending `order` and the first match wins, so
 * narrow categories are listed before general ones. A category may constrain
 * Reference, Value and/or Footprint; **when more than one is set, all of them
 * must match (AND)**. At least one of the three is required (validated on save).
 *
 * * Reference: `prefix` (exact alphabetic prefix of the first designator, so
 *   `"FB"` never matches the fuse category `"F"`) or `regex` (tested against
 *   every comma-separated designator).
 * * Value: `prefix` (`startsWith`) or `regex` (tested on the whole value).
 * * Footprint: `prefix` (`startsWith`), `contains` (substring) or `regex`.
 *
 * `caseSensitive` (default `false`) controls all three comparisons.
 * Inside a category the first subcategory whose `footprintContains` substring is
 * found wins.
 */
export function resolveCategory({
  reference,
  refPrefix,
  value,
  footprint,
  categories,
  defaultCategory,
  defaultSort = 'name',
}) {
  const valueText = String(value ?? '');
  const footprintText = String(footprint ?? '');
  const tokens = String(reference ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  for (const category of categories) {
    const caseSensitive = Boolean(category.caseSensitive);
    const fold = makeFold(caseSensitive);

    const refPatterns = category.refPatterns ?? [];
    const namePatterns = category.namePatterns ?? [];
    const footprintPatterns = category.footprintPatterns ?? [];
    const refMode = category.refMode === 'regex' ? 'regex' : 'prefix';
    const nameMode = category.nameMode === 'regex' ? 'regex' : 'prefix';
    const footprintMode = FOOTPRINT_MODES.includes(category.footprintMode)
      ? category.footprintMode
      : 'prefix';

    let refOk = true;
    if (refPatterns.length > 0) {
      if (refMode === 'regex') {
        refOk = refPatterns.some((pattern) =>
          tokens.some((token) => safeTest(pattern, token, caseSensitive)),
        );
      } else {
        refOk = refPatterns.some((pattern) => fold(pattern) === fold(refPrefix));
      }
    }

    let nameOk = true;
    if (namePatterns.length > 0) {
      if (nameMode === 'regex') {
        nameOk = namePatterns.some((pattern) =>
          safeTest(pattern, valueText, caseSensitive),
        );
      } else {
        nameOk = namePatterns.some((pattern) =>
          fold(valueText).startsWith(fold(pattern)),
        );
      }
    }

    let footprintOk = true;
    if (footprintPatterns.length > 0) {
      if (footprintMode === 'regex') {
        footprintOk = footprintPatterns.some((pattern) =>
          safeTest(pattern, footprintText, caseSensitive),
        );
      } else if (footprintMode === 'contains') {
        footprintOk = footprintPatterns.some((pattern) =>
          fold(footprintText).includes(fold(pattern)),
        );
      } else {
        footprintOk = footprintPatterns.some((pattern) =>
          fold(footprintText).startsWith(fold(pattern)),
        );
      }
    }

    if (!refOk || !nameOk || !footprintOk) {
      continue;
    }

    for (const sub of category.subcategories ?? []) {
      const needle = String(sub.footprintContains ?? '').toLowerCase();
      if (needle && footprintText.toLowerCase().includes(needle)) {
        return {
          category: String(category.name),
          subcategory: String(sub.name),
          sort: category.sort || defaultSort,
        };
      }
    }
    return {
      category: String(category.name),
      subcategory: null,
      sort: category.sort || defaultSort,
    };
  }

  return { category: defaultCategory, subcategory: null, sort: 'name' };
}

/**
 * Validate a category definition (raw, as received from the API).
 *
 * Returns an array of human-readable error messages (empty when valid):
 * * at least one of `refPatterns` / `namePatterns` / `footprintPatterns`;
 * * every pattern of a `regex`-mode field must compile;
 * * every subcategory needs `name` and `footprintContains`.
 */
export function validateCategory(category) {
  const errors = [];
  const refPatterns = category.refPatterns ?? [];
  const namePatterns = category.namePatterns ?? [];
  const footprintPatterns = category.footprintPatterns ?? [];

  const arrays = [
    ['refPatterns', refPatterns],
    ['namePatterns', namePatterns],
    ['footprintPatterns', footprintPatterns],
  ];
  for (const [name, patterns] of arrays) {
    if (!Array.isArray(patterns)) {
      errors.push(`${name} must be an array of strings`);
    }
  }
  const allArrays = arrays.every(([, patterns]) => Array.isArray(patterns));
  if (
    allArrays &&
    refPatterns.length === 0 &&
    namePatterns.length === 0 &&
    footprintPatterns.length === 0
  ) {
    errors.push(
      'at least one of refPatterns, namePatterns and footprintPatterns is required',
    );
  }

  const fields = [
    { name: 'refPatterns', mode: category.refMode, patterns: refPatterns },
    { name: 'namePatterns', mode: category.nameMode, patterns: namePatterns },
    {
      name: 'footprintPatterns',
      mode: category.footprintMode,
      patterns: footprintPatterns,
    },
  ];
  for (const field of fields) {
    if (!Array.isArray(field.patterns)) {
      continue;
    }
    if (field.mode !== 'regex') {
      continue; // prefix/contains patterns are plain strings, not regexes
    }
    field.patterns.forEach((pattern, index) => {
      try {
        // eslint-disable-next-line no-new
        new RegExp(String(pattern));
      } catch (error) {
        errors.push(
          `${field.name}[${index}] is not a valid regex (${JSON.stringify(String(pattern))}): ${error.message}`,
        );
      }
    });
  }

  (category.subcategories ?? []).forEach((sub, index) => {
    if (!sub || !String(sub.name ?? '').trim()) {
      errors.push(`subcategories[${index}].name is required`);
    }
    if (!sub || !String(sub.footprintContains ?? '').trim()) {
      errors.push(`subcategories[${index}].footprintContains is required`);
    }
  });

  return errors;
}
