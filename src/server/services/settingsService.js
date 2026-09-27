// Read/update the singleton Settings document.
import { badRequest } from '../lib/httpError.js';
import { Settings } from '../models/Settings.js';

const SORT_SPECS = ['value_desc', 'value_asc', 'name'];

export async function getSettings() {
  return Settings.getSingleton();
}

export async function updateSettings(payload = {}) {
  const settings = await Settings.getSingleton();
  const errors = [];

  if (payload.defaultCategoryName !== undefined) {
    const value = String(payload.defaultCategoryName).trim();
    if (!value) {
      errors.push('defaultCategoryName must not be empty');
    } else {
      settings.defaultCategoryName = value;
    }
  }

  if (payload.defaultSort !== undefined) {
    if (!SORT_SPECS.includes(payload.defaultSort)) {
      errors.push(`defaultSort must be one of ${SORT_SPECS.join(', ')}`);
    } else {
      settings.defaultSort = payload.defaultSort;
    }
  }

  if (payload.subcategoryOtherLabel !== undefined) {
    settings.subcategoryOtherLabel = String(payload.subcategoryOtherLabel);
  }
  if (payload.excludeDnpByDefault !== undefined) {
    settings.excludeDnpByDefault = Boolean(payload.excludeDnpByDefault);
  }
  if (payload.excludeFromBomByDefault !== undefined) {
    settings.excludeFromBomByDefault = Boolean(payload.excludeFromBomByDefault);
  }

  if (errors.length > 0) {
    throw badRequest(errors.join('; '));
  }

  await settings.save();
  return settings;
}
