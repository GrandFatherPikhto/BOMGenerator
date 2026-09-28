// Row-level filters for the purchase tables (a single board and the common
// purchases sheet).
//
// Dependency-free so the matching rules can be unit-tested without rendering
// React. Two text conditions (value, footprint) and a numeric condition on the
// "Итого" column are combined with AND; an empty field means "no condition".
//
// A text condition is a case-insensitive substring by default; `regex` switches
// it to a regular expression and `caseSensitive` keeps the exact case.

/** Numeric operators supported by the quantity filter ("Итого"). */
export const QTY_OPERATORS = ['gt', 'lt', 'eq'];

/**
 * Compile one text condition.
 *
 * Returns `{ active, error, match(text) }`:
 * - empty pattern -> `active: false`, so the condition is ignored;
 * - an invalid regular expression is reported through `error` (and `match` is
 *   `null`), letting the caller show a message instead of dropping all rows.
 */
export function compileTextMatch(pattern, { regex = false, caseSensitive = false } = {}) {
  const text = String(pattern ?? '').trim();
  if (!text) {
    return { active: false, error: null, match: null };
  }

  if (!regex) {
    const needle = caseSensitive ? text : text.toLowerCase();
    return {
      active: true,
      error: null,
      match: (value) => {
        const source = String(value ?? '');
        return caseSensitive
          ? source.includes(needle)
          : source.toLowerCase().includes(needle);
      },
    };
  }

  try {
    const expression = new RegExp(text, caseSensitive ? '' : 'i');
    return {
      active: true,
      error: null,
      match: (value) => expression.test(String(value ?? '')),
    };
  } catch (error) {
    return { active: true, match: null, error: error.message };
  }
}

/** Compile the "Итого" condition: an operator plus a number. */
function compileQtyMatch(qtyOp, qty) {
  const raw = String(qty ?? '').trim();
  if (!raw || !QTY_OPERATORS.includes(qtyOp)) {
    return { active: false, error: null, match: null };
  }

  const number = Number(raw);
  if (!Number.isFinite(number)) {
    return { active: true, error: 'Не число', match: null };
  }

  const compare = {
    gt: (left, right) => left > right,
    lt: (left, right) => left < right,
    eq: (left, right) => left === right,
  }[qtyOp];

  return {
    active: true,
    error: null,
    match: (row) => {
      const value = Number(row?.totalQty);
      return Number.isFinite(value) && compare(value, number);
    },
  };
}

/**
 * The seller condition only makes sense inside the table it was chosen in. A
 * value persisted in the URL (or left over from another board/tab) that is not
 * among `sellerOptions` is treated as "no seller", so a stale filter cannot
 * hide every row or narrow the product list.
 */
export function activeSellerId(sellerOptions, sellerId) {
  const id = String(sellerId ?? '').trim();
  if (!id) {
    return '';
  }
  return (sellerOptions ?? []).some(
    (seller) => String(seller?.id ?? '') === id,
  )
    ? id
    : '';
}

/**
 * Compile the whole filter of a purchase table into
 * `{ active, errors: { value, footprint, qty }, match(row) }`.
 *
 * `value` and `footprint` match the eponymous row fields; `qtyOp`/`qty` compare
 * the row's `totalQty` (the "Итого" / "Нужно всего" column); `seller` keeps only
 * the rows bought from that seller (which positions it supplies).
 */
export function compileLineFilter({
  value = '',
  valueRegex = false,
  valueCaseSensitive = false,
  footprint = '',
  footprintRegex = false,
  footprintCaseSensitive = false,
  qtyOp = '',
  qty = '',
  seller = '',
} = {}) {
  const valueFilter = compileTextMatch(value, {
    regex: valueRegex,
    caseSensitive: valueCaseSensitive,
  });
  const footprintFilter = compileTextMatch(footprint, {
    regex: footprintRegex,
    caseSensitive: footprintCaseSensitive,
  });
  const qtyFilter = compileQtyMatch(qtyOp, qty);
  const sellerId = String(seller ?? '').trim();

  return {
    active:
      valueFilter.active ||
      footprintFilter.active ||
      qtyFilter.active ||
      Boolean(sellerId),
    errors: {
      value: valueFilter.error,
      footprint: footprintFilter.error,
      qty: qtyFilter.error,
    },
    match: (row) => {
      if (valueFilter.match && !valueFilter.match(row?.value)) {
        return false;
      }
      if (footprintFilter.match && !footprintFilter.match(row?.footprint)) {
        return false;
      }
      if (qtyFilter.match && !qtyFilter.match(row)) {
        return false;
      }
      if (sellerId && String(row?.sellerId ?? '') !== sellerId) {
        return false;
      }
      return true;
    },
  };
}

/**
 * Keep only the matching line blocks together with the category/subcategory
 * headers that still have at least one matching line under them. The original
 * order is preserved, so the result can be handed straight to `LinesTable`.
 */
export function filterBlocks(blocks, match) {
  if (typeof match !== 'function') {
    return blocks;
  }

  const result = [];
  let categoryHeader = null;
  let categoryEmitted = false;
  let subcategoryHeader = null;
  let subcategoryEmitted = false;

  for (const block of blocks) {
    if (block.kind === 'category') {
      categoryHeader = block;
      categoryEmitted = false;
      subcategoryHeader = null;
      subcategoryEmitted = false;
      continue;
    }
    if (block.kind === 'subcategory') {
      subcategoryHeader = block;
      subcategoryEmitted = false;
      continue;
    }
    if (block.kind !== 'line' || !match(block.line)) {
      continue;
    }

    // Emit each pending header once, right before its first matching line.
    if (categoryHeader && !categoryEmitted) {
      result.push(categoryHeader);
      categoryEmitted = true;
    }
    if (subcategoryHeader && !subcategoryEmitted) {
      result.push(subcategoryHeader);
      subcategoryEmitted = true;
    }
    result.push(block);
  }

  return result;
}
