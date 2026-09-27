// One-off (idempotent) migration: split the old `Seller` (which carried the
// package quantity and price) into a `Seller` plus its first `SellerProduct`,
// and repoint the BOM lines and common-purchase overrides from `sellerId` to
// `productId`.
import { BomLine } from '../models/BomLine.js';
import { CommonPurchaseOverride } from '../models/CommonPurchaseOverride.js';
import { Seller } from '../models/Seller.js';
import { SellerProduct } from '../models/SellerProduct.js';

export async function migrateSellersToProducts() {
  const sellers = await Seller.find().lean();
  let productsCreated = 0;
  let linesUpdated = 0;
  let overridesUpdated = 0;

  for (const seller of sellers) {
    // The delivery cost used to live on the seller; it belongs to a product.
    const legacyShipping = seller.shippingCost ?? null;
    // One product per migrated seller; found by name so a re-run is a no-op.
    let product = await SellerProduct.findOne({
      sellerId: seller._id,
      name: seller.name,
    });
    if (!product) {
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
      productsCreated += 1;
    } else if (legacyShipping && !product.shippingCost) {
      // An earlier run already created the product; carry the value over.
      await SellerProduct.updateOne(
        { _id: product._id },
        { $set: { shippingCost: legacyShipping } },
      );
      product.shippingCost = legacyShipping;
    }

    // `strict: false` is required: the legacy `sellerId` path is no longer part
    // of the schema, so strict mode would silently drop the `$unset` and leave
    // the stale field behind.
    const lines = await BomLine.updateMany(
      { sellerId: seller._id },
      { $set: { productId: product._id }, $unset: { sellerId: '' } },
      { strict: false },
    );
    linesUpdated += lines.modifiedCount ?? 0;

    const overrides = await CommonPurchaseOverride.updateMany(
      { sellerId: seller._id },
      { $set: { productId: product._id }, $unset: { sellerId: '' } },
      { strict: false },
    );
    overridesUpdated += overrides.modifiedCount ?? 0;

    // The packaging, the delivery cost and the category hint now live on the
    // product; drop the stale copies from the seller so the documents stay clean.
    await Seller.updateOne(
      { _id: seller._id },
      {
        $unset: {
          packQty: '',
          packPrice: '',
          shippingCost: '',
          category: '',
          footprint: '',
        },
      },
      { strict: false },
    );
  }

  return {
    sellers: sellers.length,
    productsCreated,
    linesUpdated,
    overridesUpdated,
  };
}
