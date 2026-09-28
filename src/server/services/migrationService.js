// One-off (idempotent) migration: split the old `Seller` (which carried the
// package quantity and price) into a `Seller` plus its first `SellerProduct`,
// and repoint the BOM lines and common-purchase overrides from `sellerId` to
// `productId`.
//
// A single bad run of this migration was once able to rewrite `productId` on the
// whole collection, so the bulk work now goes through the raw driver collection
// (no Mongoose casting/strictness) behind explicit guards:
//  - the whole migration is skipped when nothing carries the legacy `sellerId`;
//  - a seller without an `_id` is never used as a filter;
//  - an update that would touch more documents than there are legacy documents
//    aborts the run instead of continuing.
import { BomLine } from '../models/BomLine.js';
import { CommonPurchaseOverride } from '../models/CommonPurchaseOverride.js';
import { Seller } from '../models/Seller.js';
import { SellerProduct } from '../models/SellerProduct.js';

/** How many documents still carry the legacy `sellerId` field. */
async function legacyCount(collection) {
  return collection.countDocuments({ sellerId: { $exists: true, $ne: null } });
}

export async function migrateSellersToProducts({ dryRun = false } = {}) {
  const sellers = await Seller.find().lean();
  const result = {
    sellers: sellers.length,
    productsCreated: 0,
    linesUpdated: 0,
    overridesUpdated: 0,
    skipped: false,
    dryRun,
  };

  const legacyLines = await legacyCount(BomLine.collection);
  const legacyOverrides = await legacyCount(CommonPurchaseOverride.collection);
  const legacySellers = await Seller.collection.countDocuments({
    $or: [
      { packQty: { $exists: true } },
      { packPrice: { $exists: true } },
      { shippingCost: { $exists: true, $ne: null } },
      { category: { $exists: true } },
      { footprint: { $exists: true } },
    ],
  });
  result.legacy = {
    sellers: legacySellers,
    lines: legacyLines,
    overrides: legacyOverrides,
  };
  if (legacyLines === 0 && legacyOverrides === 0 && legacySellers === 0) {
    // Nothing to migrate: never walk the collections just to find nothing.
    result.skipped = true;
    return result;
  }

  for (const seller of sellers) {
    if (!seller?._id) {
      // A missing id would turn the filter below into "match everything".
      continue;
    }

    // The delivery cost used to live on the seller; it belongs to a product.
    const legacyShipping = seller.shippingCost ?? null;
    // One product per migrated seller; found by name so a re-run is a no-op.
    let product = await SellerProduct.findOne({
      sellerId: seller._id,
      name: seller.name,
    });
    if (!product) {
      if (dryRun) {
        result.productsCreated += 1;
        continue;
      }
      product = await SellerProduct.create({
        sellerId: seller._id,
        name: seller.name,
        url: seller.url ?? '',
        packQty: seller.packQty ?? 1,
        packPrice: seller.packPrice ?? 0,
        shippingCost: legacyShipping ?? 0,
        category: seller.category ?? '',
        description: seller.description ?? '',
        footprint: seller.footprint ?? '',
      });
      result.productsCreated += 1;
    } else if (legacyShipping && !product.shippingCost && !dryRun) {
      // An earlier run already created the product; carry the value over.
      await SellerProduct.updateOne(
        { _id: product._id },
        { $set: { shippingCost: legacyShipping } },
      );
      product.shippingCost = legacyShipping;
    }

    if (dryRun) {
      continue;
    }

    // `sellerId` is not part of the current schemas anymore, hence the raw
    // collection: strict mode would silently drop the `$unset`.
    const lines = await BomLine.collection.updateMany(
      { sellerId: seller._id },
      { $set: { productId: product._id, updatedAt: new Date() }, $unset: { sellerId: '' } },
    );
    if (lines.matchedCount > legacyLines) {
      throw new Error(
        `migrateSellersToProducts: the update for seller ${seller._id} matched ` +
          `${lines.matchedCount} lines but only ${legacyLines} carry a legacy sellerId — aborting`,
      );
    }
    result.linesUpdated += lines.modifiedCount ?? 0;

    const overrides = await CommonPurchaseOverride.collection.updateMany(
      { sellerId: seller._id },
      { $set: { productId: product._id, updatedAt: new Date() }, $unset: { sellerId: '' } },
    );
    if (overrides.matchedCount > legacyOverrides) {
      throw new Error(
        `migrateSellersToProducts: the update for seller ${seller._id} matched ` +
          `${overrides.matchedCount} overrides but only ${legacyOverrides} carry a legacy sellerId — aborting`,
      );
    }
    result.overridesUpdated += overrides.modifiedCount ?? 0;

    // The packaging, the delivery cost and the category hint now live on the
    // product; drop the stale copies from the seller so the documents stay clean.
    const stale = { packQty: '', packPrice: '', category: '', footprint: '' };
    if (!legacyShipping || product.shippingCost) {
      // Never drop a delivery cost that has not been stored anywhere else: if
      // the product could not take it, the seller keeps it for the next run.
      stale.shippingCost = '';
    }
    await Seller.collection.updateOne({ _id: seller._id }, { $unset: stale });
  }

  return result;
}
