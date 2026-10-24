/* Login + register forms (pages/login.html, pages/register.html) */
if (session.token()) location.href = 'dashboard.html';
const form = $('form');
form.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('button[type=submit]', form), label = btn.textContent, d = Object.fromEntries(new FormData(form));
  btn.disabled = true; btn.textContent = 'Please wait…'; $('#err').textContent = '';
  try {
    if (form.id === 'register') await api('/api/auth/register', { method: 'POST', body: d });
    const r = await api('/api/auth/login', { method: 'POST', body: { email: d.email, password: d.password } });
    session.save(r.token, r.user);
    location.href = 'dashboard.html';
  } catch (err) { $('#err').textContent = err.message; btn.disabled = false; btn.textContent = label; }
});
