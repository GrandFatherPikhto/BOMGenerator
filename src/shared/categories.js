// Categorisation rules: match a BOM row against `ParseCategory` documents.
//
// This is a JavaScript port of `extract_ref_prefix` and `resolve_category` from
// `python/bom_merge.py`, extended with the `regex` mode required by the new
// project (see techdocs/plan-2026-09-27.md). It also contains the validation
// used before saving a category through the API/UI.

const REF_PREFIX_RE = /^[A-Za-z]+/;

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

// Compiled regular expressions are cached by their source; patterns come from
// the database and are validated on save, so a failure here is only a safety
// net (invalid patterns never match instead of crashing a whole request).
const regexCache = new Map();

function getRegex(pattern) {
  const source = String(pattern);
  if (!regexCache.has(source)) {
    regexCache.set(source, new RegExp(source, 'i'));
  }
  return regexCache.get(source);
}

function safeTest(pattern, text) {
  try {
    return getRegex(pattern).test(text);
  } catch {
    return false;
  }
}

function casefold(value) {
  return String(value ?? '').toLowerCase();
}

/**
 * Return `{ category, subcategory, sort }` for one BOM row.
 *
 * Categories are checked by ascending `order` and the first match wins, so
 * narrow categories are listed before general ones. A category matches when
 * all of its configured constraints match:
 *
 * * `refMode: "prefix"` (default): `refPatterns` are compared with the exact
 *   alphabetic prefix of the first reference designator (so `"FB"` never
 *   matches the fuse category `"F"`).
 * * `refMode: "regex"`: `refPatterns` are regular expressions tested against
 *   every comma-separated reference designator (`"U3,U4"` is split into
 *   `["U3", "U4"]`, each pattern may match any of them).
 * * `nameMode: "prefix"` (default): `namePatterns` are tested with
 *   `startsWith` (case-insensitive) on `Value`.
 * * `nameMode: "regex"`: `namePatterns` are regular expressions tested on the
 *   whole `Value`.
 *
 * When both `refPatterns` and `namePatterns` are present both must match.
 * Inside a category the first subcategory whose `footprintContains` substring
 * is found (case-insensitive) wins.
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
  const valueLower = valueText.toLowerCase();
  const footprintLower = casefold(footprint);
  const tokens = String(reference ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  for (const category of categories) {
    const refPatterns = category.refPatterns ?? [];
    const namePatterns = category.namePatterns ?? [];
    const refMode = category.refMode === 'regex' ? 'regex' : 'prefix';
    const nameMode = category.nameMode === 'regex' ? 'regex' : 'prefix';

    let refOk = true;
    if (refPatterns.length > 0) {
      if (refMode === 'regex') {
        refOk = refPatterns.some((pattern) =>
          tokens.some((token) => safeTest(pattern, token)),
        );
      } else {
        refOk = refPatterns.some((pattern) => String(pattern) === refPrefix);
      }
    }

    let nameOk = true;
    if (namePatterns.length > 0) {
      if (nameMode === 'regex') {
        nameOk = namePatterns.some((pattern) => safeTest(pattern, valueText));
      } else {
        nameOk = namePatterns.some((pattern) =>
          valueLower.startsWith(casefold(pattern)),
        );
      }
    }

    if (!refOk || !nameOk) {
      continue;
    }

    for (const sub of category.subcategories ?? []) {
      const needle = casefold(sub.footprintContains);
      if (needle && footprintLower.includes(needle)) {
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
 * * at least one of `refPatterns` / `namePatterns` must be present;
 * * every pattern of a `regex`-mode field must compile;
 * * every subcategory needs `name` and `footprintContains`.
 */
export function validateCategory(category) {
  const errors = [];
  const refPatterns = category.refPatterns ?? [];
  const namePatterns = category.namePatterns ?? [];

  if (!Array.isArray(refPatterns)) {
    errors.push('refPatterns must be an array of strings');
  }
  if (!Array.isArray(namePatterns)) {
    errors.push('namePatterns must be an array of strings');
  }
  if (
    Array.isArray(refPatterns) &&
    Array.isArray(namePatterns) &&
    refPatterns.length === 0 &&
    namePatterns.length === 0
  ) {
    errors.push('at least one of refPatterns and namePatterns is required');
  }

  const fields = [
    { name: 'refPatterns', mode: category.refMode, patterns: refPatterns },
    { name: 'namePatterns', mode: category.nameMode, patterns: namePatterns },
  ];
  for (const field of fields) {
    if (!Array.isArray(field.patterns)) {
      continue;
    }
    if (field.mode !== 'regex') {
      continue; // prefix patterns are plain strings, not regular expressions
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
