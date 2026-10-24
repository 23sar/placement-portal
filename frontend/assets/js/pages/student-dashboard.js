/**
 * student-dashboard.js
 * Page: frontend/pages/student/dashboard.html
 */

// ── Guard ─────────────────────────────────────────────────────
authGuard('student');
populateUserInfo();

// ── State ─────────────────────────────────────────────────────
let allJobs = [];

// ── Stats ─────────────────────────────────────────────────────
async function loadStats() {
  try {
    const stats = await api.get('/api/applications/dashboard/stats');
    document.getElementById('stat-total').textContent       = stats.total       ?? 0;
    document.getElementById('stat-shortlisted').textContent = stats.shortlisted ?? 0;
    document.getElementById('stat-rejected').textContent    = stats.rejected    ?? 0;
  } catch {
    // Non-critical — leave placeholders
  }
}

// ── Jobs ──────────────────────────────────────────────────────
async function loadJobs() {
  const container = document.getElementById('jobs');
  container.innerHTML = '<p class="col-span-2 text-gray-400 text-center py-6">Loading jobs…</p>';

  try {
    allJobs = await api.get('/api/jobs');
    renderJobs(allJobs);
  } catch (err) {
    container.innerHTML = `<p class="col-span-2 text-red-400 text-center py-6">Failed to load jobs: ${err.message}</p>`;
  }
}

function filterJobs() {
  const q = (document.getElementById('job-search').value || '').toLowerCase().trim();
  renderJobs(q ? allJobs.filter(j =>
    j.title.toLowerCase().includes(q) ||
    (j.company || '').toLowerCase().includes(q) ||
    (j.location || '').toLowerCase().includes(q)
  ) : allJobs);
}

/**
 * Render job cards using DOM APIs — never innerHTML with server data.
 */
function renderJobs(jobs) {
  const container = document.getElementById('jobs');
  container.innerHTML = '';

  if (!jobs.length) {
    const p = document.createElement('p');
    p.className = 'col-span-2 text-gray-400 text-center py-8';
    p.textContent = 'No jobs available right now.';
    container.appendChild(p);
    return;
  }

  jobs.forEach(job => {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4 shadow hover:shadow-md transition';

    const title = document.createElement('h3');
    title.className = 'text-base font-bold text-gray-800 dark:text-white';
    title.textContent = job.title;

    const company = document.createElement('p');
    company.className = 'text-sm text-gray-500 dark:text-gray-300 mt-1';
    company.textContent = job.company || '—';

    const meta = document.createElement('div');
    meta.className = 'flex items-center gap-4 mt-2 text-xs text-gray-400';

    const loc = document.createElement('span');
    loc.textContent = '📍 ' + (job.location || '—');

    const pay = document.createElement('span');
    pay.className = 'text-green-600 font-semibold';
    pay.textContent = job.stipend
      ? `₹${Number(job.stipend).toLocaleString('en-IN')}/mo`
      : 'Unpaid';

    meta.appendChild(loc);
    meta.appendChild(pay);

    const btn = document.createElement('button');
    btn.className = 'mt-3 w-full bg-blue-500 hover:bg-blue-600 text-white text-sm py-1.5 rounded transition';
    btn.textContent = 'Apply';
    btn.dataset.jobId = job.id;
    btn.addEventListener('click', () => applyJob(job.id, btn));

    card.appendChild(title);
    card.appendChild(company);
    card.appendChild(meta);
    card.appendChild(btn);
    container.appendChild(card);
  });
}

async function applyJob(jobId, btn) {
  if (btn.disabled) return;
  const prev = btn.textContent;
  btn.textContent = 'Applying…';
  btn.disabled = true;

  try {
    await api.post('/api/jobs/apply', { job_id: jobId });
    btn.textContent = 'Applied ✅';
    btn.classList.replace('bg-blue-500', 'bg-green-500');
    btn.classList.replace('hover:bg-blue-600', 'hover:bg-green-600');
  } catch (err) {
    if (err.message.includes('already applied')) {
      btn.textContent = 'Already Applied';
      btn.classList.replace('bg-blue-500', 'bg-gray-400');
      btn.disabled = true;
    } else {
      btn.textContent = prev;
      btn.disabled = false;
      alert(err.message);
    }
  }
}

// ── Init ──────────────────────────────────────────────────────
loadStats();
loadJobs();
