import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { Box, CircularProgress } from '@mui/material';

import { mergeSections, normalizeUiState } from '../shared/index.js';
import { api } from './lib/apiClient.js';

const EMPTY_UI_STATE = normalizeUiState({});

const UiStateContext = createContext({
  uiState: EMPTY_UI_STATE,
  updateUiState: () => {},
  flushUiState: () => {},
});

/**
 * Persisted UI state ("what the user was working with") for the whole app.
 *
 * Loaded once from the server, then updated section by section: an update is
 * merged into the local state immediately (optimistic) and sent with a debounce,
 * so a burst of keystrokes turns into a single `PATCH`. The server deep-merges
 * the same patch, so the response is not needed to converge locally; a pending
 * change is flushed when the tab is hidden or the provider unmounts.
 *
 * Children are rendered only after the first load, so a page can read the stored
 * section during its initial render and restore the previous context.
 */
export function UiStateProvider({ children, debounceMs = 600 }) {
  const [uiState, setUiState] = useState(null);
  const pendingRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api.uiState
      .get()
      .then((data) => {
        if (!cancelled) {
          setUiState(normalizeUiState(data));
        }
      })
      .catch(() => {
        // Storage is only a convenience: without it the app uses the defaults.
        if (!cancelled) {
          setUiState(EMPTY_UI_STATE);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Send the pending sections patch right now (if there is one). */
  const flushUiState = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const patch = pendingRef.current;
    pendingRef.current = null;
    if (patch) {
      api.uiState.merge(patch).catch(() => {});
    }
  }, []);

  const updateUiState = useCallback(
    (patch) => {
      pendingRef.current = mergeSections(pendingRef.current ?? {}, patch);
      setUiState((previous) => {
        const base = previous ?? EMPTY_UI_STATE;
        return { version: base.version, sections: mergeSections(base.sections, patch) };
      });
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(flushUiState, debounceMs);
    },
    [debounceMs, flushUiState],
  );

  // Never lose the last change when the tab goes to the background or the
  // provider is torn down.
  useEffect(() => {
    const flush = () => flushUiState();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [flushUiState]);

  const value = useMemo(
    () => ({ uiState, updateUiState, flushUiState }),
    [uiState, updateUiState, flushUiState],
  );

  if (uiState === null) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return <UiStateContext.Provider value={value}>{children}</UiStateContext.Provider>;
}

export function useUiStateContext() {
  return useContext(UiStateContext);
}
