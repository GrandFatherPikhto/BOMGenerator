// Unit tests for the shared purchase calculations (packs / shipping / cost).
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeOverride,
  resolvePurchaseTotals,
} from '../../src/shared/index.js';

const product = { packQty: 100, packPrice: 50, shippingCost: 5 };

test('normalizeOverride treats empty values as "no override"', () => {
  assert.equal(normalizeOverride(null), null);
  assert.equal(normalizeOverride(undefined), null);
  assert.equal(normalizeOverride(''), null);
});

test('normalizeOverride keeps zero and coerces numeric strings', () => {
  assert.equal(normalizeOverride(0), 0);
  assert.equal(normalizeOverride('0'), 0);
  assert.equal(normalizeOverride('5'), 5);
});

test('normalizeOverride rejects non-numeric text', () => {
  assert.equal(normalizeOverride('abc'), null);
});

test('no product means no packs, shipping or cost', () => {
  const result = resolvePurchaseTotals({ qty: 250, product: null });
  assert.deepEqual(result, { packs: null, shippingCost: null, cost: null });
});

test('the product drives the automatic pack count, delivery and cost', () => {
  const result = resolvePurchaseTotals({ qty: 250, product });
  assert.equal(result.packs, 3); // ceil(250 / 100)
  assert.equal(result.shippingCost, 5);
  assert.equal(result.cost, 155); // 3 * 50 + 5
});

test('a packs override wins and is used for the cost', () => {
  const result = resolvePurchaseTotals({ qty: 250, product, packsOverride: 1 });
  assert.equal(result.packs, 1);
  assert.equal(result.cost, 55); // 1 * 50 + 5
});

test('a packs override of zero is kept', () => {
  const result = resolvePurchaseTotals({ qty: 250, product, packsOverride: 0 });
  assert.equal(result.packs, 0);
  assert.equal(result.cost, 5); // 0 * 50 + 5
});

test('a shipping override wins over the product delivery cost', () => {
  const result = resolvePurchaseTotals({ qty: 100, product, shippingOverride: 9 });
  assert.equal(result.shippingCost, 9);
  assert.equal(result.cost, 59); // 1 * 50 + 9
});

test('a shipping override of zero is kept', () => {
  const result = resolvePurchaseTotals({ qty: 100, product, shippingOverride: 0 });
  assert.equal(result.shippingCost, 0);
  assert.equal(result.cost, 50);
});

test('an empty override falls back to the product', () => {
  const result = resolvePurchaseTotals({
    qty: 100,
    product,
    packsOverride: '',
    shippingOverride: null,
  });
  assert.equal(result.packs, 1);
  assert.equal(result.shippingCost, 5);
});

test('string overrides from the "Все" view are coerced', () => {
  const result = resolvePurchaseTotals({
    qty: 100,
    product,
    packsOverride: '4',
    shippingOverride: '7',
  });
  assert.equal(result.packs, 4);
  assert.equal(result.shippingCost, 7);
  assert.equal(result.cost, 207); // 4 * 50 + 7
});

test('a product without a delivery cost falls back to zero', () => {
  const result = resolvePurchaseTotals({
    qty: 100,
    product: { packQty: 10, packPrice: 3 },
  });
  assert.equal(result.shippingCost, 0);
  assert.equal(result.cost, 30); // 10 * 3 + 0
});

test('a packQty of zero is treated as one', () => {
  const result = resolvePurchaseTotals({
    qty: 3,
    product: { packQty: 0, packPrice: 2, shippingCost: 0 },
  });
  assert.equal(result.packs, 3);
  assert.equal(result.cost, 6);
});
