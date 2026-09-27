// Hand-filled seller/shipping values of the "Common purchases" sheet.
//
// The sheet itself is virtual: rows are aggregated from every board on each
// request. Only the manual overrides are persisted, keyed by `matchKey` and
// independent of the boards, so they survive a re-import or a changed board set.
import mongoose from 'mongoose';

const commonPurchaseOverrideSchema = new mongoose.Schema(
  {
    matchKey: { type: String, required: true, unique: true },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      default: null,
    },
    shippingCost: { type: Number, default: null },
  },
  { timestamps: true },
);

export const CommonPurchaseOverride = mongoose.model(
  'CommonPurchaseOverride',
  commonPurchaseOverrideSchema,
);
