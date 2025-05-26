import axios from 'axios';

// Token refresh lock and queue to prevent multiple simultaneous refreshes
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const subscribeTokenRefresh = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
};

// Always set the latest access token from localStorage on every request
axios.interceptors.request.use((config) => {
  const tokens = JSON.parse(localStorage.getItem('authTokens') || 'null');
  if (tokens?.access && config.headers) {
    config.headers['Authorization'] = `Bearer ${tokens.access}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Base API URL - you'll need to change this to your Django backend URL
export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

// Helper to get the access token from localStorage
export const getToken = () => {
  const tokens = JSON.parse(localStorage.getItem('authTokens') || 'null');
  return tokens?.access || null;
};

// Default headers for API requests
export const getHeaders = (includeAuth = true) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (includeAuth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  return headers;
};

// Placeholder for signOut callback to be set by AuthContext
let signOutCallback: (() => void) | null = null;

export const setSignOutCallback = (callback: () => void) => {
  signOutCallback = callback;
};

// Handle token refresh when it's invalid
export const refreshAuthToken = async (): Promise<string | null> => {
  try {
    const tokens = JSON.parse(localStorage.getItem('authTokens') || 'null');
    const refreshToken = tokens?.refresh;
    if (!refreshToken) {
      return null;
    }
    
    const response = await fetch(`${API_URL}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });
    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('authTokens', JSON.stringify({ access: data.access, refresh: refreshToken }));
      return data.access;
    }
    return null;
  } catch (error) {
    localStorage.removeItem('authTokens');
    return null;
  }
};
