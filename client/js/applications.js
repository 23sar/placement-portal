const API_BASE = 'http://localhost:5000';

function getAuthHeader() {
  const token = localStorage.getItem('token');
  return token ? `Bearer ${token}` : '';
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

// Auth guard
(function authGuard() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
  }
})();

// Populate sidebar user info
(function initUserInfo() {
  const userStr = localStorage.getItem('user');
  if (!userStr) return;
  try {
    const user = JSON.parse(userStr);
    const nameEl = document.getElementById('user-name');
    const roleEl = document.getElementById('user-role');
    if (nameEl) nameEl.textContent = user.name || '—';
    if (roleEl) roleEl.textContent = user.role || '—';
  } catch (_) {}
})();

function getStatusBadge(status) {
  const badges = {
    pending:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100',
    shortlisted: 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100',
    rejected:    'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
  };
  return badges[status] || 'bg-gray-100 text-gray-800';
}

async function loadApplications() {
  const loadingEl  = document.getElementById('loading');
  const emptyEl    = document.getElementById('empty-state');
  const tableEl    = document.getElementById('table-container');
  const tbodyEl    = document.getElementById('applications-body');

  if (!loadingEl || !tbodyEl) return;

  try {
    const res = await fetch(`${API_BASE}/api/applications/my`, {
      headers: { Authorization: getAuthHeader() }
    });

    if (res.status === 401 || res.status === 403) {
      logout();
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const applications = await res.json();

    loadingEl.classList.add('hidden');

    if (!applications || applications.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }

    tableEl.classList.remove('hidden');

    applications.forEach((app, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700 transition';

      // Row number
      const tdIdx = document.createElement('td');
      tdIdx.className = 'px-6 py-4 text-gray-500 dark:text-gray-400';
      tdIdx.textContent = idx + 1;

      // Job title — textContent (safe)
      const tdTitle = document.createElement('td');
      tdTitle.className = 'px-6 py-4 font-medium text-gray-800 dark:text-white';
      tdTitle.textContent = app.title || '—';

      // Company — textContent (safe)
      const tdCompany = document.createElement('td');
      tdCompany.className = 'px-6 py-4 text-gray-600 dark:text-gray-300';
      tdCompany.textContent = app.company || '—';

      // Location — textContent (safe)
      const tdLocation = document.createElement('td');
      tdLocation.className = 'px-6 py-4 text-gray-600 dark:text-gray-300';
      tdLocation.textContent = app.location || '—';

      // Stipend
      const tdStipend = document.createElement('td');
      tdStipend.className = 'px-6 py-4 text-gray-600 dark:text-gray-300';
      tdStipend.textContent = app.stipend
        ? `₹${Number(app.stipend).toLocaleString('en-IN')}/mo`
        : '—';

      // Applied date
      const tdDate = document.createElement('td');
      tdDate.className = 'px-6 py-4 text-gray-500 dark:text-gray-400 text-xs';
      tdDate.textContent = app.created_at
        ? new Date(app.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';

      // Status badge — value comes from server ENUM; still use textContent
      const tdStatus = document.createElement('td');
      tdStatus.className = 'px-6 py-4';
      const badge = document.createElement('span');
      badge.className = `px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${getStatusBadge(app.status)}`;
      badge.textContent = app.status || 'pending';
      tdStatus.appendChild(badge);

      tr.appendChild(tdIdx);
      tr.appendChild(tdTitle);
      tr.appendChild(tdCompany);
      tr.appendChild(tdLocation);
      tr.appendChild(tdStipend);
      tr.appendChild(tdDate);
      tr.appendChild(tdStatus);

      tbodyEl.appendChild(tr);
    });

  } catch (err) {
    if (loadingEl) loadingEl.innerHTML = `
      <p class="text-red-500">
        <i class="fa-solid fa-triangle-exclamation mr-2"></i>
        Failed to load applications: ${err.message}
      </p>`;
    console.error('[loadApplications]', err);
  }
}

loadApplications();
