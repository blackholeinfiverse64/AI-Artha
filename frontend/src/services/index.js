import api from './api';

// Invoice Services
export const invoiceService = {
  getAll: (params) => api.get('/invoices', { params }),
  getById: (id) => api.get(`/invoices/${id}`),
  create: (data) => api.post('/invoices', data),
  update: (id, data) => api.put(`/invoices/${id}`, data),
  delete: (id) => api.delete(`/invoices/${id}`),
  send: (id) => api.post(`/invoices/${id}/send`),
  recordPayment: (id, data) => api.post(`/invoices/${id}/payment`, data),
  downloadPdf: (id) => api.get(`/invoices/${id}/pdf`, { responseType: 'blob' }),
};

// Expense Services
export const expenseService = {
  getAll: (params) => api.get('/expenses', { params }),
  getById: (id) => api.get(`/expenses/${id}`),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
  approve: (id) => api.post(`/expenses/${id}/approve`),
  reject: (id, reason) => api.post(`/expenses/${id}/reject`, { reason }),
  getPending: () => api.get('/expenses/pending'),
  scanReceipt: (file) => {
    const formData = new FormData();
    formData.append('receipt', file);
    return api.post('/expenses/ocr', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Account/Ledger Services
export const accountService = {
  getAll: () => api.get('/accounts'),
  getById: (id) => api.get(`/accounts/${id}`),
  create: (data) => api.post('/accounts', data),
  update: (id, data) => api.put(`/accounts/${id}`, data),
  delete: (id) => api.delete(`/accounts/${id}`),
};

export const ledgerService = {
  getEntries: (params) => api.get('/ledger/entries', { params }),
  getEntryById: (id) => api.get(`/ledger/entries/${id}`),
  createEntry: (data) => api.post('/ledger/entries', data),
  updateEntry: (id, data) => api.put(`/ledger/entries/${id}`, data),
  postEntry: (id) => api.post(`/ledger/entries/${id}/post`),
  verifyIntegrity: () => api.get('/ledger/verify'),
};

// GST Services
export const gstService = {
  getSummary: (params) => api.get('/gst/summary', { params }),
  getGSTR1: (period) => api.get(`/gst/gstr1/${period}`),
  getGSTR3B: (period) => api.get(`/gst/gstr3b/${period}`),
  fileReturn: (data) => api.post('/gst/file-return', data),
  downloadGSTR1: (period) => api.get(`/gst/gstr1/${period}/download`, { responseType: 'blob' }),
};

// TDS Services
export const tdsService = {
  getSummary: (params) => api.get('/tds/summary', { params }),
  getEntries: (params) => api.get('/tds/entries', { params }),
  createEntry: (data) => api.post('/tds/entries', data),
  payTDS: (id, data) => api.post(`/tds/pay/${id}`, data),
  downloadForm: (form, params) => api.get(`/tds/forms/${form}`, { params, responseType: 'blob' }),
};

// Report Services
export const reportService = {
  getProfitLoss: (params) => api.get('/reports/profit-loss', { params }),
  getBalanceSheet: (params) => api.get('/reports/balance-sheet', { params }),
  getCashFlow: (params) => api.get('/reports/cash-flow', { params }),
  getTrialBalance: (params) => api.get('/reports/trial-balance', { params }),
  getAgedReceivables: () => api.get('/reports/aged-receivables'),
  getAgedPayables: () => api.get('/reports/aged-payables'),
  exportReport: (type, params) => api.get(`/reports/${type}/export`, { params, responseType: 'blob' }),
};

// Dashboard Services (uses reports/invoices/expenses endpoints)
export const dashboardService = {
  getKPIs: () => api.get('/reports/kpis'),
  getStats: () => api.get('/reports/dashboard'),
  getInvoiceStats: () => api.get('/invoices/stats'),
  getExpenseStats: () => api.get('/expenses/stats'),
  getRecentInvoices: () => api.get('/invoices', { params: { limit: 5, sort: '-createdAt' } }),
  getRecentExpenses: () => api.get('/expenses', { params: { limit: 5, sort: '-createdAt' } }),
};

// Settings Services
export const settingsService = {
  getCompany: () => api.get('/settings/company'),
  updateCompany: (data) => api.put('/settings/company', data),
  uploadLogo: (file) => {
    const formData = new FormData();
    formData.append('logo', file);
    return api.post('/settings/company/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// User Services
export const userService = {
  getAll: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  changePassword: (id, data) => api.post(`/users/${id}/change-password`, data),
  getProfile: () => api.get('/users/me'),
  updateProfile: (data) => api.put('/users/me', data),
};

