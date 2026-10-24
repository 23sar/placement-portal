/** login.js — handles the login form on pages/login.html */

async function login() {
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorEl  = document.getElementById('error-msg');
  const btn      = document.getElementById('login-btn');

  errorEl.textContent = '';

  if (!email || !password) {
    errorEl.textContent = 'Please enter your email and password.';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Logging in…';

  try {
    const data = await api.post('/api/auth/login', { email, password });

    localStorage.setItem('token', data.token);
    localStorage.setItem('user',  JSON.stringify(data.user));

    // Role-based redirect
    if (data.user.role === 'company') {
      window.location.href = 'company/dashboard.html';
    } else {
      window.location.href = 'student/dashboard.html';
    }
  } catch (err) {
    errorEl.textContent = err.message || 'Login failed. Please try again.';
    btn.disabled    = false;
    btn.textContent = 'Login';
  }
}

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  login();
});
