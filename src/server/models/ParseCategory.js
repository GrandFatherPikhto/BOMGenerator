// A "categorisation" rule, editable through the UI.
import mongoose from 'mongoose';

export const REF_MODES = ['prefix', 'regex'];
export const NAME_MODES = ['prefix', 'regex'];
export const FOOTPRINT_MODES = ['prefix', 'regex', 'contains'];
export const SORT_SPECS = ['value_desc', 'value_asc', 'name'];

const subcategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    footprintContains: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const parseCategorySchema = new mongoose.Schema(
  {
    // Ascending order of the check; the first match wins.
    order: { type: Number, default: 0 },
    name: { type: String, required: true, trim: true },
    refMode: { type: String, enum: REF_MODES, default: 'prefix' },
    refPatterns: { type: [String], default: [] },
    nameMode: { type: String, enum: NAME_MODES, default: 'prefix' },
    namePatterns: { type: [String], default: [] },
    footprintMode: { type: String, enum: FOOTPRINT_MODES, default: 'prefix' },
    footprintPatterns: { type: [String], default: [] },
    // Whether the Reference/Value/Footprint comparisons are case-sensitive.
    caseSensitive: { type: Boolean, default: false },
    // When empty, Settings.defaultSort is used.
    sort: { type: String, enum: SORT_SPECS, default: null },
    subcategories: { type: [subcategorySchema], default: [] },
  },
  { timestamps: true },
);

export const ParseCategory = mongoose.model('ParseCategory', parseCategorySchema);
