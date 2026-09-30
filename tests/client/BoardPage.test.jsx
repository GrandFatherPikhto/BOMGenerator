// The "Платы" tab returns to the last opened board; if that board was deleted,
// the page must forget it and fall back to the list instead of dead-ending on a
// "Board not found" alert.
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/client/lib/apiClient.js', () => ({
  api: { boards: { view: vi.fn() } },
}));

vi.mock('../../src/client/hooks/useUiState.js', () => ({ useUiState: vi.fn() }));

import { useUiState } from '../../src/client/hooks/useUiState.js';
import { api } from '../../src/client/lib/apiClient.js';
import BoardPage from '../../src/client/pages/BoardPage.jsx';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BoardPage', () => {
  it('forgets a missing board and returns to the list', async () => {
    const updateUi = vi.fn();
    useUiState.mockReturnValue([{ lastOpenBoardId: 'gone' }, updateUi]);
    api.boards.view.mockRejectedValue(
      Object.assign(new Error('Board not found'), { status: 404 }),
    );

    render(
      <MemoryRouter initialEntries={['/boards/gone']}>
        <Routes>
          <Route path="/boards/:id" element={<BoardPage />} />
          <Route path="/" element={<div>Список плат</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(updateUi).toHaveBeenCalledWith({ lastOpenBoardId: '' }));
    expect(await screen.findByText('Список плат')).toBeInTheDocument();
  });
});
