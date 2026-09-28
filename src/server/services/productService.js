// CRUD for seller products (offers). A product carries the packaging data used
// for the purchase calculations; the seller is derived from it.
import { notFound } from '../lib/httpError.js';
import { throwIfErrors, toNumber } from '../lib/validation.js';
import { BomLine } from '../models/BomLine.js';
import { CommonPurchaseOverride } from '../models/CommonPurchaseOverride.js';
import { Seller } from '../models/Seller.js';
import { SellerProduct } from '../models/SellerProduct.js';
import { listRuntimeCategories } from './categoryService.js';
import { getSettings } from './settingsService.js';

function normalizeInput(payload = {}, { partial = false } = {}) {
  const data = {};
  if (!partial || payload.name !== undefined) {
    data.name = String(payload.name ?? '').trim();
  }
  if (!partial || payload.url !== undefined) {
    data.url = String(payload.url ?? '');
  }
  if (!partial || payload.packQty !== undefined) {
    data.packQty = toNumber(payload.packQty, 1);
  }
  if (!partial || payload.packPrice !== undefined) {
    data.packPrice = toNumber(payload.packPrice, 0);
  }
  if (!partial || payload.shippingCost !== undefined) {
    data.shippingCost = toNumber(payload.shippingCost, 0);
  }
  if (!partial || payload.category !== undefined) {
    data.category = String(payload.category ?? '');
  }
  if (!partial || payload.description !== undefined) {
    data.description = String(payload.description ?? '');
  }
  if (!partial || payload.footprint !== undefined) {
    data.footprint = String(payload.footprint ?? '');
  }
  return data;
}

function assertInput(data) {
  const errors = [];
  if (data.name !== undefined && !data.name) {
    errors.push('name is required');
  }
  if (data.packQty !== undefined && data.packQty < 1) {
    errors.push('packQty must be >= 1');
  }
  if (data.packPrice !== undefined && data.packPrice < 0) {
    errors.push('packPrice must be >= 0');
  }
  if (data.shippingCost !== undefined && data.shippingCost < 0) {
    errors.push('shippingCost must be >= 0');
  }
  throwIfErrors(errors);
}

/** Flatten a product with its seller data (used by the client dropdowns). */
export function serializeProduct(product, seller) {
  return {
    id: String(product._id),
    sellerId: String(product.sellerId),
    sellerName: seller?.name ?? '',
    sellerUrl: seller?.url ?? '',
    name: product.name,
    url: product.url ?? '',
    packQty: product.packQty ?? 1,
    packPrice: product.packPrice ?? 0,
    shippingCost: product.shippingCost ?? 0,
    category: product.category ?? '',
    description: product.description ?? '',
    footprint: product.footprint ?? '',
  };
}

/**
 * Category names offered by the product form: every category already typed on a
 * product, plus the names of the categorisation rules ("Категории разбора") and
 * the default category — a product category is a hint for those rules, so the
 * two lists belong together. Free typing stays possible in the UI.
 *
 * The list is de-duplicated case-insensitively (the import may spell a category
 * differently from a rule); a rule name is treated as the canonical spelling.
 */
export async function listProductCategories() {
  const [typed, runtime, settings] = await Promise.all([
    SellerProduct.distinct('category'),
    listRuntimeCategories(),
    getSettings(),
  ]);

  const names = new Map(); // lower-case key -> displayed name
  const addTyped = (value) => {
    const name = String(value ?? '').trim();
    if (name && !names.has(name.toLowerCase())) {
      names.set(name.toLowerCase(), name);
    }
  };
  const addCanonical = (value) => {
    const name = String(value ?? '').trim();
    if (name) {
      names.set(name.toLowerCase(), name);
    }
  };

  typed.forEach(addTyped);
  runtime.forEach((category) => addCanonical(category.name));
  addCanonical(settings?.defaultCategoryName);

  return [...names.values()].sort((left, right) => left.localeCompare(right, 'ru'));
}

/** All products (optionally of one seller), with the seller name/url attached. */
export async function listProducts({ sellerId } = {}) {
  const filter = sellerId ? { sellerId } : {};
  const [products, sellers] = await Promise.all([
    SellerProduct.find(filter).sort({ name: 1 }).lean(),
    Seller.find().lean(),
  ]);
  const sellerMap = new Map(sellers.map((seller) => [String(seller._id), seller]));
  return products.map((product) =>
    serializeProduct(product, sellerMap.get(String(product.sellerId))),
  );
}

export async function createProduct(sellerId, payload) {
  const seller = await Seller.findById(sellerId);
  if (!seller) {
    throw notFound('Seller not found');
  }
  const data = normalizeInput(payload);
  assertInput(data);
  const product = await SellerProduct.create({ sellerId: seller._id, ...data });
  return serializeProduct(product, seller);
}

export async function updateProduct(id, payload) {
  const product = await SellerProduct.findById(id);
  if (!product) {
    throw notFound('Product not found');
  }
  const data = normalizeInput(payload, { partial: true });
  assertInput(data);
  Object.assign(product, data);
  await product.save();
  const seller = await Seller.findById(product.sellerId).lean();
  return serializeProduct(product, seller);
}

export async function deleteProduct(id) {
  const product = await SellerProduct.findByIdAndDelete(id);
  if (!product) {
    throw notFound('Product not found');
  }
  await BomLine.updateMany({ productId: product._id }, { $set: { productId: null } });
  await CommonPurchaseOverride.updateMany(
    { productId: product._id },
    { $set: { productId: null } },
  );
  return product;
}
