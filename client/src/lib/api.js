const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Trades
  getTrades: (params = {}) => request('/trades?' + new URLSearchParams(params)),
  getTrade: (id) => request(`/trades/${id}`),
  createTrade: (data) => request('/trades', { method: 'POST', body: data }),
  updateTrade: (id, data) => request(`/trades/${id}`, { method: 'PUT', body: data }),
  deleteTrade: (id) => request(`/trades/${id}`, { method: 'DELETE' }),
  importTrades: (csv, format) => request('/trades/import', { method: 'POST', body: { csv, format } }),
  exportTrades: () => fetch('/api/trades/export').then(r => r.blob()),

  // Market
  getQuotes: () => request('/market/quotes'),
  getCalendar: () => request('/market/calendar'),
  refreshCalendar: () => request('/market/calendar/refresh', { method: 'POST' }),

  // Accounts
  getAccounts: () => request('/accounts'),
  createAccount: (data) => request('/accounts', { method: 'POST', body: data }),
  updateAccount: (id, data) => request(`/accounts/${id}`, { method: 'PUT', body: data }),
  deleteAccount: (id) => request(`/accounts/${id}`, { method: 'DELETE' }),

  // Tags
  getTags: (type) => request('/tags' + (type ? `?type=${type}` : '')),
  createTag: (data) => request('/tags', { method: 'POST', body: data }),
  updateTag: (id, data) => request(`/tags/${id}`, { method: 'PUT', body: data }),
  deleteTag: (id) => request(`/tags/${id}`, { method: 'DELETE' }),

  // Settings
  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PUT', body: data }),

  // Analytics
  getSummary: (params = {}) => request('/analytics/summary?' + new URLSearchParams(params)),
  getEquity: (params = {}) => request('/analytics/equity?' + new URLSearchParams(params)),
  getDaily: (params = {}) => request('/analytics/daily?' + new URLSearchParams(params)),
  getBySession: (params = {}) => request('/analytics/by-session?' + new URLSearchParams(params)),
  getByWeekday: (params = {}) => request('/analytics/by-weekday?' + new URLSearchParams(params)),
  getBySetup: (params = {}) => request('/analytics/by-setup?' + new URLSearchParams(params)),
  getByConfluence: (params = {}) => request('/analytics/by-confluence?' + new URLSearchParams(params)),
  getMistakes: (params = {}) => request('/analytics/mistakes?' + new URLSearchParams(params)),
  getByAccount: (params = {}) => request('/analytics/by-account?' + new URLSearchParams(params)),
  getRDistribution: (params = {}) => request('/analytics/r-distribution?' + new URLSearchParams(params)),
};
