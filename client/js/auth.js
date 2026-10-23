const API_BASE = 'http://localhost:5000';

async function login() {
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    alert('Please enter your email and password.');
    return;
  }

  const btn = document.querySelector('.auth-container button');
  if (btn) { btn.disabled = true; btn.textContent = 'Logging in…'; }

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok || !data.token) {
      alert(data.error || 'Invalid credentials. Please try again.');
      return;
    }

    // Store token and user info
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    window.location.href = 'dashboard.html';

  } catch (err) {
    alert('Network error. Please check your connection.');
    console.error('[login]', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
  }
}

async function register() {
  const name     = document.getElementById('name').value.trim();
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const role     = document.getElementById('role').value;

  if (!name || !email || !password || !role) {
    alert('All fields are required.');
    return;
  }

  if (password.length < 6) {
    alert('Password must be at least 6 characters.');
    return;
  }

  const btn = document.querySelector('.auth-container button');
  if (btn) { btn.disabled = true; btn.textContent = 'Registering…'; }

  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Registration failed. Please try again.');
      return;
    }

    alert('Registration successful! Please log in.');
    window.location.href = 'login.html';

  } catch (err) {
    alert('Network error. Please check your connection.');
    console.error('[register]', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Register'; }
  }
}