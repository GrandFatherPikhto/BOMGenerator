// A product (offer) of a seller. One seller has many products.
import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    // Link to the concrete offer; may be empty.
    url: { type: String, default: '' },
    packQty: { type: Number, default: 1, min: 1 },
    packPrice: { type: Number, default: 0, min: 0 },
    // Informational fields describing the goods.
    category: { type: String, default: '' },
    description: { type: String, default: '' },
    footprint: { type: String, default: '' },
  },
  { timestamps: true },
);

// Not unique: the import deduplicates by url (or by name) in code.
productSchema.index({ sellerId: 1, name: 1 });

export const SellerProduct = mongoose.model('SellerProduct', productSchema);
