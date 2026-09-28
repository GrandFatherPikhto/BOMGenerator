// CRUD for sellers (shops). Products live in their own collection/service.
import { conflict, notFound } from '../lib/httpError.js';
import { throwIfErrors } from '../lib/validation.js';
import { BomLine } from '../models/BomLine.js';
import { CommonPurchaseOverride } from '../models/CommonPurchaseOverride.js';
import { Seller } from '../models/Seller.js';
import { SellerProduct } from '../models/SellerProduct.js';

function normalizeInput(payload = {}, { partial = false } = {}) {
  const data = {};
  if (!partial || payload.name !== undefined) {
    data.name = String(payload.name ?? '').trim();
  }
  if (!partial || payload.url !== undefined) {
    data.url = String(payload.url ?? '');
  }
  if (!partial || payload.description !== undefined) {
    data.description = String(payload.description ?? '');
  }
  return data;
}

function assertInput(data) {
  const errors = [];
  if (data.name !== undefined && !data.name) {
    errors.push('name is required');
  }
  throwIfErrors(errors);
}

function rethrowDuplicate(error) {
  if (error?.code === 11000) {
    throw conflict('A seller with this name already exists');
  }
  throw error;
}

/** Sellers with a product count (for the master list). */
export async function listSellers() {
  const sellers = await Seller.find().sort({ name: 1 }).lean();
  const counts = await SellerProduct.aggregate([
    { $group: { _id: '$sellerId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((item) => [String(item._id), item.count]));
  return sellers.map((seller) => ({
    ...seller,
    productCount: countMap.get(String(seller._id)) ?? 0,
  }));
}

export async function getSeller(id) {
  const seller = await Seller.findById(id).lean();
  if (!seller) {
    throw notFound('Seller not found');
  }
  return seller;
}

export async function createSeller(payload) {
  const data = normalizeInput(payload);
  assertInput(data);
  const doc = new Seller(data);
  try {
    await doc.save();
  } catch (error) {
    rethrowDuplicate(error);
  }
  return doc;
}

export async function updateSeller(id, payload) {
  const doc = await Seller.findById(id);
  if (!doc) {
    throw notFound('Seller not found');
  }
  const data = normalizeInput(payload, { partial: true });
  assertInput(data);
  Object.assign(doc, data);
  try {
    await doc.save();
  } catch (error) {
    rethrowDuplicate(error);
  }
  return doc;
}

/** Delete a seller and its products; clear the references in lines/overrides. */
export async function deleteSeller(id) {
  const doc = await Seller.findByIdAndDelete(id);
  if (!doc) {
    throw notFound('Seller not found');
  }
  const products = await SellerProduct.find({ sellerId: id }).select('_id').lean();
  const productIds = products.map((product) => product._id);
  if (productIds.length > 0) {
    await BomLine.updateMany({ productId: { $in: productIds } }, { $set: { productId: null } });
    await CommonPurchaseOverride.updateMany(
      { productId: { $in: productIds } },
      { $set: { productId: null } },
    );
    await SellerProduct.deleteMany({ sellerId: id });
  }
  return doc;
}
