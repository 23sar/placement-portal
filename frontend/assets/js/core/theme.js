/**
 * theme.js — dark mode toggle, persisted in localStorage.
 * Self-contained; no dependencies on other core modules.
 */

function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem(
    'theme',
    document.body.classList.contains('dark') ? 'dark' : 'light',
  );
  // Update button emoji
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
}

// Apply saved theme on every page load
(function applySavedTheme() {
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark');
  }
})();
