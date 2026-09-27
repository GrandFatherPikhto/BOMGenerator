// Thin fetch wrapper around the Express API.
const BASE = '/api';

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    if (isForm) {
      options.body = body;
    } else {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const response = await fetch(`${BASE}${path}`, options);
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.details = data?.details;
    throw error;
  }
  return data;
}

export const api = {
  boards: {
    list: () => request('/boards'),
    get: (id) => request(`/boards/${id}`),
    create: (payload) => request('/boards', { method: 'POST', body: payload }),
    update: (id, payload) =>
      request(`/boards/${id}`, { method: 'PUT', body: payload }),
    remove: (id) => request(`/boards/${id}`, { method: 'DELETE' }),
    view: (id) => request(`/boards/${id}/lines`),
    addLine: (id, payload) =>
      request(`/boards/${id}/lines`, { method: 'POST', body: payload }),
    updateLine: (id, lineId, payload) =>
      request(`/boards/${id}/lines/${lineId}`, { method: 'PUT', body: payload }),
    deleteLine: (id, lineId) =>
      request(`/boards/${id}/lines/${lineId}`, { method: 'DELETE' }),
    import: (file, name, options = {}) => {
      const form = new FormData();
      form.append('file', file, file.name);
      if (name) {
        form.append('name', name);
      }
      if (options.excludeDnp !== undefined) {
        form.append('excludeDnp', String(options.excludeDnp));
      }
      if (options.excludeFromBom !== undefined) {
        form.append('excludeFromBom', String(options.excludeFromBom));
      }
      return request('/boards/import', { method: 'POST', body: form, isForm: true });
    },
  },
  sellers: {
    list: () => request('/sellers'),
    create: (payload) => request('/sellers', { method: 'POST', body: payload }),
    update: (id, payload) =>
      request(`/sellers/${id}`, { method: 'PUT', body: payload }),
    remove: (id) => request(`/sellers/${id}`, { method: 'DELETE' }),
  },
  categories: {
    list: () => request('/categories'),
    create: (payload) => request('/categories', { method: 'POST', body: payload }),
    update: (id, payload) =>
      request(`/categories/${id}`, { method: 'PUT', body: payload }),
    remove: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  },
  settings: {
    get: () => request('/settings'),
    update: (payload) => request('/settings', { method: 'PUT', body: payload }),
  },
  commonPurchases: {
    list: (mode = 'merged') => request(`/common-purchases?mode=${mode}`),
    setOverride: (payload) =>
      request('/common-purchases', { method: 'PUT', body: payload }),
  },
};
