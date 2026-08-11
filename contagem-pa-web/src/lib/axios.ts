import axios from 'axios';

// baseURL relativo: em produção o IIS roteia /api para o backend;
// em desenvolvimento o proxy do Vite (vite.config.ts) faz o mesmo papel.
export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('@pa-contagem:token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Sessão expirada/revogada: limpa e volta ao login.
    // EXCEÇÕES: o próprio 401 do login (senão o reload engole a mensagem
    // de "credenciais inválidas") e quando já estamos na tela de login.
    const ehRotaLogin = error.config?.url?.includes('/auth/login');
    const jaNoLogin = window.location.pathname === '/login';

    if (error.response?.status === 401 && !ehRotaLogin && !jaNoLogin) {
      localStorage.removeItem('@pa-contagem:token');
      localStorage.removeItem('@pa-contagem:user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
