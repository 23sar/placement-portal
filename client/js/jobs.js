const API_BASE = 'http://localhost:5000';

/** Return the stored token with Bearer prefix for Authorization header */
function getAuthHeader() {
  const token = localStorage.getItem('token');
  return token ? `Bearer ${token}` : '';
}

/** All raw job data for client-side filtering */
let allJobs = [];

async function loadJobs() {
  const container = document.getElementById('jobs');
  if (!container) return;

  container.innerHTML = '<p class="col-span-2 text-gray-500 text-center py-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading jobs...</p>';

  try {
    const res = await fetch(`${API_BASE}/api/jobs`, {
      headers: { Authorization: getAuthHeader() }
    });

    if (res.status === 401) {
      // Session expired
      logout();
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    allJobs = await res.json();
    renderJobs(allJobs);

  } catch (err) {
    container.innerHTML = `
      <p class="col-span-2 text-red-500 text-center py-4">
        <i class="fa-solid fa-triangle-exclamation mr-2"></i>
        Failed to load jobs. ${err.message || 'Please try again.'}
      </p>`;
    console.error('[loadJobs]', err);
  }
}

/** Filter displayed jobs by search input — purely client-side, no XSS risk */
function filterJobs() {
  const query = (document.getElementById('job-search')?.value || '').toLowerCase().trim();
  if (!query) {
    renderJobs(allJobs);
    return;
  }
  const filtered = allJobs.filter(j =>
    j.title.toLowerCase().includes(query) ||
    (j.company || '').toLowerCase().includes(query) ||
    (j.location || '').toLowerCase().includes(query)
  );
  renderJobs(filtered);
}

/**
 * Render job cards using DOM APIs — NO innerHTML with untrusted data.
 * This prevents stored XSS from malicious job titles/locations.
 */
function renderJobs(jobs) {
  const container = document.getElementById('jobs');
  if (!container) return;

  container.innerHTML = '';

  if (!jobs || jobs.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'col-span-2 text-gray-500 text-center py-8';
    msg.textContent = 'No jobs available at the moment.';
    container.appendChild(msg);
    return;
  }

  jobs.forEach(job => {
    const card = document.createElement('div');
    card.className = 'border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow hover:shadow-md transition bg-white dark:bg-gray-700';

    // --- All text set via textContent — safe from XSS ---

    const title = document.createElement('h3');
    title.className = 'text-lg font-bold text-gray-800 dark:text-white';
    title.textContent = job.title;

    const company = document.createElement('p');
    company.className = 'text-gray-500 dark:text-gray-300 text-sm mt-1';
    company.textContent = job.company || 'Company';

    const location = document.createElement('p');
    location.className = 'text-sm text-gray-400 dark:text-gray-400 mt-1';
    // Icon created safely
    const locIcon = document.createElement('i');
    locIcon.className = 'fa-solid fa-location-dot mr-1';
    location.appendChild(locIcon);
    location.appendChild(document.createTextNode(job.location || 'Location not specified'));

    const stipend = document.createElement('p');
    stipend.className = 'text-sm text-green-600 font-semibold mt-1';
    stipend.textContent = job.stipend
      ? `₹${Number(job.stipend).toLocaleString('en-IN')}/month`
      : 'Stipend: Not specified';

    const applyBtn = document.createElement('button');
    applyBtn.className = 'mt-3 bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded text-sm transition';
    applyBtn.textContent = 'Apply';
    // Store job ID as data attribute — never in inline onclick
    applyBtn.dataset.jobId = job.id;
    applyBtn.addEventListener('click', () => applyJob(job.id, applyBtn));

    card.appendChild(title);
    card.appendChild(company);
    card.appendChild(location);
    card.appendChild(stipend);
    card.appendChild(applyBtn);

    container.appendChild(card);
  });
}

async function applyJob(jobId, btn) {
  if (!btn || btn.disabled) return;

  const originalText = btn.textContent;
  btn.textContent = 'Applying…';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/jobs/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: getAuthHeader()
      },
      body: JSON.stringify({ job_id: jobId })
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 409) {
      btn.textContent = 'Already Applied ✓';
      btn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
      btn.classList.add('bg-gray-400');
      return;
    }

    if (res.status === 401) {
      logout();
      return;
    }

    if (!res.ok) {
      throw new Error(data.error || `Server error ${res.status}`);
    }

    btn.textContent = 'Applied ✅';
    btn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
    btn.classList.add('bg-green-500');

  } catch (err) {
    btn.textContent = originalText;
    btn.disabled = false;
    alert(`Application failed: ${err.message}`);
    console.error('[applyJob]', err);
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

/** Populate user info in the sidebar and load dashboard stats */
async function initDashboard() {
  const userStr = localStorage.getItem('user');
  if (!userStr) return;

  try {
    const user = JSON.parse(userStr);
    const nameEl = document.getElementById('user-name');
    const roleEl = document.getElementById('user-role');
    if (nameEl) nameEl.textContent = user.name || '—';
    if (roleEl) roleEl.textContent = user.role || '—';
  } catch (_) {}

  // Load real dashboard stats
  try {
    const res = await fetch(`${API_BASE}/api/applications/dashboard/stats`, {
      headers: { Authorization: getAuthHeader() }
    });

    if (res.ok) {
      const stats = await res.json();
      const totalEl = document.getElementById('stat-total');
      const shortEl = document.getElementById('stat-shortlisted');
      const rejEl   = document.getElementById('stat-rejected');

      if (totalEl) totalEl.textContent = stats.total ?? '0';
      if (shortEl) shortEl.textContent = stats.shortlisted ?? '0';
      if (rejEl)   rejEl.textContent   = stats.rejected ?? '0';
    }
  } catch (err) {
    console.warn('[initDashboard] Stats fetch failed:', err.message);
  }
}

// Guard — redirect to login if not authenticated
(function authGuard() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
  }
})();

// Run on page load
initDashboard();
loadJobs();