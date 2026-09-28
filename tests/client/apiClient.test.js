// Unit tests for the thin fetch wrapper around the API.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../src/client/lib/apiClient.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  };
}

describe('apiClient', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET builds the /api URL and parses JSON', async () => {
    global.fetch.mockResolvedValue(jsonResponse([{ id: '1' }]));
    const result = await api.boards.list();
    expect(global.fetch).toHaveBeenCalledWith('/api/boards', {
      method: 'GET',
      headers: {},
    });
    expect(result).toEqual([{ id: '1' }]);
  });

  it('POST sends a JSON body with the content-type header', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ id: '7' }));
    await api.boards.create({ name: 'A' });
    expect(global.fetch).toHaveBeenCalledWith('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'A' }),
    });
  });

  it('returns null for 204 No Content', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });
    await expect(api.boards.remove('1')).resolves.toBeNull();
  });

  it('throws an error carrying the status and details on failure', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({ error: 'name is required', details: ['Name'] }),
    });
    await expect(api.boards.create({})).rejects.toMatchObject({
      message: 'name is required',
      status: 400,
      details: ['Name'],
    });
  });

  it('falls back to an HTTP status message when the body has no error', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => '' });
    await expect(api.settings.get()).rejects.toThrow('HTTP 500');
  });

  it('builds the product query string from the seller id', async () => {
    global.fetch.mockResolvedValue(jsonResponse([]));
    await api.products.list('abc');
    expect(global.fetch).toHaveBeenCalledWith('/api/products?sellerId=abc', {
      method: 'GET',
      headers: {},
    });
  });

  it('reads the persisted UI state', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ version: 1, sections: { boards: { lastOpenBoardId: 'b1' } } }),
    );
    const result = await api.uiState.get();
    expect(global.fetch).toHaveBeenCalledWith('/api/ui-state', {
      method: 'GET',
      headers: {},
    });
    expect(result.sections.boards.lastOpenBoardId).toBe('b1');
  });

  it('merges UI-state sections with a PATCH', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ version: 1, sections: {} }));
    await api.uiState.merge({ purchases: { boardId: 'b1' } });
    expect(global.fetch).toHaveBeenCalledWith('/api/ui-state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: { purchases: { boardId: 'b1' } } }),
    });
  });

  it('sends multipart form data for the import endpoint', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ board: { id: '1' } }));
    const file = new File(['Reference,Qty\nR1,1'], 'board.csv', {
      type: 'text/csv',
    });
    await api.boards.import(file, 'Board A', { excludeDnp: false });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/boards/import');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBeUndefined();
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('name')).toBe('Board A');
    expect(options.body.get('excludeDnp')).toBe('false');
    expect(options.body.get('file')).toBeInstanceOf(File);
  });
});
