// "Общие закупки" restores the remembered mode and mirrors changes back into the
// persisted UI state.
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/client/lib/apiClient.js', () => ({
  api: {
    commonPurchases: { list: vi.fn() },
    products: { list: vi.fn() },
  },
}));

vi.mock('../../src/client/hooks/useUiState.js', () => ({ useUiState: vi.fn() }));

import { useUiState } from '../../src/client/hooks/useUiState.js';
import { api } from '../../src/client/lib/apiClient.js';
import CommonPurchasesPage from '../../src/client/pages/CommonPurchasesPage.jsx';

const EMPTY_FILTERS = {
  value: '',
  valueRegex: false,
  valueCaseSensitive: false,
  footprint: '',
  footprintRegex: false,
  footprintCaseSensitive: false,
  qtyOp: '',
  qty: '',
  seller: '',
};

const VIEW = { blocks: [], boardNames: [], totals: { shippingCost: 0, cost: 0 } };

beforeEach(() => {
  vi.clearAllMocks();
  api.commonPurchases.list.mockResolvedValue(VIEW);
  api.products.list.mockResolvedValue([]);
});

describe('CommonPurchasesPage', () => {
  it('restores the remembered mode and persists it', async () => {
    const updateUi = vi.fn();
    useUiState.mockReturnValue([
      { mode: 'by_board', page: 0, size: 20, filters: EMPTY_FILTERS },
      updateUi,
    ]);

    render(<CommonPurchasesPage />);

    await waitFor(() => expect(api.commonPurchases.list).toHaveBeenCalledWith('by_board'));
    expect(updateUi).toHaveBeenCalledWith({ mode: 'by_board' });
  });
});
