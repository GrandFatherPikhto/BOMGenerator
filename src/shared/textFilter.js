// Dependency-free text filters for list screens (plain substring or a regex).
//
// Used by the "Продавцы/Товары" screen to narrow the product list by name and
// category. The module is shared so the matching rules can be unit-tested
// without rendering React.

/** Escape a literal string so it can be used inside a regular expression. */
export function escapeRegExp(text) {
  return String(text ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile one filter field.
 *
 * - An empty pattern means "no condition at all" (`active: false`).
 * - `regex: false` matches a case-insensitive substring (the app compares text
 *   that way everywhere).
 * - `regex: true` compiles the pattern as a regular expression and tests it
 *   with `test()`, so partial matches work (`\d+` finds any number).
 *
 * An invalid regular expression is reported through `error` instead of being
 * thrown; `match` is then `null`, so the caller can show a message and ignore
 * the field rather than silently showing an empty list.
 */
export function compileTextFilter(value, { regex = false } = {}) {
  const pattern = String(value ?? '').trim();
  if (!pattern) {
    return { active: false, match: null, error: null };
  }

  if (!regex) {
    const needle = pattern.toLowerCase();
    return {
      active: true,
      error: null,
      match: (text) => String(text ?? '').toLowerCase().includes(needle),
    };
  }

  try {
    const expression = new RegExp(pattern, 'i');
    return {
      active: true,
      error: null,
      match: (text) => expression.test(String(text ?? '')),
    };
  } catch (error) {
    return { active: true, match: null, error: error.message };
  }
}

/**
 * Compile the product filter: an optional name and an optional category field,
 * combined with AND (fill one, the other, or both).
 *
 * Returns `{ active, errors: {name, category}, match(product) }`.
 */
export function compileProductFilter({
  name = '',
  nameRegex = false,
  category = '',
  categoryRegex = false,
} = {}) {
  const nameFilter = compileTextFilter(name, { regex: nameRegex });
  const categoryFilter = compileTextFilter(category, { regex: categoryRegex });

  return {
    active: nameFilter.active || categoryFilter.active,
    errors: { name: nameFilter.error, category: categoryFilter.error },
    match: (product) => {
      if (nameFilter.match && !nameFilter.match(product?.name)) {
        return false;
      }
      if (categoryFilter.match && !categoryFilter.match(product?.category)) {
        return false;
      }
      return true;
    },
  };
}
