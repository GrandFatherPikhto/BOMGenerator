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
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      default: null,
    },
    common: { type: Boolean, default: false },
    // Shipping is entered by hand and is not tied to the seller.
    shippingCost: { type: Number, default: null },
    // Free-text note per position; hand-filled and kept across re-imports.
    description: { type: String, default: '' },
    // True for rows added by hand to the "Докупить" board (no CSV source).
    manual: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// One component row per board; the import merges duplicate match keys first.
bomLineSchema.index({ boardId: 1, matchKey: 1 }, { unique: true });

export const BomLine = mongoose.model('BomLine', bomLineSchema);
