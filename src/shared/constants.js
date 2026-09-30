// Shared, dependency-free enumerations used by the server, the models and the
// client. Keeping them in one place stops the enums declared in the Mongoose
// schemas from drifting away from the validation performed by the services.

/** Sort specifications accepted by `ParseCategory.sort` and `Settings.defaultSort`. */
export const SORT_SPECS = ['value_desc', 'value_asc', 'name'];

/** Page widths accepted by `Settings.pageWidth`. */
export const PAGE_WIDTHS = ['normal', 'wide', 'full'];

/** Presentation modes of the "Common purchases" screen. */
export const COMMON_MODES = ['merged', 'by_board'];

/** Modes of the `Reference` / `Value` conditions of a categorisation rule. */
export const REF_MODES = ['prefix', 'regex'];
export const NAME_MODES = ['prefix', 'regex'];

/** Modes of the `Footprint` condition (adds `contains`). */
export const FOOTPRINT_MODES = ['prefix', 'regex', 'contains'];

/**
 * Columns available in the product picker dialog (the "Таблица" button next to
 * the product field). The `name` column is always shown; the rest can be
 * toggled and the choice is persisted per user.
 */
export const PRODUCT_PICKER_COLUMNS = [
  'shop',
  'name',
  'url',
  'packQty',
  'packPrice',
  'shipping',
  'category',
  'footprint',
  'description',
  'total',
];

/** Product-picker columns shown by default (a subset of `PRODUCT_PICKER_COLUMNS`). */
export const PRODUCT_PICKER_DEFAULT_COLUMNS = [
  'shop',
  'name',
  'packQty',
  'packPrice',
  'shipping',
  'footprint',
  'description',
  'total',
];
