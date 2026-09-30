// "Докупить" offers the Excel/CSV export of its service board.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/client/lib/apiClient.js', () => ({
  api: {
    boards: {
      list: vi.fn(),
      view: vi.fn(),
      updateLine: vi.fn(),
      deleteLine: vi.fn(),
      addLine: vi.fn(),
    },
    products: { list: vi.fn() },
  },
}));

import { api } from '../../src/client/lib/apiClient.js';
import ManualPage from '../../src/client/pages/ManualPage.jsx';

beforeEach(() => {
  vi.clearAllMocks();
  api.boards.list.mockResolvedValue([
    {
      id: 'service',
      name: 'Докупить',
      isService: true,
      enabled: false,
      lineCount: 0,
      count: 1,
    },
  ]);
  api.boards.view.mockResolvedValue({
    board: { id: 'service', name: 'Докупить', count: 1 },
    blocks: [],
    totals: { shippingCost: 0, cost: 0 },
  });
  api.products.list.mockResolvedValue([]);
});

describe('ManualPage', () => {
  it('links to the Excel/CSV export of the service board', async () => {
    render(<ManualPage />);

    const excel = await screen.findByRole('link', { name: 'Экспорт в Excel' });
    expect(excel).toHaveAttribute('href', '/api/boards/service/export?format=xlsx');
    expect(screen.getByRole('link', { name: 'Экспорт в CSV' })).toHaveAttribute(
      'href',
      '/api/boards/service/export?format=csv',
    );
  });
});
