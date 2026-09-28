/**
 * Seller options for the "Продавец" controls (the filter bar and the per-row
 * picker).
 *
 * They are built from the product catalogue rather than only from the rows that
 * already have a product assigned: otherwise the dropdown stays empty until
 * something is chosen, which makes it impossible to pick a seller in the first
 * place. Only shops that actually have at least one product are listed.
 *
 * @param {Array<{sellerId?: string, sellerName?: string}>} products
 * @returns {Array<{id: string, name: string}>} sorted by name
 */
export function sellerOptionsFromProducts(products = []) {
  const map = new Map();
  for (const product of products) {
    const id = product?.sellerId ? String(product.sellerId) : '';
    if (!id || map.has(id)) {
      continue;
    }
    map.set(id, String(product.sellerName ?? ''));
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
