import { create } from 'zustand';

export type Role = 'secretaria' | 'pa' | 'supervisao' | 'admin';

export interface AuthUser {
  id: string;
  nome: string;
  usuario: string; // Substituído de 'email' para 'usuario'
  role: Role;
  trocar_senha: boolean; // Adicionado diretamente ao perfil do utilizador
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
}

const getStoredUser = () => {
  const user = localStorage.getItem('@pa-contagem:user');
  return user ? JSON.parse(user) : null;
};

const getStoredToken = () => localStorage.getItem('@pa-contagem:token');

export const useAuthStore = create<AuthState>((set) => ({
  user: getStoredUser(),
  token: getStoredToken(),
  isAuthenticated: !!getStoredToken(),
  
  login: (user, token) => {
    localStorage.setItem('@pa-contagem:token', token);
    localStorage.setItem('@pa-contagem:user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },
  
  logout: () => {
    localStorage.removeItem('@pa-contagem:token');
    localStorage.removeItem('@pa-contagem:user');
    set({ user: null, token: null, isAuthenticated: false });
  },
}));