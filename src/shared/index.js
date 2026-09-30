// Public surface of the shared, dependency-free domain module. It is imported
// both by the Express server and by the test suite.
export {
  SI_PREFIXES,
  BASE_UNITS,
  RKM_ROOT_MULTIPLIERS,
  collapseWhitespace,
  resolveUnit,
  parseValue,
  formatMagnitude,
  buildValueKey,
  normalizeMatchText,
  normalizeFootprint,
  parseQty,
  buildNominalToken,
  buildMatchKey,
  chooseDisplay,
} from './value.js';

export { extractRefPrefix, resolveCategory, validateCategory } from './categories.js';

export { sortGroups } from './sorting.js';

export {
  escapeRegExp,
  compileTextFilter,
  compileProductFilter,
  scopeProducts,
} from './textFilter.js';

export {
  QTY_OPERATORS,
  ROW_MODES,
  compileTextMatch,
  compileLineFilter,
  filterBlocks,
  activeSellerId,
} from './lineFilter.js';

export { normalizeOverride, resolvePurchaseTotals } from './purchase.js';

export {
  SORT_SPECS,
  PAGE_WIDTHS,
  COMMON_MODES,
  REF_MODES,
  NAME_MODES,
  FOOTPRINT_MODES,
  PRODUCT_PICKER_COLUMNS,
  PRODUCT_PICKER_DEFAULT_COLUMNS,
} from './constants.js';

export {
  UI_STATE_VERSION,
  UI_STATE_SECTIONS,
  normalizeSections,
  normalizeUiState,
  deepMerge,
  mergeSections,
  readSection,
} from './uiState.js';
