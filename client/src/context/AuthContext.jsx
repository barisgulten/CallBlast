import { createContext, useContext, useState, useEffect } from 'react';
import { post, get } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('callblast_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const savedToken = localStorage.getItem('callblast_token');
    const savedUser = localStorage.getItem('callblast_user');

    if (!savedToken || !savedUser) {
      setLoading(false);
      return;
    }

    try {
      // Verify token is still valid
      await get('/auth/verify');
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    } catch {
      // Token invalid, clear everything
      localStorage.removeItem('callblast_token');
      localStorage.removeItem('callblast_user');
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(username, password) {
    const data = await post('/auth/login', { username, password });
    const newToken = data.token;
    const userData = data.user || { username: data.username || username, role: data.role || 'admin' };

    localStorage.setItem('callblast_token', newToken);
    localStorage.setItem('callblast_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);

    return data;
  }

  function logout() {
    localStorage.removeItem('callblast_token');
    localStorage.removeItem('callblast_user');
    setToken(null);
    setUser(null);
  }

  function isAuthenticated() {
    return !!token && !!user;
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
