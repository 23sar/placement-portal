/**
 * student-applications.js
 * Page: frontend/pages/student/my-applications.html
 */

authGuard('student');
populateUserInfo();

function statusBadgeClass(status) {
  return {
    pending:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100',
    shortlisted: 'bg-green-100  text-green-800  dark:bg-green-800  dark:text-green-100',
    rejected:    'bg-red-100    text-red-800    dark:bg-red-800    dark:text-red-100',
  }[status] || 'bg-gray-100 text-gray-800';
}

async function loadApplications() {
  const loadingEl  = document.getElementById('loading');
  const emptyEl    = document.getElementById('empty-state');
  const tableEl    = document.getElementById('table-container');
  const tbody      = document.getElementById('applications-body');

  try {
    const apps = await api.get('/api/applications/my');

    loadingEl.classList.add('hidden');

    if (!apps.length) {
      emptyEl.classList.remove('hidden');
      return;
    }

    tableEl.classList.remove('hidden');

    apps.forEach((app, i) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700 transition';

      const cells = [
        { text: i + 1,           cls: 'text-gray-400' },
        { text: app.title,       cls: 'font-medium text-gray-800 dark:text-white' },
        { text: app.company,     cls: 'text-gray-600 dark:text-gray-300' },
        { text: app.location,    cls: 'text-gray-600 dark:text-gray-300' },
        {
          text: app.stipend ? `₹${Number(app.stipend).toLocaleString('en-IN')}/mo` : '—',
          cls: 'text-gray-600 dark:text-gray-300'
        },
        {
          text: app.created_at
            ? new Date(app.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
            : '—',
          cls: 'text-gray-400 text-xs'
        },
      ];

      cells.forEach(({ text, cls }) => {
        const td = document.createElement('td');
        td.className = `px-6 py-4 ${cls}`;
        td.textContent = text || '—';
        tr.appendChild(td);
      });

      // Status badge
      const tdStatus = document.createElement('td');
      tdStatus.className = 'px-6 py-4';
      const badge = document.createElement('span');
      badge.className = `px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${statusBadgeClass(app.status)}`;
      badge.textContent = app.status || 'pending';
      tdStatus.appendChild(badge);
      tr.appendChild(tdStatus);

      tbody.appendChild(tr);
    });

  } catch (err) {
    loadingEl.innerHTML = `<p class="text-red-500 text-center">Failed to load applications: ${err.message}</p>`;
  }
}

loadApplications();
