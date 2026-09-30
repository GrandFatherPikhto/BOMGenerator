// "Общие закупки" restores the remembered mode and mirrors changes back into the
// persisted UI state; a footprint-grouped row edits every position at once.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/client/lib/apiClient.js', () => ({
  api: {
    commonPurchases: { list: vi.fn(), setOverride: vi.fn(), setOverrideBulk: vi.fn() },
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

  it('shows a grouped row with its names and edits every position at once', async () => {
    const groupRow = {
      matchKey: 'mr0',
      matchKeys: ['mk1', 'mk2'],
      grouped: true,
      footprint: 'Resistor_SMD:R_0603',
      names: ['10K', '100R'],
      value: '10K',
      totalQty: 5,
      byBoard: undefined,
      productId: null,
      sellerId: null,
      notPurchased: false,
      shippingCost: null,
      shippingOverride: null,
      packsOverride: null,
      packs: null,
      cost: null,
    };
    api.commonPurchases.list.mockResolvedValue({
      blocks: [{ kind: 'line', line: groupRow }],
      boardNames: [],
      totals: { shippingCost: 0, cost: 0 },
    });
    useUiState.mockReturnValue([
      { mode: 'merged', page: 0, size: 20, filters: EMPTY_FILTERS },
      vi.fn(),
    ]);

    render(<CommonPurchasesPage />);

    expect(await screen.findByText('Группа по посадочному месту')).toBeInTheDocument();

    // The names behind the grouped row are revealed by the expander.
    await userEvent.click(
      screen.getByRole('button', { name: 'Показать обозначения' }),
    );
    expect(screen.getByText('10K, 100R')).toBeInTheDocument();

    // One edit is written to every position of the footprint.
    await userEvent.click(screen.getByRole('checkbox', { name: '' }));
    await waitFor(() =>
      expect(api.commonPurchases.setOverrideBulk).toHaveBeenCalledWith(
        ['mk1', 'mk2'],
        { notPurchased: true },
      ),
    );
  });
});
