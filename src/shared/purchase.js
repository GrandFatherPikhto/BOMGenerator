// Pure purchase calculations shared by the board, the "Все" tab and the
// common-purchases sheet. A single implementation stops the money formulas from
// drifting apart across the three views that used to duplicate them.

/**
 * Coerce a hand-entered override into a finite number.
 * An empty value (`null`, `undefined` or `""`) means "no override" -> `null`.
 * `0` is a valid override and is preserved.
 */
export function normalizeOverride(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Resolve the calculated purchase columns of one row.
 *
 * @param {object} input
 * @param {number} input.qty Quantity the automatic pack count is based on
 *   (`totalQty` on a board, the summed need on the common sheet).
 * @param {object|null} input.product The chosen product (offer), or `null`.
 * @param {*} [input.packsOverride] Hand-entered package count, when present.
 * @param {*} [input.shippingOverride] Hand-entered delivery cost, when present.
 * @returns {{packs: number|null, shippingCost: number|null, cost: number|null}}
 */
export function resolvePurchaseTotals({
  qty,
  product,
  packsOverride = null,
  shippingOverride = null,
}) {
  const packsValue = normalizeOverride(packsOverride);
  const packs =
    packsValue ?? (product ? Math.ceil(qty / (product.packQty || 1)) : null);

  // The hand-entered value wins; otherwise the delivery cost of the chosen
  // product applies ("Доставка" lives on the product, not on the seller).
  const shippingValue = normalizeOverride(shippingOverride);
  const shippingCost =
    shippingValue ?? (product ? product.shippingCost ?? 0 : null);

  const cost =
    packs !== null && product
      ? packs * product.packPrice + (shippingCost || 0)
      : null;

  return { packs, shippingCost, cost };
}
