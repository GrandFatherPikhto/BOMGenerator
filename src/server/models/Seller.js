// A seller (shop). Its products are stored in `SellerProduct` (1:N).
import mongoose from 'mongoose';

const sellerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    // Page of the shop; may be empty.
    url: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

export const Seller = mongoose.model('Seller', sellerSchema);
