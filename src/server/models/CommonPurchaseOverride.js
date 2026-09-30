// Hand-filled seller/shipping values of the "Common purchases" sheet.
//
// The sheet itself is virtual: rows are aggregated from every board on each
// request. Only the manual overrides are persisted, keyed by `matchKey` and
// independent of the boards, so they survive a re-import or a changed board set.
import mongoose from 'mongoose';

const commonPurchaseOverrideSchema = new mongoose.Schema(
  {
    matchKey: { type: String, required: true, unique: true },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SellerProduct',
      default: null,
    },
    shippingCost: { type: Number, default: null },
    // Manual override of the package count (empty -> auto ceil of the need).
    packsOverride: { type: Number, default: null, min: 0 },
    // "Не закупается": the aggregated position is left out of the totals.
    notPurchased: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const CommonPurchaseOverride = mongoose.model(
  'CommonPurchaseOverride',
  commonPurchaseOverrideSchema,
);
