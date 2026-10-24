/**
 * auth.js — shared auth helpers used by every protected page.
 * Requires: config.js (getToken, getUser)
 *
 * Each page sets  window.LOGIN_URL  before loading these scripts,
 * so redirects always point to the correct relative path.
 */

/**
 * Redirect to login if no token is stored.
 * Also performs an optional role check.
 *
 * @param {string} [requiredRole] - 'student' | 'company' — redirect if wrong role
 */
function authGuard(requiredRole) {
  if (!getToken()) {
    window.location.href = window.LOGIN_URL || 'login.html';
    return;
  }
  if (requiredRole) {
    const user = getUser();
    if (!user || user.role !== requiredRole) {
      window.location.href = window.LOGIN_URL || 'login.html';
    }
  }
}

/** Clear session and redirect to login. */
function logout() {
  localStorage.clear();
  window.location.href = window.LOGIN_URL || 'login.html';
}

/**
 * Populate sidebar user-info elements if they exist on the page.
 * Looks for #user-name and #user-role.
 */
function populateUserInfo() {
  const user = getUser();
  if (!user) return;

  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');

  if (nameEl) nameEl.textContent = user.name || '—';
  if (roleEl) roleEl.textContent = user.role || '—';
}
