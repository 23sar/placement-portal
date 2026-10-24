/* Shared helpers: config, API client, session, theme, toast. Loaded on every page. */
const API_BASE = 'http://localhost:5000';   // only place to change the backend URL
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const session = {
  token: () => localStorage.getItem('token'),
  user: () => { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  save(t, u) { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); },
  clear() { localStorage.removeItem('token'); localStorage.removeItem('user'); }
};

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (session.token()) headers.Authorization = 'Bearer ' + session.token();
  let res;
  try { res = await fetch(API_BASE + path, { method, headers, body: body && JSON.stringify(body) }); }
  catch { throw new Error(`Can't reach the server at ${API_BASE}. Start the backend and check CORS settings.`); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && session.token()) { logout(); throw new Error('Session expired. Please sign in again.'); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function logout() { session.clear(); location.href = 'login.html'; }

function setTheme(t) { document.documentElement.dataset.theme = t; localStorage.setItem('theme', t); }
function toggleTheme() { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }
setTheme(localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

function toast(msg, type = 'ok') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.className = 'show ' + type;
  clearTimeout(t._h); t._h = setTimeout(() => t.className = '', 3000);
}
