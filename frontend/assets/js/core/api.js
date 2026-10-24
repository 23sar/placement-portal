/**
 * api.js — centralised fetch wrapper.
 * Requires: config.js (API_BASE, getAuthHeaders, getToken)
 *
 * All page JS should call these functions instead of raw fetch,
 * so auth headers, base URL, and error handling stay consistent.
 */

/**
 * Make an authenticated API request.
 * On 401 the page is redirected to LOGIN_URL (set per-page before script load).
 *
 * @param {string}  method  - HTTP verb ('GET', 'POST', 'PATCH', 'DELETE')
 * @param {string}  path    - API path, e.g. '/api/jobs'
 * @param {object}  [body]  - Request body (JSON-serialised automatically)
 * @returns {Promise<any>}  - Parsed JSON response data
 * @throws  {Error}         - On non-2xx responses
 */
async function apiRequest(method, path, body) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(API_BASE + path, options);

  if (res.status === 401) {
    // Token missing or expired — redirect to login
    localStorage.clear();
    window.location.href = window.LOGIN_URL || 'login.html';
    return; // halt further execution
  }

  // Parse JSON (fall back to empty object if body is empty)
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Server error ${res.status}`);
  }

  return data;
}

// Convenience wrappers
const api = {
  get:    (path)        => apiRequest('GET',    path),
  post:   (path, body)  => apiRequest('POST',   path, body),
  patch:  (path, body)  => apiRequest('PATCH',  path, body),
  delete: (path)        => apiRequest('DELETE',  path),
};
