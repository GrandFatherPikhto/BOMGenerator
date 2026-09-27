// CRUD for sellers plus cleanup of references on delete.
import { conflict, notFound } from '../lib/httpError.js';
import { BomLine } from '../models/BomLine.js';
import { CommonPurchaseOverride } from '../models/CommonPurchaseOverride.js';
import { Seller } from '../models/Seller.js';

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeInput(payload = {}, { partial = false } = {}) {
  const data = {};
  if (!partial || payload.name !== undefined) {
    data.name = String(payload.name ?? '').trim();
  }
  if (!partial || payload.category !== undefined) {
    data.category = String(payload.category ?? '');
  }
  if (!partial || payload.footprint !== undefined) {
    data.footprint = String(payload.footprint ?? '');
  }
  if (!partial || payload.url !== undefined) {
    data.url = String(payload.url ?? '');
  }
  if (!partial || payload.description !== undefined) {
    data.description = String(payload.description ?? '');
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
  if (errors.length > 0) {
    const error = new Error(errors.join('; '));
    error.status = 400;
    error.details = errors;
    throw error;
  }
}

function rethrowDuplicate(error) {
  if (error?.code === 11000) {
    throw conflict('A seller with this name already exists');
  }
  throw error;
}

export async function listSellers() {
  return Seller.find().sort({ name: 1 }).lean();
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

export async function deleteSeller(id) {
  const doc = await Seller.findByIdAndDelete(id);
  if (!doc) {
    throw notFound('Seller not found');
  }
  // Keep boards consistent: the removed seller simply clears the selection.
  await BomLine.updateMany({ sellerId: id }, { $set: { sellerId: null } });
  await CommonPurchaseOverride.updateMany(
    { sellerId: id },
    { $set: { sellerId: null } },
  );
  return doc;
}
