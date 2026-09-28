// The section hook: reading a stored slice over the defaults and turning an
// update into a section-scoped context patch.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/client/UiStateContext.jsx', () => ({
  useUiStateContext: vi.fn(),
}));

import { useUiStateContext } from '../../src/client/UiStateContext.jsx';
import { useUiState } from '../../src/client/hooks/useUiState.js';

const DEFAULTS = { mode: 'shop', page: 0, filters: { name: '' } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useUiState', () => {
  it('merges the stored slice over the defaults', () => {
    useUiStateContext.mockReturnValue({
      uiState: { version: 1, sections: { sellers: { mode: 'all', page: 2 } } },
      updateUiState: vi.fn(),
    });

    const { result } = renderHook(() => useUiState('sellers', DEFAULTS));
    expect(result.current[0]).toEqual({
      mode: 'all',
      page: 2,
      filters: { name: '' },
    });
  });

  it('returns the defaults when nothing is stored', () => {
    useUiStateContext.mockReturnValue({
      uiState: { version: 1, sections: {} },
      updateUiState: vi.fn(),
    });

    const { result } = renderHook(() => useUiState('sellers', DEFAULTS));
    expect(result.current[0]).toEqual(DEFAULTS);
  });

  it('wraps an update into a section-scoped patch', () => {
    const updateUiState = vi.fn();
    useUiStateContext.mockReturnValue({
      uiState: { version: 1, sections: {} },
      updateUiState,
    });

    const { result } = renderHook(() => useUiState('purchases', { page: 0 }));
    act(() => result.current[1]({ page: 3 }));

    expect(updateUiState).toHaveBeenCalledWith({ purchases: { page: 3 } });
  });

  it('tolerates a missing state (before the first load)', () => {
    useUiStateContext.mockReturnValue({ uiState: null, updateUiState: vi.fn() });
    const { result } = renderHook(() => useUiState('sellers', DEFAULTS));
    expect(result.current[0]).toEqual(DEFAULTS);
  });
});
