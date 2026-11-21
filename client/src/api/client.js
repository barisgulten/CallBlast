const BASE_URL = '/api';

function getToken() {
  return localStorage.getItem('callblast_token');
}

function getActiveLang() {
  try {
    const stored = localStorage.getItem('callblast_lang');
    if (stored === 'en' || stored === 'tr' || stored === 'de') return stored;
  } catch {
    // ignore storage access errors
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lower = navigator.language.toLowerCase();
    if (lower.startsWith('en')) return 'en';
    if (lower.startsWith('de')) return 'de';
  }
  return 'tr';
}

function getSessionExpiredMsg() {
  const active = getActiveLang();
  if (active === 'en') return 'Session expired. Please sign in again.';
  if (active === 'de') return 'Sitzung abgelaufen. Bitte melden Sie sich erneut an.';
  return 'Oturum süresi doldu. Lütfen tekrar giriş yapın.';
}

async function request(method, path, body = null, options = {}) {
  const token = getToken();
  const headers = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers,
    ...options,
  };

  if (body) {
    if (body instanceof FormData) {
      config.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(body);
    }
  }

  const response = await fetch(`${BASE_URL}${path}`, config);

  if (response.status === 401) {
    // Only redirect if NOT on login request/page
    if (path !== '/auth/login' && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('callblast_token');
      localStorage.removeItem('callblast_user');
      window.location.href = '/login';
      throw new Error(getSessionExpiredMsg());
    }
  }

  if (!response.ok) {
    const active = getActiveLang();
    let errorMessage =
      active === 'en'
        ? 'An error occurred.'
        : active === 'de'
          ? 'Ein Fehler ist aufgetreten.'
          : 'Bir hata oluştu';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // response wasn't JSON
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function get(path) {
  return request('GET', path);
}

export function post(path, body) {
  return request('POST', path, body);
}

export function put(path, body) {
  return request('PUT', path, body);
}

export function del(path) {
  return request('DELETE', path);
}

export function upload(path, formData) {
  return request('POST', path, formData);
}

export async function getBlob(path, options = {}) {
  const token = getToken();
  const headers = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers,
    ...options,
  });

  if (response.status === 401) {
    if (!window.location.pathname.includes('/login')) {
      localStorage.removeItem('callblast_token');
      localStorage.removeItem('callblast_user');
      window.location.href = '/login';
      throw new Error(getSessionExpiredMsg());
    }
  }

  if (!response.ok) {
    const active = getActiveLang();
    let errorMessage =
      active === 'en'
        ? 'Could not retrieve audio file.'
        : active === 'de'
          ? 'Audiodatei konnte nicht abgerufen werden.'
          : 'Ses dosyası alınamadı.';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // response wasn't JSON
    }
    throw new Error(errorMessage);
  }

  return response.blob();
}
