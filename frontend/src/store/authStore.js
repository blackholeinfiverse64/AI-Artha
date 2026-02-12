import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,

      setLoading: (loading) => set({ isLoading: loading }),

      login: async (email, password) => {
        try {
          const response = await api.post('/auth/login', { email, password });
          const { token, user } = response.data.data;
          
          localStorage.setItem('token', token);
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          set({ 
            user, 
            token, 
            isAuthenticated: true,
            isLoading: false 
          });
          
          return { success: true };
        } catch (error) {
          return { 
            success: false, 
            error: error.response?.data?.message || 'Login failed' 
          };
        }
      },

      register: async (data) => {
        try {
          const response = await api.post('/auth/register', data);
          const { token, user } = response.data.data;
          
          localStorage.setItem('token', token);
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          set({ 
            user, 
            token, 
            isAuthenticated: true,
            isLoading: false 
          });
          
          return { success: true };
        } catch (error) {
          return { 
            success: false, 
            error: error.response?.data?.message || 'Registration failed' 
          };
        }
      },

      logout: () => {
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
        set({ 
          user: null, 
          token: null, 
          isAuthenticated: false,
          isLoading: false 
        });
      },

      checkAuth: async () => {
        const token = localStorage.getItem('token');
        
        if (!token) {
          set({ isLoading: false, isAuthenticated: false });
          return;
        }

        try {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          const response = await api.get('/auth/me');
          
          set({ 
            user: response.data.data,
            token,
            isAuthenticated: true,
            isLoading: false 
          });
        } catch (error) {
          localStorage.removeItem('token');
          delete api.defaults.headers.common['Authorization'];
          set({ 
            user: null, 
            token: null, 
            isAuthenticated: false,
            isLoading: false 
          });
        }
      },

      updateUser: (userData) => {
        set((state) => ({
          user: { ...state.user, ...userData }
        }));
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
);
