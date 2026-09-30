// "Посадочные места": the summary table and the grouping checkbox.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/client/lib/apiClient.js', () => ({
  api: {
    footprints: { list: vi.fn(), setGrouped: vi.fn() },
  },
}));

vi.mock('../../src/client/hooks/useUiState.js', () => ({ useUiState: vi.fn() }));

import { useUiState } from '../../src/client/hooks/useUiState.js';
import { api } from '../../src/client/lib/apiClient.js';
import FootprintsPage from '../../src/client/pages/FootprintsPage.jsx';

const LIST = {
  footprints: [
    {
      footprint: 'Resistor_SMD:R_0603',
      positions: 2,
      boards: 1,
      totalQty: 5,
      grouped: false,
    },
  ],
  groupedCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  useUiState.mockReturnValue([{ filter: '', page: 0, size: 20 }, vi.fn()]);
  api.footprints.list.mockResolvedValue(LIST);
  api.footprints.setGrouped.mockResolvedValue({
    footprint: 'resistor_smd:r_0603',
    grouped: true,
  });
});

describe('FootprintsPage', () => {
  it('lists footprints with their counts', async () => {
    render(<FootprintsPage />);

    expect(await screen.findByText('Resistor_SMD:R_0603')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('turns the grouping checkbox on for a footprint', async () => {
    render(<FootprintsPage />);

    const checkbox = await screen.findByRole('checkbox', {
      name: 'Группировать по посадочному месту: Resistor_SMD:R_0603',
    });
    await userEvent.click(checkbox);

    await waitFor(() =>
      expect(api.footprints.setGrouped).toHaveBeenCalledWith(
        'Resistor_SMD:R_0603',
        true,
      ),
    );
  });

  it('clears the search field with the cross button', async () => {
    render(<FootprintsPage />);

    const field = await screen.findByLabelText('Поиск по посадочному месту');
    await userEvent.type(field, 'R_0603');
    expect(field).toHaveValue('R_0603');

    await userEvent.click(screen.getByRole('button', { name: 'Очистить' }));
    expect(field).toHaveValue('');
  });
});
