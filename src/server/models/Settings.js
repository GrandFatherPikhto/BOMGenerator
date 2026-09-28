// Singleton settings document.
import mongoose from 'mongoose';

import { PAGE_WIDTHS, SORT_SPECS } from '../../shared/constants.js';

const settingsSchema = new mongoose.Schema(
  {
    defaultCategoryName: { type: String, default: '\u041f\u0440\u043e\u0447\u0435\u0435' },
    defaultSort: {
      type: String,
      enum: SORT_SPECS,
      default: 'name',
    },
    // Page width of the whole UI: 1536 px / 1920 px / full.
    pageWidth: {
      type: String,
      enum: PAGE_WIDTHS,
      default: 'normal',
    },
    subcategoryOtherLabel: {
      type: String,
      default: '(\u0431\u0435\u0437 \u043f\u043e\u0434\u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438)',
    },
    excludeDnpByDefault: { type: Boolean, default: true },
    excludeFromBomByDefault: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** Return the single settings document, creating it on first access. */
settingsSchema.statics.getSingleton = async function getSingleton() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

export const Settings = mongoose.model('Settings', settingsSchema);
