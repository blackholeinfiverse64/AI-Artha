import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'http://localhost:5000';
const AUTH_SERVER_URL = (import.meta.env.VITE_AUTH_SERVER_URL || 'https://bhiv-auth.onrender.com').replace(/\/$/, '');

/**
 * Origin for postMessage from auth popup — must match auth window origin exactly.
 * Override only if you use a non-production auth host.
 */
export const BHIV_AUTH_MESSAGE_ORIGIN =
  import.meta.env.VITE_AUTH_MESSAGE_ORIGIN || 'https://bhiv-auth.onrender.com';

/** Must equal {APP_URL}/auth/callback on the API (same host as API_ORIGIN in typical deploy). */
const AUTH_CALLBACK_URL =
  import.meta.env.VITE_AUTH_CALLBACK_URL || `${API_ORIGIN}/auth/callback`;

/** Public SPA origin (no trailing slash). Used for signup_url and popup URLs. */
export function getSpaPublicUrl() {
  const v = import.meta.env.VITE_APP_URL;
  if (v && typeof v === 'string') return v.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:5173';
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const reqUrl = error.config?.url || '';
    const silent401Me = error.response?.status === 401 && reqUrl.includes('/auth/me');
    const silent429AuthFlow =
      error.response?.status === 429 &&
      (reqUrl.includes('/auth/magic-link') || reqUrl.includes('/auth/validate-login-email'));
    if (!silent401Me && !silent429AuthFlow) {
      console.error('API Error:', {
        status: error.response?.status,
        data: error.response?.data,
        url: reqUrl,
        method: error.config?.method,
      });
    }

    const message = error.response?.data?.message || error.response?.data?.error || 'An error occurred';

    if (error.response?.status === 401) {
      const url = reqUrl;
      if (url.includes('/auth/login')) {
        toast.error(message);
      } else if (!url.includes('/auth/me')) {
        toast.error('Session expired. Please login again.');
        window.location.href = '/login';
      }
    } else if (error.response?.status === 403) {
      if (error.config?.url?.includes('validate-login-email')) {
        toast.error(message);
      } else if (error.response?.data?.code === 'app_not_allowed') {
        toast.error('Your account is not enabled for this app.');
      } else {
        toast.error('You do not have permission to perform this action');
      }
    } else if (error.response?.status === 409) {
      toast.error(message);
    } else if (error.response?.status === 429) {
      toast.error(message);
    } else if (error.response?.status === 503) {
      toast.error(message || 'Service temporarily unavailable. Try again in a moment.');
    } else if (error.response?.status === 400) {
      const errors = error.response?.data?.errors;
      if (errors && Array.isArray(errors)) {
        errors.forEach(err => toast.error(err.msg || err.message));
      } else {
        toast.error(message);
      }
    } else if (error.response?.status >= 500) {
      const isAuthFlowUrl =
        reqUrl.includes('/auth/login') ||
        reqUrl.includes('/auth/magic-link') ||
        reqUrl.includes('/auth/signup');
      toast.error(isAuthFlowUrl ? message : 'Server error. Please try again later.');
    }

    return Promise.reject(error);
  }
);

export { AUTH_SERVER_URL, API_ORIGIN, AUTH_CALLBACK_URL };
export default api;
