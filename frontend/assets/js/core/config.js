/**
 * config.js — single source of truth for shared constants.
 * Loaded first on every page.
 */

/** Base URL of the backend API. Change this for deployment. */
const API_BASE = 'http://localhost:5000';

/** Retrieve the JWT from localStorage. */
function getToken() {
  return localStorage.getItem('token');
}

/** Retrieve the stored user object, or null. */
function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

/** Build an Authorization header object for fetch calls. */
function getAuthHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
