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
