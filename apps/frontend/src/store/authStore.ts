import { create } from 'zustand';

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

// Initialize from local storage
const initialToken = localStorage.getItem('collab_token');
const initialUser = localStorage.getItem('collab_user');

export const useAuthStore = create<AuthState>((set) => ({
  token: initialToken,
  user: initialUser ? JSON.parse(initialUser) : null,
  isAuthenticated: !!initialToken,
  
  setAuth: (token, user) => {
    localStorage.setItem('collab_token', token);
    localStorage.setItem('collab_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },
  
  logout: () => {
    localStorage.removeItem('collab_token');
    localStorage.removeItem('collab_user');
    set({ token: null, user: null, isAuthenticated: false });
  }
}));
