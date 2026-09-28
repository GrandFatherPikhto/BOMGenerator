import { useCallback, useMemo } from 'react';

import { readSection } from '../../shared/index.js';
import { useUiStateContext } from '../UiStateContext.jsx';

/**
 * Read and update one section of the persisted UI state ("what the user was
 * working with"). The stored slice is merged over `defaults`, so a field that
 * has never been saved falls back to the caller's default.
 *
 * `update(patch)` merges the patch into the section and schedules the
 * debounced persist. Keep `defaults` a module-level constant: it is part of the
 * memo dependencies.
 */
export function useUiState(section, defaults = {}) {
  const { uiState, updateUiState } = useUiStateContext();

  const state = useMemo(
    () => readSection(uiState?.sections, section, defaults),
    [uiState, section, defaults],
  );

  const update = useCallback(
    (patch) => updateUiState({ [section]: patch }),
    [section, updateUiState],
  );

  return [state, update];
}
