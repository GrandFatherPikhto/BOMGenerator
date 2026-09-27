// A seller (shop). Its products are stored in `SellerProduct` (1:N).
import mongoose from 'mongoose';

const sellerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    // Page of the shop; may be empty.
    url: { type: String, default: '' },
    description: { type: String, default: '' },
    // Historical shipping cost (informational); row shipping is entered by hand.
    shippingCost: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

export const Seller = mongoose.model('Seller', sellerSchema);
