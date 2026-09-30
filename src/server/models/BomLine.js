// One BOM row of one board.
import mongoose from 'mongoose';

const bomLineSchema = new mongoose.Schema(
  {
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Board',
      required: true,
      index: true,
    },
    reference: { type: String, default: '' }, // as exported by KiCad ("C2,C3")
    qty: { type: Number, default: 0 },
    value: { type: String, default: '' },
    footprint: { type: String, default: '' },
    // Normalised value + footprint; used for re-import matching and for the
    // "Common purchases" grouping (see src/shared/value.js buildMatchKey).
    matchKey: { type: String, required: true },
    // Remaining CSV columns kept verbatim (DNP, Datasheet, ...).
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Hand-filled fields that survive a re-import.
    // Chosen product (offer); the seller is derived from it.
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SellerProduct',
      default: null,
    },
    common: { type: Boolean, default: false },
    // Hand-filled "Не закупается": the position is not bought at all, so it is
    // left out of the totals (and hidden by default in the tables).
    notPurchased: { type: Boolean, default: false },
    // Shipping is entered by hand and is not tied to the seller.
    shippingCost: { type: Number, default: null },
    // Free-text note per position; hand-filled and kept across re-imports.
    description: { type: String, default: '' },
    // Manual override of the package count (empty -> auto ceil of the need).
    packsOverride: { type: Number, default: null, min: 0 },
    // True for rows added by hand to the "Докупить" board (no CSV source).
    manual: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// One component row per board; the import merges duplicate match keys first.
bomLineSchema.index({ boardId: 1, matchKey: 1 }, { unique: true });

export const BomLine = mongoose.model('BomLine', bomLineSchema);
