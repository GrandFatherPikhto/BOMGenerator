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
  compileTextMatch,
  compileLineFilter,
  filterBlocks,
} from './lineFilter.js';
