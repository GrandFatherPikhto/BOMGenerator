// A seller (supplier) and the packaging/cost data used for calculations.
import mongoose from 'mongoose';

const sellerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    category: { type: String, default: '' }, // informational
    // Informational mask such as "Capacitor_SMD:C_0402_*"; not used for
    // automatic filtering.
    footprint: { type: String, default: '' },
    url: { type: String, default: '' },
    packQty: { type: Number, default: 1, min: 1 },
    packPrice: { type: Number, default: 0, min: 0 },
    // Historical shipping cost (informational); row shipping is entered by hand.
    shippingCost: { type: Number, default: 0, min: 0 },
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

export const Seller = mongoose.model('Seller', sellerSchema);
