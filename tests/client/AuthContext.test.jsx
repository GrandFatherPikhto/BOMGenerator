// The auth context: initial /auth/me, login/logout and the reaction to a 401.
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/client/lib/apiClient.js', () => ({
  api: { auth: { me: vi.fn(), login: vi.fn(), logout: vi.fn() } },
}));

import { AuthProvider, useAuth } from '../../src/client/AuthContext.jsx';
import { api } from '../../src/client/lib/apiClient.js';

function wrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}

async function renderAuth() {
  const view = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.auth.me.mockResolvedValue({ authEnabled: true, username: 'denis' });
  api.auth.login.mockResolvedValue({ authEnabled: true, username: 'denis' });
  api.auth.logout.mockResolvedValue(null);
});

describe('AuthProvider', () => {
  it('reports the open mode when authentication is disabled', async () => {
    api.auth.me.mockResolvedValue({ authEnabled: false, username: null });
    const { result } = await renderAuth();
    expect(result.current.authEnabled).toBe(false);
    expect(result.current.username).toBeNull();
  });

  it('restores a signed-in user from /auth/me', async () => {
    const { result } = await renderAuth();
    expect(result.current.authEnabled).toBe(true);
    expect(result.current.username).toBe('denis');
  });

  it('falls back to the open mode when /auth/me fails', async () => {
    api.auth.me.mockRejectedValue(new Error('offline'));
    const { result } = await renderAuth();
    expect(result.current.authEnabled).toBe(false);
    expect(result.current.username).toBeNull();
  });

  it('login signs the user in', async () => {
    api.auth.me.mockResolvedValue({ authEnabled: true, username: null });
    const { result } = await renderAuth();

    await act(async () => {
      await result.current.login('denis', 'pw');
    });

    expect(api.auth.login).toHaveBeenCalledWith('denis', 'pw');
    expect(result.current.username).toBe('denis');
  });

  it('a 401 event drops the session', async () => {
    const { result } = await renderAuth();
    expect(result.current.username).toBe('denis');

    act(() => {
      window.dispatchEvent(new Event('bom:unauthorized'));
    });

    expect(result.current.username).toBeNull();
  });

  it('logout clears the user even when the request fails', async () => {
    api.auth.logout.mockRejectedValue(new Error('offline'));
    const { result } = await renderAuth();

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.username).toBeNull();
  });
});
