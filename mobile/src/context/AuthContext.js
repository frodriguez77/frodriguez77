import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

const SECURE_STORE_TOKEN_KEY = 'safebackup_token';
export const API_URL = 'http://localhost:3000/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: restore token from SecureStore and validate it
  useEffect(() => {
    restoreSession();
  }, []);

  async function restoreSession() {
    try {
      const storedToken = await SecureStore.getItemAsync(SECURE_STORE_TOKEN_KEY);
      if (!storedToken) {
        setLoading(false);
        return;
      }

      // Validate token by fetching user profile
      const profile = await authService.getProfile(storedToken);
      setToken(storedToken);
      setUser(profile.user);
    } catch (err) {
      // Token invalid or expired – clear it
      await SecureStore.deleteItemAsync(SECURE_STORE_TOKEN_KEY).catch(() => {});
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    const data = await authService.login(email, password);
    await SecureStore.setItemAsync(SECURE_STORE_TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }

  async function register(name, email, password) {
    const data = await authService.register(name, email, password);
    await SecureStore.setItemAsync(SECURE_STORE_TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }

  async function logout() {
    await SecureStore.deleteItemAsync(SECURE_STORE_TOKEN_KEY).catch(() => {});
    setToken(null);
    setUser(null);
  }

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
