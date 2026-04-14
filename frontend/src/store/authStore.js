import { create } from 'zustand';
import api, { API_ORIGIN } from '../services/api';

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setLoading: (loading) => set({ isLoading: loading }),

  checkAuth: async () => {
    try {
      const response = await api.get('/auth/session');
      const authenticated = Boolean(response.data?.authenticated);
      set({
        user: authenticated ? response.data?.data || null : null,
        isAuthenticated: authenticated,
        isLoading: false,
      });
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  logout: () => {
    set({ user: null, isAuthenticated: false, isLoading: false });
    // Redirect to backend /logout which clears cookie then redirects to auth server
    window.location.href = `${API_ORIGIN}/logout`;
  },

  updateUser: (userData) => {
    set((state) => ({
      user: { ...state.user, ...userData },
    }));
  },
}));
