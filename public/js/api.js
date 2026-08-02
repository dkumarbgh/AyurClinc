/* Thin wrapper around fetch() that adds the JWT and handles JSON + errors. */
const Api = (() => {
  function getToken() {
    return localStorage.getItem('clinic_token');
  }
  function setToken(token) {
    localStorage.setItem('clinic_token', token);
  }
  function clearToken() {
    localStorage.removeItem('clinic_token');
    localStorage.removeItem('clinic_user');
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem('clinic_user') || 'null'); }
    catch (e) { return null; }
  }
  function setUser(user) {
    localStorage.setItem('clinic_user', JSON.stringify(user));
  }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let resp;
    try {
      resp = await fetch(path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new Error('Network error — is the server running?');
    }

    if (resp.status === 401) {
      clearToken();
      App.showLogin();
      throw new Error('Session expired. Please sign in again.');
    }

    let data = null;
    const text = await resp.text();
    if (text) {
      try { data = JSON.parse(text); } catch (e) { /* non-JSON response */ }
    }

    if (!resp.ok) {
      throw new Error((data && data.error) || `Request failed (${resp.status})`);
    }
    return data;
  }

  async function upload(path, formData) {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let resp;
    try {
      resp = await fetch(path, { method: 'POST', headers, body: formData });
    } catch (err) {
      throw new Error('Network error — is the server running?');
    }

    if (resp.status === 401) {
      clearToken();
      App.showLogin();
      throw new Error('Session expired. Please sign in again.');
    }

    let data = null;
    const text = await resp.text();
    if (text) {
      try { data = JSON.parse(text); } catch (e) { /* non-JSON response */ }
    }
    if (!resp.ok) {
      throw new Error((data && data.error) || `Request failed (${resp.status})`);
    }
    return data;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body || {}),
    put: (path, body) => request('PUT', path, body || {}),
    del: (path) => request('DELETE', path),
    upload,
    getToken, setToken, clearToken, getUser, setUser,
  };
})();
