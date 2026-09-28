// "Закупки" opened without parameters restores the remembered board from the
// persisted UI state instead of falling back to the first one.
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/client/lib/apiClient.js', () => ({
  api: {
    boards: { list: vi.fn(), view: vi.fn(), update: vi.fn() },
    products: { list: vi.fn() },
  },
}));

vi.mock('../../src/client/hooks/useUiState.js', () => ({ useUiState: vi.fn() }));

import { useUiState } from '../../src/client/hooks/useUiState.js';
import { api } from '../../src/client/lib/apiClient.js';
import PurchasesPage from '../../src/client/pages/PurchasesPage.jsx';

const STORED = {
  tab: 'boards',
  boardId: 'b2',
  page: 0,
  size: 20,
  filters: {
    value: '',
    valueRegex: false,
    valueCaseSensitive: false,
    footprint: '',
    footprintRegex: false,
    footprintCaseSensitive: false,
    qtyOp: '',
    qty: '',
  },
  sellerByBoard: { b2: 's1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  api.boards.list.mockResolvedValue([
    { id: 'b1', name: 'Board 1', enabled: true, isService: false, lineCount: 0, count: 1 },
    { id: 'b2', name: 'Board 2', enabled: true, isService: false, lineCount: 0, count: 1 },
  ]);
  api.products.list.mockResolvedValue([]);
  api.boards.view.mockResolvedValue({
    board: { id: 'b2', name: 'Board 2', count: 1 },
    blocks: [],
    totals: { shippingCost: 0, cost: 0 },
  });
});

describe('PurchasesPage', () => {
  it('restores the remembered board when opened without parameters', async () => {
    useUiState.mockReturnValue([STORED, vi.fn()]);

    render(
      <MemoryRouter initialEntries={['/purchases']}>
        <PurchasesPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(api.boards.view).toHaveBeenCalledWith('b2'));
  });
});
