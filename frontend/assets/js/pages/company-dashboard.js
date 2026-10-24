/**
 * company-dashboard.js
 * Page: frontend/pages/company/dashboard.html
 */

authGuard('company');
populateUserInfo();

// ── Stats ─────────────────────────────────────────────────────
async function loadStats() {
  try {
    const s = await api.get('/api/applications/dashboard/stats');
    document.getElementById('stat-jobs').textContent         = s.total_jobs         ?? 0;
    document.getElementById('stat-applications').textContent = s.total_applications ?? 0;
    document.getElementById('stat-shortlisted').textContent  = s.shortlisted        ?? 0;
    document.getElementById('stat-pending').textContent      = s.pending            ?? 0;
  } catch { /* non-critical */ }
}

// ── My Jobs ───────────────────────────────────────────────────
async function loadMyJobs() {
  const container = document.getElementById('my-jobs');
  container.innerHTML = '<p class="text-gray-400 text-sm">Loading…</p>';

  try {
    const jobs = await api.get('/api/jobs/my');

    container.innerHTML = '';

    if (!jobs.length) {
      container.innerHTML = '<p class="text-gray-400 text-sm">No jobs posted yet. <a href="post-job.html" class="text-blue-500 hover:underline">Post your first job →</a></p>';
      return;
    }

    jobs.forEach(job => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3 border border-gray-200 dark:border-gray-600';

      const info = document.createElement('div');

      const title = document.createElement('p');
      title.className = 'font-medium text-gray-800 dark:text-white';
      title.textContent = job.title;

      const meta = document.createElement('p');
      meta.className = 'text-xs text-gray-400 mt-0.5';
      meta.textContent = `${job.location}  ·  ${job.application_count} applicant${job.application_count !== 1 ? 's' : ''}`;

      info.appendChild(title);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'flex gap-2';

      const viewBtn = document.createElement('a');
      viewBtn.href = `applicants.html?jobId=${job.id}`;
      viewBtn.className = 'text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded transition';
      viewBtn.textContent = 'Applicants';

      const delBtn = document.createElement('button');
      delBtn.className = 'text-xs bg-red-100 hover:bg-red-200 text-red-600 px-3 py-1.5 rounded transition';
      delBtn.textContent = 'Delete';
      delBtn.dataset.jobId = job.id;
      delBtn.addEventListener('click', () => deleteJob(job.id, row));

      actions.appendChild(viewBtn);
      actions.appendChild(delBtn);

      row.appendChild(info);
      row.appendChild(actions);
      container.appendChild(row);
    });

  } catch (err) {
    container.innerHTML = `<p class="text-red-400 text-sm">Failed to load jobs: ${err.message}</p>`;
  }
}

async function deleteJob(jobId, rowEl) {
  if (!confirm('Delete this job? This cannot be undone.')) return;
  try {
    await api.delete(`/api/jobs/${jobId}`);
    rowEl.remove();
    loadStats(); // refresh counts
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ── Init ──────────────────────────────────────────────────────
loadStats();
loadMyJobs();
