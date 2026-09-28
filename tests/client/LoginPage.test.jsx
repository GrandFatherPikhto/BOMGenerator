// The login screen: submitting the credentials and showing the error.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/client/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

import { useAuth } from '../../src/client/AuthContext.jsx';
import LoginPage from '../../src/client/pages/LoginPage.jsx';

function fillAndSubmit(username, password) {
  // MUI appends " *" to the label of a required field, so match loosely.
  fireEvent.change(screen.getByLabelText(/Имя пользователя/), {
    target: { value: username },
  });
  fireEvent.change(screen.getByLabelText(/Пароль/), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  it('submits the typed credentials', async () => {
    const login = vi.fn().mockResolvedValue({ username: 'denis' });
    useAuth.mockReturnValue({ login });

    render(<LoginPage />);
    fillAndSubmit('denis', 'secret');

    await waitFor(() => expect(login).toHaveBeenCalledWith('denis', 'secret'));
  });

  it('shows a friendly error for wrong credentials', async () => {
    const login = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Invalid credentials'), { status: 401 }));
    useAuth.mockReturnValue({ login });

    render(<LoginPage />);
    fillAndSubmit('denis', 'nope');

    expect(
      await screen.findByText('Неверное имя пользователя или пароль'),
    ).toBeInTheDocument();
  });
});
