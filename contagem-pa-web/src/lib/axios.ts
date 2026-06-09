import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:3333/api',
  timeout: 10000,
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
    if (error.response?.status === 401) {
      localStorage.removeItem('@pa-contagem:token');
      localStorage.removeItem('@pa-contagem:user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);