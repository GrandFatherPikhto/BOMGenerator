// The persisted UI-state context: initial load, optimistic merge, debounced
// write, manual flush and graceful degradation when the API fails.
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/client/lib/apiClient.js', () => ({
  api: {
    uiState: {
      get: vi.fn(),
      merge: vi.fn(),
    },
  },
}));

import { UiStateProvider, useUiStateContext } from '../../src/client/UiStateContext.jsx';
import { api } from '../../src/client/lib/apiClient.js';

function wrapper({ children }) {
  return <UiStateProvider debounceMs={25}>{children}</UiStateProvider>;
}

/** Render the hook and wait until the provider has performed its first load. */
async function renderUiState() {
  const view = renderHook(() => useUiStateContext(), { wrapper });
  await waitFor(() => expect(view.result.current?.uiState).toBeTruthy());
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.uiState.get.mockResolvedValue({ version: 1, sections: {} });
  api.uiState.merge.mockResolvedValue({ version: 1, sections: {} });
});

describe('UiStateProvider', () => {
  it('exposes the stored sections after the first load', async () => {
    api.uiState.get.mockResolvedValue({
      version: 1,
      sections: { sellers: { mode: 'all', page: 2 } },
    });
    const { result } = await renderUiState();
    expect(result.current.uiState.sections.sellers).toEqual({ mode: 'all', page: 2 });
  });

  it('applies an update optimistically and sends it once after the debounce', async () => {
    const { result } = await renderUiState();

    act(() => {
      result.current.updateUiState({ purchases: { boardId: 'b1' } });
      result.current.updateUiState({ purchases: { page: 2 } });
    });

    expect(result.current.uiState.sections.purchases).toEqual({ boardId: 'b1', page: 2 });
    expect(api.uiState.merge).not.toHaveBeenCalled();

    await waitFor(() => expect(api.uiState.merge).toHaveBeenCalledTimes(1));
    expect(api.uiState.merge).toHaveBeenCalledWith({
      purchases: { boardId: 'b1', page: 2 },
    });
  });

  it('keeps the other sections untouched', async () => {
    api.uiState.get.mockResolvedValue({
      version: 1,
      sections: { sellers: { mode: 'all' } },
    });
    const { result } = await renderUiState();

    act(() => {
      result.current.updateUiState({ purchases: { boardId: 'b1' } });
    });

    expect(result.current.uiState.sections.sellers).toEqual({ mode: 'all' });
    await waitFor(() =>
      expect(api.uiState.merge).toHaveBeenCalledWith({ purchases: { boardId: 'b1' } }),
    );
  });

  it('flushUiState sends the pending patch immediately', async () => {
    const { result } = await renderUiState();

    act(() => {
      result.current.updateUiState({ common: { mode: 'by_board' } });
      result.current.flushUiState();
    });

    expect(api.uiState.merge).toHaveBeenCalledTimes(1);
    expect(api.uiState.merge).toHaveBeenCalledWith({ common: { mode: 'by_board' } });
  });

  it('falls back to an empty state when loading fails', async () => {
    api.uiState.get.mockRejectedValue(new Error('offline'));
    const { result } = await renderUiState();
    expect(result.current.uiState.sections).toEqual({});
  });

  it('keeps the optimistic state when the merge request fails', async () => {
    api.uiState.merge.mockRejectedValue(new Error('offline'));
    const { result } = await renderUiState();

    act(() => {
      result.current.updateUiState({ boards: { lastOpenBoardId: 'b1' } });
    });

    await waitFor(() => expect(api.uiState.merge).toHaveBeenCalled());
    expect(result.current.uiState.sections.boards).toEqual({ lastOpenBoardId: 'b1' });
  });
});
