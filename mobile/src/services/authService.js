import axios from 'axios';

export const API_URL = 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

function getErrorMessage(err) {
  if (err.response?.data?.error) {
    return err.response.data.error;
  }
  if (err.message === 'Network Error') {
    return 'No se pudo conectar al servidor. Verificá tu conexión a internet.';
  }
  if (err.code === 'ECONNABORTED') {
    return 'La solicitud tardó demasiado. Intentá de nuevo.';
  }
  return 'Ocurrió un error inesperado. Intentá de nuevo.';
}

export const authService = {
  async login(email, password) {
    try {
      const res = await api.post('/auth/login', { email, password });
      return res.data;
    } catch (err) {
      throw new Error(getErrorMessage(err));
    }
  },

  async register(name, email, password) {
    try {
      const res = await api.post('/auth/register', { name, email, password });
      return res.data;
    } catch (err) {
      throw new Error(getErrorMessage(err));
    }
  },

  async getProfile(token) {
    try {
      const res = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    } catch (err) {
      throw new Error(getErrorMessage(err));
    }
  },
};
