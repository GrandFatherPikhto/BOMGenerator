// "Продавцы/Товары" restores the remembered shop and mirrors changes back into
// the persisted UI state.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/client/lib/apiClient.js', () => ({
  api: {
    sellers: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), import: vi.fn() },
    products: { list: vi.fn(), categories: vi.fn(), update: vi.fn(), remove: vi.fn() },
  },
}));

vi.mock('../../src/client/hooks/useUiState.js', () => ({ useUiState: vi.fn() }));

import { useUiState } from '../../src/client/hooks/useUiState.js';
import { api } from '../../src/client/lib/apiClient.js';
import SellersPage from '../../src/client/pages/SellersPage.jsx';

const DEFAULTS = {
  selectedSellerId: 's1',
  mode: 'all',
  page: 0,
  pageSize: 20,
  filters: { name: '', nameRegex: false, category: '', categoryRegex: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  api.sellers.list.mockResolvedValue([{ _id: 's1', name: 'Shop A', productCount: 1 }]);
  api.products.list.mockResolvedValue([{ id: 'p1', sellerId: 's1', name: 'P1' }]);
  api.products.categories.mockResolvedValue([]);
});

describe('SellersPage', () => {
  it('selects the remembered shop and persists the restored mode', async () => {
    const updateUi = vi.fn();
    useUiState.mockReturnValue([DEFAULTS, updateUi]);

    render(<SellersPage />);

    const item = await screen.findByRole('button', { name: /Shop A/ });
    expect(item).toHaveClass('Mui-selected');
    expect(updateUi).toHaveBeenCalledWith({ mode: 'all' });
  });

  it('persists a filter change', async () => {
    const updateUi = vi.fn();
    useUiState.mockReturnValue([DEFAULTS, updateUi]);

    render(<SellersPage />);
    const input = await screen.findByLabelText('Название');
    fireEvent.change(input, { target: { value: 'abc' } });

    await waitFor(() =>
      expect(updateUi).toHaveBeenCalledWith({
        filters: { name: 'abc', nameRegex: false, category: '', categoryRegex: false },
      }),
    );
  });
});
