/** register.js — handles the registration form on pages/register.html */

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name     = document.getElementById('name').value.trim();
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const role     = document.getElementById('role').value;
  const errorEl  = document.getElementById('error-msg');
  const btn      = document.getElementById('register-btn');

  errorEl.textContent = '';

  // Client-side validation (server validates too)
  if (!name || !email || !password || !role) {
    errorEl.textContent = 'All fields are required.';
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters.';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Registering…';

  try {
    await api.post('/api/auth/register', { name, email, password, role });
    window.location.href = `login.html?registered=1`;
  } catch (err) {
    errorEl.textContent = err.message || 'Registration failed. Please try again.';
    btn.disabled    = false;
    btn.textContent = 'Create Account';
  }
});
