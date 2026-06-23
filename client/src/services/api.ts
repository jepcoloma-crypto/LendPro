import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ? `${import.meta.env.VITE_API_BASE_URL}/api` : '/api',
  timeout: 60000,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const url = error.config?.url || '';
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Don't intercept auth endpoints (login, register, refresh)
    if (url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await api.post('/auth/refresh', { refreshToken });
        localStorage.setItem('accessToken', data.data.accessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);
        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (data: any) => api.post('/auth/register', data),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  logout: () => api.post('/auth/logout'),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => api.post('/auth/reset-password', { token, password }),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data: any) => api.put('/auth/profile', data),
  changePassword: (currentPassword: string, newPassword: string) => api.post('/auth/change-password', { currentPassword, newPassword }),
};

// Users
export const usersApi = {
  getAll: (params?: any) => api.get('/users', { params }),
  create: (data: any) => api.post('/users', data),
  getById: (id: string) => api.get(`/users/${id}`),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

// Roles
export const rolesApi = {
  getAll: () => api.get('/roles'),
};

// Branches
export const branchesApi = {
  getAll: () => api.get('/branches'),
  create: (data: any) => api.post('/branches', data),
  update: (id: string, data: any) => api.put(`/branches/${id}`, data),
};

// Borrowers
export const borrowersApi = {
  getAll: (params?: any) => api.get('/borrowers', { params }),
  create: (data: any) => api.post('/borrowers', data),
  getById: (id: string) => api.get(`/borrowers/${id}`),
  update: (id: string, data: any) => api.put(`/borrowers/${id}`, data),
  delete: (id: string) => api.delete(`/borrowers/${id}`),
  uploadPhoto: (borrowerId: string, data: FormData) => api.post(`/borrowers/${borrowerId}/photo`, data),
  uploadDocument: (borrowerId: string, data: FormData) => api.post(`/borrowers/${borrowerId}/documents`, data),
  addCoMaker: (borrowerId: string, data: any) => api.post(`/borrowers/${borrowerId}/co-makers`, data),
  getPayments: (borrowerId: string, params?: any) => api.get(`/borrowers/${borrowerId}/payments`, { params }),
};

// Loan Products
export const loanProductsApi = {
  getAll: (params?: any) => api.get('/loan-products', { params }),
  create: (data: any) => api.post('/loan-products', data),
  update: (id: string, data: any) => api.put(`/loan-products/${id}`, data),
  getCharges: (id: string) => api.get(`/loan-products/${id}/charges`),
  saveCharges: (id: string, charges: any[]) => api.put(`/loan-products/${id}/charges`, { charges }),
};

// Loan Applications
export const applicationsApi = {
  getAll: (params?: any) => api.get('/applications', { params }),
  create: (data: any) => api.post('/applications', data),
  update: (id: string, data: any) => api.put(`/applications/${id}`, data),
  remove: (id: string) => api.delete(`/applications/${id}`),
  getById: (id: string) => api.get(`/applications/${id}`),
  submit: (id: string) => api.post(`/applications/${id}/submit`),
  review: (id: string) => api.post(`/applications/${id}/review`),
  investigate: (id: string, riskScore?: number, riskNotes?: string) => api.post(`/applications/${id}/investigate`, { riskScore, riskNotes }),
  assess: (id: string, decision: string, comments?: string) => api.post(`/applications/${id}/assess`, { decision, comments }),
  approve: (id: string, comments?: string) => api.post(`/applications/${id}/approve`, { comments }),
  reject: (id: string, comments?: string) => api.post(`/applications/${id}/reject`, { comments }),
  release: (id: string, method?: string, reference?: string) => api.post(`/applications/${id}/release`, { method, reference }),
  uploadDocuments: (id: string, data: FormData) => api.post(`/applications/${id}/documents`, data),
  getDocuments: (id: string) => api.get(`/applications/${id}/documents`),
  deleteDocument: (id: string, docId: string) => api.delete(`/applications/${id}/documents/${docId}`),
  getAmortization: (id: string) => api.get(`/applications/${id}/amortization`),
  getPrintDocument: (id: string) => api.get(`/applications/${id}/print-document`),
};

// Loans
export const loansApi = {
  getAll: (params?: any) => api.get('/loans', { params }),
  getById: (id: string) => api.get(`/loans/${id}`),
  getSchedule: (id: string) => api.get(`/loans/${id}/schedule`),
  getDashboard: () => api.get('/loans/dashboard'),
  update: (id: string, data: any) => api.put(`/loans/${id}`, data),
  delete: (id: string) => api.delete(`/loans/${id}`),
  writeOff: (id: string, data: any) => api.post(`/loans/${id}/write-off`, data),
  restructure: (id: string, data: any) => api.post(`/loans/${id}/restructure`, data),
  previewRestructure: (data: any) => api.post('/loans/preview-restructure', data),
};

// Payments
export const paymentsApi = {
  getAll: (params?: any) => api.get('/payments', { params }),
  create: (data: any) => api.post('/payments', data),
  getById: (id: string) => api.get(`/payments/${id}`),
  update: (id: string, data: any) => api.put(`/payments/${id}`, data),
  delete: (id: string) => api.delete(`/payments/${id}`),
  getRecent: (limit?: number) => api.get('/payments/recent', { params: { limit } }),
  getReceipt: (id: string) => api.get(`/payments/${id}/receipt`),
  importCsv: (data: FormData) => api.post('/payments/import', data, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }),
};

// Collections
export const collectionsApi = {
  getAll: (params?: any) => api.get('/collections', { params }),
  getDueToday: () => api.get('/collections/due-today'),
  getOverdue: () => api.get('/collections/overdue'),
  getById: (id: string) => api.get(`/collections/${id}`),
  update: (id: string, data: any) => api.put(`/collections/${id}`, data),
  addVisit: (id: string, data: any) => api.post(`/collections/${id}/visits`, data),
};

// Reports
export const reportsApi = {
  getAging: () => api.get('/reports/aging'),
  getDelinquency: () => api.get('/reports/delinquency'),
  getInterestIncome: (params?: any) => api.get('/reports/interest-income', { params }),
  getAmortization: (params?: any) => api.get('/reports/amortization', { params }),
  getCollectorVisits: (params?: any) => api.get('/reports/collector-visits', { params }),
  getCollectorPayments: (params?: any) => api.get('/reports/collector-payments', { params }),
  getCollectorPerformance: (params?: any) => api.get('/reports/collector-performance', { params }),
  getCollectorRemittance: (params?: any) => api.get('/reports/collector-remittance', { params }),
  getDailyCollections: (params?: any) => api.get('/reports/daily-collections', { params }),
  getLoansGranted: (params?: any) => api.get('/reports/loans-granted', { params }),
  getExpectedCollections: (params?: any) => api.get('/reports/expected-collections', { params }),
  getPortfolioSummary: (params?: any) => api.get('/reports/portfolio-summary', { params }),
  getBranchPerformance: (params?: any) => api.get('/reports/branch-performance', { params }),
  getDisbursements: (params?: any) => api.get('/reports/disbursements', { params }),
  getBorrowerPerformance: (params?: any) => api.get('/reports/borrower-performance', { params }),
  getProcessingCharges: (params?: any) => api.get('/reports/processing-charges', { params }),
  getPastDue: (params?: any) => api.get('/reports/past-due', { params }),
  getApplicationTypes: (params?: any) => api.get('/reports/application-types', { params }),
};

// Charges
export const chargesApi = {
  getAll: () => api.get('/charges'),
  create: (data: any) => api.post('/charges', data),
  update: (id: string, data: any) => api.put(`/charges/${id}`, data),
  remove: (id: string) => api.delete(`/charges/${id}`),
};

// Settings
export const settingsApi = {
  getAll: () => api.get('/settings'),
  update: (data: any) => api.put('/settings', data),
};

// Calendar
export const calendarApi = {
  getEvents: (params: { start?: string; end?: string; collectorId?: string }) => api.get('/calendar/events', { params }),
};

// Audit Logs
export const auditLogsApi = {
  getAll: (params?: any) => api.get('/audit-logs', { params }),
};

// Utilities
export const utilitiesApi = {
  health: () => api.get('/utilities/health'),
  recalculateBalances: () => api.post('/utilities/recalculate-balances'),
  applyPenalties: () => api.post('/utilities/apply-penalties'),
  clearData: () => api.post('/utilities/clear-data'),
  backup: () => api.get('/utilities/backup', { responseType: 'blob' }),
  restore: (file: File) => { const fd = new FormData(); fd.append('file', file); return api.post('/utilities/restore', fd, { timeout: 120000 }); },
};
