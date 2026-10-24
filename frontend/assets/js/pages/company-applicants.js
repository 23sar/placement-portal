/**
 * company-applicants.js
 * Page: frontend/pages/company/applicants.html
 *
 * Reads ?jobId=X from the URL to know which job's applicants to show.
 */

authGuard('company');
populateUserInfo();

const params = new URLSearchParams(window.location.search);
const jobId  = params.get('jobId');

if (!jobId) {
  document.getElementById('page-title').textContent = 'No job selected.';
}

function statusBadgeClass(status) {
  return {
    pending:     'bg-yellow-100 text-yellow-800',
    shortlisted: 'bg-green-100  text-green-800',
    rejected:    'bg-red-100    text-red-800',
  }[status] || 'bg-gray-100 text-gray-800';
}

async function loadApplicants() {
  if (!jobId) return;

  const loadingEl = document.getElementById('loading');
  const emptyEl   = document.getElementById('empty-state');
  const tableEl   = document.getElementById('table-container');
  const tbody     = document.getElementById('applicants-body');
  const titleEl   = document.getElementById('page-title');

  try {
    const applicants = await api.get(`/api/jobs/applicants/${jobId}`);

    // Also fetch job title for heading
    try {
      const job = await api.get(`/api/jobs/${jobId}`);
      titleEl.textContent = `Applicants — ${job.title}`;
    } catch { /* title stays generic */ }

    loadingEl.classList.add('hidden');

    if (!applicants.length) {
      emptyEl.classList.remove('hidden');
      return;
    }

    tableEl.classList.remove('hidden');

    applicants.forEach((app, i) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700 transition';
      tr.dataset.applicationId = app.application_id;

      // #
      const tdIdx = document.createElement('td');
      tdIdx.className = 'px-6 py-4 text-gray-400';
      tdIdx.textContent = i + 1;

      // Name
      const tdName = document.createElement('td');
      tdName.className = 'px-6 py-4 font-medium text-gray-800 dark:text-white';
      tdName.textContent = app.name;

      // Email
      const tdEmail = document.createElement('td');
      tdEmail.className = 'px-6 py-4 text-gray-600 dark:text-gray-300';
      tdEmail.textContent = app.email;

      // Applied date
      const tdDate = document.createElement('td');
      tdDate.className = 'px-6 py-4 text-gray-400 text-xs';
      tdDate.textContent = app.created_at
        ? new Date(app.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
        : '—';

      // Status badge
      const tdStatus = document.createElement('td');
      tdStatus.className = 'px-6 py-4';
      const badge = document.createElement('span');
      badge.id = `badge-${app.application_id}`;
      badge.className = `px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${statusBadgeClass(app.status)}`;
      badge.textContent = app.status;
      tdStatus.appendChild(badge);

      // Actions
      const tdActions = document.createElement('td');
      tdActions.className = 'px-6 py-4';
      const actDiv = document.createElement('div');
      actDiv.className = 'flex gap-2';

      [
        { label: 'Shortlist', status: 'shortlisted', cls: 'bg-green-500 hover:bg-green-600 text-white' },
        { label: 'Reject',    status: 'rejected',    cls: 'bg-red-500   hover:bg-red-600   text-white' },
      ].forEach(({ label, status, cls }) => {
        const btn = document.createElement('button');
        btn.className = `text-xs px-3 py-1.5 rounded transition ${cls}`;
        btn.textContent = label;
        btn.addEventListener('click', () => updateStatus(app.application_id, status));
        actDiv.appendChild(btn);
      });

      tdActions.appendChild(actDiv);

      tr.appendChild(tdIdx);
      tr.appendChild(tdName);
      tr.appendChild(tdEmail);
      tr.appendChild(tdDate);
      tr.appendChild(tdStatus);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });

  } catch (err) {
    loadingEl.innerHTML = `<p class="text-red-400 text-center">Failed to load applicants: ${err.message}</p>`;
  }
}

async function updateStatus(applicationId, status) {
  try {
    await api.patch(`/api/applications/${applicationId}/status`, { status });
    // Update badge in-place — no full reload needed
    const badge = document.getElementById(`badge-${applicationId}`);
    if (badge) {
      badge.className = `px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${statusBadgeClass(status)}`;
      badge.textContent = status;
    }
  } catch (err) {
    alert('Update failed: ' + err.message);
  }
}

loadApplicants();
