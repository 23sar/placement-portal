/* Placement Portal Unified Role-Aware Dashboard
 * Roles supported:
 *   - student: job search, applications, personal stats
 *   - company: company postings, approval status, rejection reasons, editing & resubmission, applicants, availability
 *   - admin:   Placement Cell console (stats, pending approvals, direct job posting, admin job editing, all jobs management)
 */

if (!session.token()) location.href = 'login.html';
const user = session.user() || {};
const isAdmin = user.role === 'admin';
const isCo = user.role === 'company';
const isStudent = user.role === 'student';

let jobs = [], apps = [], pendingQueue = [], allJobsCache = [];

// Helpers
const money = v => (v !== null && v !== undefined && v !== '') ? '₹' + Number(v).toLocaleString('en-IN') + ' / mo' : 'Stipend not listed';
const fmtDate = d => {
  if (!d) return 'None';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? esc(String(d ?? '')) : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtDateTimeInput = d => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 16);
};
const chip = s => `<span class="chip ${esc(s || '')}">${esc(String(s ?? '').replace(/_/g, ' '))}</span>`;
const empty = (msg, btn = '') => `<div class="empty"><p class="muted">${esc(msg)}</p>${btn}</div>`;
const formatResumeSizeForApply = bytes => {
  const n = Number(bytes || 0);
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};
const safeDownloadNameForApplication = name => {
  const base = String(name || 'resume.pdf').replace(/[\\/\u0000-\u001f\u007f]/g, '_').replace(/\.\.+/g, '.');
  return base.toLowerCase().endsWith('.pdf') ? base.slice(0, 255) : 'resume.pdf';
};

// Data Loaders
const loadJobs = async () => { jobs = await api('/api/jobs'); };
const loadApps = async () => { apps = await api('/api/applications/my'); };
const loadCompanyJobs = async () => { jobs = await api('/api/jobs/my'); };
const loadPendingQueue = async () => { pendingQueue = await api('/api/jobs/pending'); };
const loadAllJobs = async () => { allJobsCache = await api('/api/jobs/all'); };

async function loadStats() {
  try {
    const s = await api('/api/applications/dashboard/stats');
    let items = [];
    if (isAdmin) {
      items = [
        ['Awaiting Approval', s.total_jobs_awaiting_approval ?? s.pending_approvals ?? 0],
        ['Approved Jobs', s.total_approved_jobs ?? s.approved_jobs ?? 0],
        ['Open Approved', s.open_approved_jobs ?? 0],
        ['Active Companies', s.total_active_companies ?? s.active_companies ?? 0],
        ['Total Applications', s.total_applications ?? 0],
      ];
    } else if (isCo) {
      items = [
        ['Jobs Posted', s.total_jobs ?? 0],
        ['Applications', s.total_applications ?? 0],
        ['Pending Review', s.pending ?? 0],
        ['Shortlisted', s.shortlisted ?? 0],
      ];
    } else {
      items = [
        ['Applied', s.total ?? 0],
        ['Pending', s.pending ?? 0],
        ['Shortlisted', s.shortlisted ?? 0],
        ['Rejected', s.rejected ?? 0],
      ];
    }
    $('#stats').innerHTML = items
      .map(([l, v]) => `<div class="stat"><b>${Number(v || 0)}</b><span>${l}</span></div>`)
      .join('');
  } catch (err) {
    console.error('Stats error:', err);
    $('#stats').innerHTML = '';
  }
}

/* =============================================================================
 * 1. STUDENT VIEWS
 * ============================================================================= */
async function viewBrowse(el) {
  await Promise.all([loadJobs(), loadApps()]);
  el.innerHTML = `
    <input class="search" id="q" placeholder="Search by title, company, or city..." aria-label="Search jobs">
    <div id="list" class="grid"></div>
  `;
  const draw = () => {
    const q = ($('#q')?.value || '').toLowerCase();
    const appliedIds = new Set(apps.map(a => a.job_id));
    const list = jobs.filter(j => [j.title, j.company, j.location].join(' ').toLowerCase().includes(q));

    $('#list').innerHTML = list.length ? list.map(j => `
      <article class="card">
        <h3>${esc(j.title)}</h3>
        <p class="muted">${esc(j.company || j.recruiting_organization)}</p>
        <div class="meta">
          <span>${esc(j.location)}</span>
          <span>${money(j.stipend)}</span>
          ${j.application_deadline ? `<span>Deadline: ${fmtDate(j.application_deadline)}</span>` : ''}
        </div>
        <p class="desc">${esc(j.description)}</p>
        ${j.eligibility_criteria ? `<p class="help"><b>Eligibility:</b> ${esc(j.eligibility_criteria)}</p>` : ''}
        <button class="btn" data-apply="${j.id}" ${appliedIds.has(j.id) ? 'disabled' : ''}>
          ${appliedIds.has(j.id) ? 'Applied' : 'Apply'}
        </button>
      </article>
    `).join('') : empty('No jobs match your search.');
  };
  $('#q').oninput = draw;
  draw();
}

async function viewApps(el) {
  await loadApps();
  el.innerHTML = apps.length ? apps.map(a => `
    <section class="row">
      <div class="row-h">
        <div>
          <h3>${esc(a.title)}</h3>
          <p class="muted">${esc(a.company || a.recruiting_organization)}, ${esc(a.location)}</p>
          ${a.has_resume ? `
            <div style="margin-top: 0.35rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span class="muted text-sm"><b>Submitted resume:</b> ${esc(a.resume_name)}</span>
              <button class="btn sm ghost" data-download-app-resume="${a.id}" data-resumename="${esc(a.resume_name || 'resume.pdf')}" style="padding: 2px 8px; font-size: 0.8rem;">Download Snapshot</button>
            </div>
          ` : '<p class="muted" style="margin-top: 0.35rem; font-size: 0.85rem;">No resume attached</p>'}
        </div>
        <div class="meta">
          <span>Applied ${fmtDate(a.created_at)}</span>
        </div>
        ${chip(a.status)}
      </div>
    </section>
  `).join('') : empty("You haven't applied to anything yet.", '<button class="btn" data-view="jobs">Browse jobs</button>');
}

/* =============================================================================
 * 2. COMPANY VIEWS (WITH EDITING & REJECTION RESUBMISSION)
 * ============================================================================= */
async function viewCompanyJobs(el) {
  await loadCompanyJobs();
  el.innerHTML = jobs.length ? jobs.map(j => {
    const isOwner = j.posting_source === 'company';
    const isRejected = j.approval_status === 'rejected';
    const isOpen = j.job_status === 'open';
    const appCount = Number(j.application_count || 0);

    return `
      <section class="row" data-job="${j.id}">
        <div class="row-h">
          <div>
            <h3>${esc(j.title)}</h3>
            <div class="meta">
              <span>${esc(j.location)}</span>
              <span>${money(j.stipend)}</span>
              ${j.application_deadline ? `<span>Deadline: ${fmtDate(j.application_deadline)}</span>` : ''}
              <span>${appCount} Applicants</span>
            </div>
          </div>
          <div class="meta">
            ${chip(j.approval_status)}
            ${chip(j.job_status)}
          </div>
          <div class="acts">
            <button class="btn ghost sm" data-ap="${j.id}">Applicants (${appCount})</button>
            ${isOwner ? `
              <button class="btn sm" data-edit-co="${j.id}">Edit & Resubmit</button>
              <button class="btn ghost sm" data-status-toggle="${j.id}" data-target-status="${isOpen ? 'closed' : 'open'}">
                ${isOpen ? 'Close' : 'Reopen'}
              </button>
              ${appCount > 0 ? `
                <button class="btn danger sm" disabled title="Protected: cannot delete job with existing applications">Delete</button>
              ` : `
                <button class="btn danger sm" data-del="${j.id}">Delete</button>
              `}
            ` : '<span class="help">Placement Cell Managed</span>'}
          </div>
        </div>

        ${isRejected && j.rejection_reason ? `
          <div class="rejection-box" id="rej-callout-${j.id}">
            <b>Rejection Reason:</b> ${esc(j.rejection_reason)}
            <p class="help">Use the "Edit & Resubmit" button above to address this feedback and request fresh Placement Cell review.</p>
          </div>
        ` : ''}

        <!-- Company Edit & Resubmission Drawer -->
        <div class="edit-box-co" id="edit-box-co-${j.id}" style="display:none; margin-top:1rem; border-top:1px solid var(--line); padding-top:1rem;">
          <form id="form-edit-co-${j.id}" class="box" style="max-width:100%; border:none; padding:0; background:transparent;">
            <h4 style="margin:0 0 1rem 0;">Edit Posting & Resubmit for Review</h4>

            <label for="ed-t-${j.id}">Job Title *</label>
            <input id="ed-t-${j.id}" name="title" required value="${esc(j.title)}">

            <label for="ed-l-${j.id}">Location *</label>
            <input id="ed-l-${j.id}" name="location" required value="${esc(j.location)}">

            <label for="ed-s-${j.id}">Monthly Stipend (₹, optional)</label>
            <input id="ed-s-${j.id}" name="stipend" type="number" min="0" value="${j.stipend !== null && j.stipend !== undefined ? esc(j.stipend) : ''}">

            <label for="ed-dl-${j.id}">Application Deadline (optional)</label>
            <input id="ed-dl-${j.id}" name="application_deadline" type="datetime-local" value="${fmtDateTimeInput(j.application_deadline)}">

            <label for="ed-ec-${j.id}">Eligibility Criteria (optional)</label>
            <input id="ed-ec-${j.id}" name="eligibility_criteria" value="${esc(j.eligibility_criteria || '')}">

            <label for="ed-d-${j.id}">Job Description *</label>
            <textarea id="ed-d-${j.id}" name="description" rows="5" required>${esc(j.description)}</textarea>

            <p class="err" id="edit-co-err-${j.id}"></p>
            <div class="acts" style="margin-top:1rem;">
              <button class="btn" type="submit" id="btn-save-co-${j.id}">Save & Resubmit</button>
              <button class="btn ghost" type="button" data-cancel-co-edit="${j.id}">Cancel</button>
            </div>
          </form>
        </div>

        <div class="panel" hidden></div>
      </section>
    `;
  }).join('') : empty("You haven't posted any jobs yet.", '<button class="btn" data-view="post">Post a Job</button>');

  // Attach submit listeners & safe form-value assignments for each edit form
  jobs.forEach(j => {
    const editForm = $(`#form-edit-co-${j.id}`);
    if (editForm) {
      const tInput = $(`#ed-t-${j.id}`);
      const lInput = $(`#ed-l-${j.id}`);
      const dInput = $(`#ed-d-${j.id}`);
      const ecInput = $(`#ed-ec-${j.id}`);
      if (tInput && j.title !== undefined) tInput.value = j.title;
      if (lInput && j.location !== undefined) lInput.value = j.location;
      if (dInput && j.description !== undefined) dInput.value = j.description;
      if (ecInput && j.eligibility_criteria !== undefined) ecInput.value = j.eligibility_criteria || '';

      editForm.onsubmit = async e => {
        e.preventDefault();
        const btn = $(`#btn-save-co-${j.id}`);
        const errEl = $(`#edit-co-err-${j.id}`);
        btn.disabled = true;
        btn.textContent = 'Resubmitting...';
        errEl.textContent = '';

        const payload = {
          title: $(`#ed-t-${j.id}`).value.trim(),
          location: $(`#ed-l-${j.id}`).value.trim(),
          description: $(`#ed-d-${j.id}`).value.trim(),
        };

        const stipendVal = $(`#ed-s-${j.id}`).value;
        payload.stipend = stipendVal ? Number(stipendVal) : null;

        const deadlineVal = $(`#ed-dl-${j.id}`).value;
        payload.application_deadline = deadlineVal ? deadlineVal : null;

        const eligVal = $(`#ed-ec-${j.id}`).value.trim();
        payload.eligibility_criteria = eligVal ? eligVal : null;

        try {
          await api(`/api/jobs/${j.id}`, { method: 'PATCH', body: payload });
          toast('Job updated and resubmitted for Placement Cell approval.');
          show('jobs');
        } catch (err) {
          errEl.textContent = err.message;
          btn.disabled = false;
          btn.textContent = 'Save & Resubmit';
        }
      };
    }
  });
}

function viewCompanyPost(el) {
  el.innerHTML = `
    <form class="box" id="post-job-form">
      <label for="t">Job Title *</label>
      <input id="t" name="title" required placeholder="e.g. Fullstack Engineer">

      <label for="l">Location *</label>
      <input id="l" name="location" required placeholder="e.g. Bengaluru, Remote">

      <label for="s">Monthly Stipend (₹, optional)</label>
      <input id="s" name="stipend" type="number" min="0" placeholder="e.g. 35000">

      <label for="ad">Application Deadline (optional)</label>
      <input id="ad" name="application_deadline" type="datetime-local">

      <label for="ec">Eligibility Criteria (optional)</label>
      <input id="ec" name="eligibility_criteria" placeholder="e.g. B.Tech CS/IT with CGPA >= 7.5">

      <label for="d">Job Description *</label>
      <textarea id="d" name="description" rows="5" required placeholder="Outline key responsibilities and skill requirements..."></textarea>

      <p class="err" id="perr"></p>
      <button class="btn" type="submit" id="btn-post">Submit for Placement Cell Approval</button>
    </form>
  `;

  $('#post-job-form').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#btn-post');
    const errEl = $('#perr');
    btn.disabled = true;
    btn.textContent = 'Submitting...';
    errEl.textContent = '';

    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    if (!body.stipend) delete body.stipend;
    if (!body.application_deadline) delete body.application_deadline;

    try {
      await api('/api/jobs/create', { method: 'POST', body });
      toast('Job submitted for Placement Cell approval.');
      show('jobs');
    } catch (err) {
      errEl.textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Submit for Placement Cell Approval';
    }
  };
}

/* =============================================================================
 * 3. ADMINISTRATOR (PLACEMENT CELL) VIEWS (WITH ADMIN JOB EDITING)
 * ============================================================================= */

/**
 * Admin View: Overview & Quick Navigation
 */
async function viewAdminOverview(el) {
  el.innerHTML = `
    <div class="two" style="padding:0; max-width:100%; margin-bottom: 2rem;">
      <section>
        <h2>Placement Cell Management</h2>
        <p class="muted">Review company job submissions, publish direct campus drives, and manage postings across all organizations.</p>
        <div class="acts" style="margin-top: 1rem; flex-wrap: wrap;">
          <button class="btn" data-view="pending">Review Pending Approvals</button>
          <button class="btn ghost" data-view="post">Post Placement Drive Job</button>
          <button class="btn ghost" data-view="all">Manage All Postings</button>
        </div>
      </section>
      <section>
        <h2>System Summary</h2>
        <ul style="line-height: 1.8;">
          <li>Company postings require administrator approval before student visibility.</li>
          <li>Substantive edits to company jobs automatically require fresh approval.</li>
          <li>Direct Placement Cell jobs are immediately approved and published.</li>
          <li>Closed or expired jobs never accept applications.</li>
          <li>Jobs with student applications cannot be permanently deleted.</li>
        </ul>
      </section>
    </div>
    <div id="overview-pending-section"></div>
  `;

  try {
    await loadPendingQueue();
    const prevEl = $('#overview-pending-section');
    if (pendingQueue.length) {
      prevEl.innerHTML = `
        <div class="row-h" style="margin-bottom: 1rem;">
          <h3>Urgent: ${pendingQueue.length} Job(s) Awaiting Review</h3>
          <button class="btn sm ghost" data-view="pending">View All Pending</button>
        </div>
        <div class="grid">
          ${pendingQueue.slice(0, 3).map(j => `
            <div class="card">
              <h3>${esc(j.title)}</h3>
              <p class="muted">${esc(j.submitting_company_name || j.recruiting_organization)}</p>
              <div class="meta">
                <span>${esc(j.location)}</span>
                <span>Submitted ${fmtDate(j.created_at)}</span>
              </div>
              <button class="btn sm" data-view="pending">Review in Queue</button>
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (err) {
    console.error('Error fetching preview:', err);
  }
}

/**
 * Admin View: Pending Approvals Queue
 */
async function viewPendingApprovals(el) {
  await loadPendingQueue();

  if (!pendingQueue.length) {
    el.innerHTML = empty('No jobs are currently awaiting Placement Cell approval.');
    return;
  }

  el.innerHTML = pendingQueue.map(j => `
    <section class="row" data-job="${j.id}">
      <div class="row-h">
        <div>
          <h3>${esc(j.title)}</h3>
          <p class="muted">
            <b>Organization:</b> ${esc(j.recruiting_organization)} &bull;
            <b>Submitted By:</b> ${esc(j.submitting_company_name || 'Registered Company')} (${esc(j.submitting_company_email || 'N/A')})
          </p>
          <div class="meta" style="margin-top: .4rem;">
            <span>${esc(j.location)}</span>
            <span>${money(j.stipend)}</span>
            <span>Submitted: ${fmtDate(j.created_at)}</span>
            ${j.application_deadline ? `<span>Deadline: ${fmtDate(j.application_deadline)}</span>` : '<span class="muted">No deadline</span>'}
          </div>
        </div>
        <div class="meta">
          ${chip(j.approval_status)}
        </div>
        <div class="acts">
          <button class="btn sm" data-approve="${j.id}" data-rev="${j.revision || 1}">Approve</button>
          <button class="btn danger sm" data-reject-toggle="${j.id}">Reject</button>
        </div>
      </div>

      <div style="margin-top: .8rem;">
        <p class="desc" style="-webkit-line-clamp: initial;">${esc(j.description)}</p>
        ${j.eligibility_criteria ? `<p class="help"><b>Eligibility Criteria:</b> ${esc(j.eligibility_criteria)}</p>` : ''}
      </div>

      <!-- Inline Rejection Form Drawer -->
      <div class="reject-box" id="reject-box-${j.id}" style="display: none;">
        <label for="reject-reason-${j.id}" style="margin:0; font-weight:600;">Rejection Reason (Required for Submitting Company):</label>
        <textarea id="reject-reason-${j.id}" placeholder="Explain clearly why this job posting was rejected (e.g. insufficient compensation, missing criteria)..."></textarea>
        <div class="acts">
          <button class="btn danger sm" data-reject-submit="${j.id}" data-rev="${j.revision || 1}">Confirm Rejection</button>
          <button class="btn ghost sm" data-reject-cancel="${j.id}">Cancel</button>
        </div>
      </div>
    </section>
  `).join('');
}

/**
 * Admin View: Direct Placement Cell Job Creation
 */
async function viewAdminPostJob(el) {
  let companies = [];
  try {
    companies = await api('/api/jobs/companies');
  } catch (err) {
    console.warn('Could not load company list:', err.message);
  }

  el.innerHTML = `
    <form class="box" id="admin-post-form" style="max-width: 620px;">
      <h3 style="margin-bottom: 1rem;">Direct Placement Cell Job Publication</h3>

      <label for="adm-type">Organization Type</label>
      <select id="adm-type">
        <option value="external">External Organization (No portal account)</option>
        <option value="registered">Registered Company on Portal</option>
      </select>

      <div id="company-picker-wrap" style="display: none; margin-top: .5rem;">
        <label for="adm-company">Registered Company *</label>
        <select id="adm-company">
          <option value="">-- Choose Registered Company --</option>
          ${companies.map(c => `<option value="${c.id}" data-name="${esc(c.name)}">${esc(c.name)} (${esc(c.email)})</option>`).join('')}
        </select>
      </div>

      <label for="adm-org">Recruiting Organization Name *</label>
      <input id="adm-org" name="recruiting_organization" required placeholder="e.g. Tata Consultancy Services, ISRO">

      <label for="adm-title">Job Title *</label>
      <input id="adm-title" name="title" required placeholder="e.g. Graduate Engineering Trainee">

      <label for="adm-loc">Location *</label>
      <input id="adm-loc" name="location" required placeholder="e.g. Pan India / Remote / Mumbai">

      <label for="adm-stipend">Compensation / Stipend (₹, optional)</label>
      <input id="adm-stipend" name="stipend" type="number" min="0" placeholder="e.g. 50000">

      <label for="adm-dl">Application Deadline (optional)</label>
      <input id="adm-dl" name="application_deadline" type="datetime-local">

      <label for="adm-ec">Eligibility Criteria (optional)</label>
      <input id="adm-ec" name="eligibility_criteria" placeholder="e.g. All branches, >= 6.5 CGPA, no active backlogs">

      <label for="adm-desc">Job Description *</label>
      <textarea id="adm-desc" name="description" rows="5" required placeholder="Enter role overview, hiring workflow, and selection rounds..."></textarea>

      <p class="err" id="adm-err"></p>
      <button class="btn" type="submit" id="btn-adm-post">Publish Job Directly</button>
    </form>
  `;

  const typeSel = $('#adm-type');
  const coWrap = $('#company-picker-wrap');
  const coSel = $('#adm-company');
  const orgInput = $('#adm-org');

  typeSel.onchange = () => {
    if (typeSel.value === 'registered') {
      coWrap.style.display = 'block';
    } else {
      coWrap.style.display = 'none';
      coSel.value = '';
    }
  };

  coSel.onchange = () => {
    const opt = coSel.selectedOptions[0];
    if (opt && opt.dataset.name) {
      orgInput.value = opt.dataset.name;
    }
  };

  $('#admin-post-form').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#btn-adm-post');
    const errEl = $('#adm-err');
    btn.disabled = true;
    btn.textContent = 'Publishing...';
    errEl.textContent = '';

    const payload = {
      title: $('#adm-title').value.trim(),
      description: $('#adm-desc').value.trim(),
      location: $('#adm-loc').value.trim(),
      recruiting_organization: orgInput.value.trim(),
    };

    if (typeSel.value === 'registered' && coSel.value) {
      payload.company_id = Number(coSel.value);
    }

    const stipendVal = $('#adm-stipend').value;
    if (stipendVal) payload.stipend = Number(stipendVal);

    const deadlineVal = $('#adm-dl').value;
    if (deadlineVal) payload.application_deadline = deadlineVal;

    const eligVal = $('#adm-ec').value.trim();
    if (eligVal) payload.eligibility_criteria = eligVal;

    try {
      await api('/api/jobs/create', { method: 'POST', body: payload });
      toast('Job published directly by Placement Cell!');
      show('all');
    } catch (err) {
      errEl.textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Publish Job Directly';
    }
  };
}

/**
 * Admin View: All Job Postings Management (with Placement Cell Job Editing)
 */
async function viewAllJobs(el) {
  await loadAllJobs();

  el.innerHTML = `
    <div class="filters">
      <input type="text" id="filter-q" placeholder="Search by title, organization..." style="min-width: 220px;">
      <select id="filter-approval">
        <option value="">All Approval States</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>
      <select id="filter-status">
        <option value="">All Availabilities</option>
        <option value="open">Open</option>
        <option value="closed">Closed</option>
      </select>
      <select id="filter-source">
        <option value="">All Sources</option>
        <option value="company">Company</option>
        <option value="placement_cell">Placement Cell</option>
      </select>
    </div>
    <div id="all-jobs-container"></div>
  `;

  const container = $('#all-jobs-container');

  const renderFilteredJobs = () => {
    const q = ($('#filter-q')?.value || '').toLowerCase();
    const appFilter = $('#filter-approval')?.value || '';
    const stFilter = $('#filter-status')?.value || '';
    const srcFilter = $('#filter-source')?.value || '';

    const list = allJobsCache.filter(j => {
      const matchQ = [j.title, j.recruiting_organization, j.location, j.creator_name].join(' ').toLowerCase().includes(q);
      const matchApp = !appFilter || j.approval_status === appFilter;
      const matchSt = !stFilter || j.job_status === stFilter;
      const matchSrc = !srcFilter || j.posting_source === srcFilter;
      return matchQ && matchApp && matchSt && matchSrc;
    });

    if (!list.length) {
      container.innerHTML = empty('No job postings match your filters.');
      return;
    }

    container.innerHTML = list.map(j => {
      const isOpen = j.job_status === 'open';
      const isRejected = j.approval_status === 'rejected';
      const isPlacementCell = j.posting_source === 'placement_cell';
      const appCount = Number(j.application_count || 0);

      return `
        <section class="row" data-job="${j.id}">
          <div class="row-h">
            <div>
              <h3>${esc(j.title)}</h3>
              <p class="muted">
                <b>Organization:</b> ${esc(j.recruiting_organization)} &bull;
                <b>Created By:</b> ${esc(j.creator_name || 'Placement Cell')} (${esc(j.posting_source.replace(/_/g, ' '))})
              </p>
              <div class="meta" style="margin-top: .4rem;">
                <span>${esc(j.location)}</span>
                <span>${money(j.stipend)}</span>
                <span>Created ${fmtDate(j.created_at)}</span>
                ${j.application_deadline ? `<span>Deadline: ${fmtDate(j.application_deadline)}</span>` : '<span class="muted">No deadline</span>'}
                <span>${appCount} Applications</span>
              </div>
            </div>
            <div class="meta">
              ${chip(j.posting_source)}
              ${chip(j.approval_status)}
              ${chip(j.job_status)}
            </div>
            <div class="acts">
              ${isPlacementCell ? `
                <button class="btn ghost sm" data-edit-admin="${j.id}">Edit</button>
              ` : ''}
              <button class="btn ghost sm" data-status-toggle="${j.id}" data-target-status="${isOpen ? 'closed' : 'open'}">
                ${isOpen ? 'Close' : 'Reopen'}
              </button>
              <button class="btn ghost sm" data-ap="${j.id}">
                Applicants (${appCount})
              </button>
              ${appCount > 0 ? `
                <button class="btn danger sm" disabled title="Protected: cannot delete job with existing applications">Delete</button>
              ` : `
                <button class="btn danger sm" data-del="${j.id}">Delete</button>
              `}
            </div>
          </div>

          ${isRejected && j.rejection_reason ? `
            <div class="rejection-box">
              <b>Rejection Reason:</b> ${esc(j.rejection_reason)}
              ${j.reviewer_name ? ` &bull; <i>Reviewed by ${esc(j.reviewer_name)} on ${fmtDate(j.reviewed_at)}</i>` : ''}
            </div>
          ` : ''}

          <!-- Admin Placement Cell Edit Drawer -->
          ${isPlacementCell ? `
            <div class="edit-box-admin" id="edit-box-admin-${j.id}" style="display:none; margin-top:1rem; border-top:1px solid var(--line); padding-top:1rem;">
              <form id="form-edit-admin-${j.id}" class="box" style="max-width:100%; border:none; padding:0; background:transparent;">
                <h4 style="margin: 0 0 1rem 0;">Edit Placement Cell Job</h4>

                <label for="adm-ed-org-${j.id}">Recruiting Organization *</label>
                <input id="adm-ed-org-${j.id}" name="recruiting_organization" required value="${esc(j.recruiting_organization)}">

                <label for="adm-ed-t-${j.id}">Job Title *</label>
                <input id="adm-ed-t-${j.id}" name="title" required value="${esc(j.title)}">

                <label for="adm-ed-l-${j.id}">Location *</label>
                <input id="adm-ed-l-${j.id}" name="location" required value="${esc(j.location)}">

                <label for="adm-ed-s-${j.id}">Monthly Stipend (₹, optional)</label>
                <input id="adm-ed-s-${j.id}" name="stipend" type="number" min="0" value="${j.stipend !== null && j.stipend !== undefined ? esc(j.stipend) : ''}">

                <label for="adm-ed-dl-${j.id}">Application Deadline (optional)</label>
                <input id="adm-ed-dl-${j.id}" name="application_deadline" type="datetime-local" value="${fmtDateTimeInput(j.application_deadline)}">

                <label for="adm-ed-ec-${j.id}">Eligibility Criteria (optional)</label>
                <input id="adm-ed-ec-${j.id}" name="eligibility_criteria" value="${esc(j.eligibility_criteria || '')}">

                <label for="adm-ed-d-${j.id}">Job Description *</label>
                <textarea id="adm-ed-d-${j.id}" name="description" rows="5" required>${esc(j.description)}</textarea>

                <p class="err" id="edit-adm-err-${j.id}"></p>
                <div class="acts" style="margin-top:1rem;">
                  <button class="btn" type="submit" id="btn-save-adm-${j.id}">Save Changes</button>
                  <button class="btn ghost" type="button" data-cancel-admin-edit="${j.id}">Cancel</button>
                </div>
              </form>
            </div>
          ` : ''}

          <div class="panel" hidden></div>
        </section>
      `;
    }).join('');

    // Attach submit listeners & safe form-value assignments for admin edit forms
    list.forEach(j => {
      const form = $(`#form-edit-admin-${j.id}`);
      if (form) {
        const orgInput = $(`#adm-ed-org-${j.id}`);
        const tInput = $(`#adm-ed-t-${j.id}`);
        const lInput = $(`#adm-ed-l-${j.id}`);
        const dInput = $(`#adm-ed-d-${j.id}`);
        const ecInput = $(`#adm-ed-ec-${j.id}`);
        if (orgInput && j.recruiting_organization !== undefined) orgInput.value = j.recruiting_organization;
        if (tInput && j.title !== undefined) tInput.value = j.title;
        if (lInput && j.location !== undefined) lInput.value = j.location;
        if (dInput && j.description !== undefined) dInput.value = j.description;
        if (ecInput && j.eligibility_criteria !== undefined) ecInput.value = j.eligibility_criteria || '';

        form.onsubmit = async e => {
          e.preventDefault();
          const btn = $(`#btn-save-adm-${j.id}`);
          const errEl = $(`#edit-adm-err-${j.id}`);
          btn.disabled = true;
          btn.textContent = 'Saving...';
          errEl.textContent = '';

          const payload = {
            recruiting_organization: $(`#adm-ed-org-${j.id}`).value.trim(),
            title: $(`#adm-ed-t-${j.id}`).value.trim(),
            location: $(`#adm-ed-l-${j.id}`).value.trim(),
            description: $(`#adm-ed-d-${j.id}`).value.trim(),
          };

          const stipendVal = $(`#adm-ed-s-${j.id}`).value;
          payload.stipend = stipendVal ? Number(stipendVal) : null;

          const deadlineVal = $(`#adm-ed-dl-${j.id}`).value;
          payload.application_deadline = deadlineVal ? deadlineVal : null;

          const eligVal = $(`#adm-ed-ec-${j.id}`).value.trim();
          payload.eligibility_criteria = eligVal ? eligVal : null;

          try {
            await api(`/api/jobs/${j.id}`, { method: 'PATCH', body: payload });
            toast('Placement Cell job updated successfully.');
            show('all');
          } catch (err) {
            errEl.textContent = err.message;
            btn.disabled = false;
            btn.textContent = 'Save Changes';
          }
        };
      }
    });
  };

  $('#filter-q').oninput = renderFilteredJobs;
  $('#filter-approval').onchange = renderFilteredJobs;
  $('#filter-status').onchange = renderFilteredJobs;
  $('#filter-source').onchange = renderFilteredJobs;

  renderFilteredJobs();
}

/* =============================================================================
 * 4. SHARED APPLICANTS DRAWER
 * ============================================================================= */
async function toggleApplicants(id, force) {
  const p = $(`[data-job="${id}"] .panel`);
  if (!p) return;
  if (!p.hidden && !force) { p.hidden = true; return; }
  p.hidden = false;
  p.innerHTML = '<p class="muted">Loading applicants…</p>';

  try {
    const list = await api('/api/jobs/applicants/' + id);
    p.innerHTML = list.length ? list.map(a => `
      <div class="app">
        <div>
          <b>${esc(a.name)}</b> <span class="muted">${esc(a.email)}</span>
          <span class="help" style="margin-left: .5rem;">Applied ${fmtDate(a.created_at)}</span>
          ${a.has_resume ? `
            <div style="margin-top: 0.35rem;">
              <button class="btn sm ghost" data-download-app-resume="${a.application_id}" data-resumename="${esc(a.resume_name || 'resume.pdf')}" style="padding: 2px 8px; font-size: 0.8rem;">
                📄 Download Resume Snapshot (${esc(a.resume_name)})
              </button>
            </div>
          ` : '<div class="muted" style="font-size: 0.8rem; margin-top: 0.25rem;">No resume attached</div>'}
        </div>
        ${chip(a.status)}
        <div class="acts">
          <button class="btn sm" data-st="shortlisted" data-app="${a.application_id}" data-j="${id}">Shortlist</button>
          <button class="btn sm ghost" data-st="rejected" data-app="${a.application_id}" data-j="${id}">Reject</button>
        </div>
      </div>
    `).join('') : '<p class="muted">No applicants submitted yet for this position.</p>';
  } catch (e) {
    p.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  }
}

/* =============================================================================
 * 4.5. ANNOUNCEMENTS (COMPANY, ADMIN & STUDENT FEED)
 * ============================================================================= */
let unreadAnnouncementsCount = 0;
let studentAnnouncements = [];
let studentAnnFilter = 'all';
let adminAnnTab = 'pending';

async function updateUnreadBadge() {
  if (!isStudent) return;
  try {
    const res = await api('/api/announcements/unread-count');
    unreadAnnouncementsCount = Number(res.unread_count || 0);
    const badgeEl = $('.nav-badge');
    const annBtn = $('[data-view="announcements"]');
    if (annBtn) {
      const label = "What's Going On?";
      annBtn.innerHTML = unreadAnnouncementsCount > 0
        ? `${label} <span class="nav-badge" aria-label="${unreadAnnouncementsCount} unread announcements">${unreadAnnouncementsCount}</span>`
        : label;
    }
  } catch (err) {
    console.warn('Unread count fetch error:', err.message);
  }
}

// Company Announcements Management View
async function viewCompanyAnnouncements(el) {
  el.innerHTML = '<p class="muted">Loading announcements…</p>';
  try {
    const list = await api('/api/announcements/my');
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:1.5rem;">
        <form id="form-co-ann" class="box" style="max-width:650px;">
          <h3 style="margin-top:0;">Submit Announcement for Approval</h3>
          <p class="help">Company announcements are reviewed and approved by the Placement Cell before publication to students.</p>

          <label for="co-ann-t" style="margin-top:.8rem;">Title *</label>
          <input id="co-ann-t" required minlength="3" maxlength="150" placeholder="e.g., TechCorp Campus Recruitment Drive 2026">

          <label for="co-ann-cat" style="margin-top:.8rem;">Category (optional)</label>
          <input id="co-ann-cat" maxlength="100" placeholder="e.g., Placement Drive, Pre-Placement Talk, Internship, Workshop">

          <label for="co-ann-c" style="margin-top:.8rem;">Content *</label>
          <textarea id="co-ann-c" rows="5" required minlength="10" maxlength="5000" placeholder="Provide full details of the announcement, schedules, eligibility, or guidelines..."></textarea>

          <p class="err" id="co-ann-err"></p>
          <button class="btn" type="submit" id="btn-co-ann-submit" style="margin-top:1rem;">Submit for Approval</button>
        </form>

        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem;">
            <h3 style="margin:0;">My Announcement Submissions</h3>
            <button class="btn ghost sm" id="btn-refresh-co-ann">↻ Refresh Submissions</button>
          </div>
          <div id="co-ann-list">
            ${list.length ? list.map(a => {
      const isRejected = a.approval_status === 'rejected';
      return `
                <section class="ann-card" data-ann="${a.id}">
                  <div class="ann-card-head">
                    <div>
                      <h4 class="ann-title">${esc(a.title)}</h4>
                      <div class="ann-meta" style="margin-top:.3rem;">
                        ${a.category ? `<span class="ann-tag">${esc(a.category)}</span>` : ''}
                        <span>Submitted ${fmtDate(a.created_at)}</span>
                        ${a.published_at ? `<span>Published ${fmtDate(a.published_at)}</span>` : ''}
                        <span>Revision ${a.revision || 1}</span>
                      </div>
                    </div>
                    <div style="display:flex;gap:.5rem;align-items:center;">
                      ${chip(a.approval_status)}
                      <button class="btn sm ghost" data-del-ann="${a.id}" title="Delete submission">Delete</button>
                    </div>
                  </div>
                  <div class="ann-body">${esc(a.content)}</div>
                  ${isRejected ? `
                    <div class="rejection-box" style="margin-top:.4rem;">
                      <b>Placement Cell Feedback / Rejection Reason:</b><br>
                      ${esc(a.rejection_reason || 'No specific reason provided.')}
                      ${a.reviewer_name ? `<br><small class="muted">Reviewed by ${esc(a.reviewer_name)} on ${fmtDate(a.reviewed_at)}</small>` : ''}
                    </div>
                  ` : ''}
                </section>
              `;
    }).join('') : empty('You have not submitted any announcements yet.')}
          </div>
        </div>
      </div>
    `;

    // Form submission handler
    const form = $('#form-co-ann');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = $('#btn-co-ann-submit');
        const errEl = $('#co-ann-err');
        errEl.textContent = '';

        const title = $('#co-ann-t').value.trim();
        const content = $('#co-ann-c').value.trim();
        const category = $('#co-ann-cat').value.trim();

        if (title.length < 3 || title.length > 150) {
          errEl.textContent = 'Title must be between 3 and 150 characters.';
          return;
        }
        if (content.length < 10 || content.length > 5000) {
          errEl.textContent = 'Content must be between 10 and 5000 characters.';
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Submitting...';
        try {
          await api('/api/announcements', {
            method: 'POST',
            body: { title, content, category: category || undefined },
          });
          toast('Announcement submitted successfully and is awaiting review.');
          viewCompanyAnnouncements(el);
        } catch (err) {
          errEl.textContent = err.message;
          btn.disabled = false;
          btn.textContent = 'Submit for Approval';
        }
      };
    }

    const refreshBtn = $('#btn-refresh-co-ann');
    if (refreshBtn) refreshBtn.onclick = () => viewCompanyAnnouncements(el);
  } catch (err) {
    el.innerHTML = empty(esc(err.message));
  }
}

// Admin Announcements Management View
async function viewAdminAnnouncements(el) {
  el.innerHTML = '<p class="muted">Loading announcements…</p>';
  try {
    let pendingList = [];
    let allList = [];
    let companies = [];

    if (adminAnnTab === 'pending') {
      pendingList = await api('/api/announcements/pending');
    } else if (adminAnnTab === 'all') {
      allList = await api('/api/announcements?status=all');
    } else if (adminAnnTab === 'create') {
      try { companies = await api('/api/jobs/companies'); } catch { companies = []; }
    }

    el.innerHTML = `
      <div class="tabs">
        <button class="${adminAnnTab === 'pending' ? 'active' : ''}" data-ann-tab="pending">
          Pending Approvals
          ${pendingList.length > 0 ? `<span class="badge-count">${pendingList.length}</span>` : ''}
        </button>
        <button class="${adminAnnTab === 'create' ? 'active' : ''}" data-ann-tab="create">Create & Publish</button>
        <button class="${adminAnnTab === 'all' ? 'active' : ''}" data-ann-tab="all">All Announcements</button>
      </div>
      <div id="admin-ann-tab-content"></div>
    `;

    const contentEl = $('#admin-ann-tab-content');

    if (adminAnnTab === 'pending') {
      contentEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;gap:.5rem;flex-wrap:wrap;">
          <div>
            <h3 style="margin:0;">Pending Company Announcements</h3>
            <p class="help">Review submissions from registered companies before publishing them to the student feed.</p>
          </div>
          <button class="btn ghost sm" id="btn-refresh-admin-pending">↻ Refresh Queue</button>
        </div>
        ${pendingList.length ? pendingList.map(a => `
          <section class="ann-card" data-ann="${a.id}">
            <div class="ann-card-head">
              <div>
                <h4 class="ann-title">${esc(a.title)}</h4>
                <div class="ann-meta" style="margin-top:.3rem;">
                  <span class="chip company">${esc(a.submitting_company_name || 'Company')}</span>
                  ${a.submitting_company_email ? `<span class="muted">${esc(a.submitting_company_email)}</span>` : ''}
                  ${a.category ? `<span class="ann-tag">${esc(a.category)}</span>` : ''}
                  <span>Submitted ${fmtDate(a.created_at)}</span>
                  <span>Revision ${a.revision || 1}</span>
                </div>
              </div>
              <div class="acts">
                <button class="btn sm" data-approve-ann="${a.id}" data-rev="${a.revision}">Approve</button>
                <button class="btn sm ghost" data-reject-ann-toggle="${a.id}">Reject</button>
              </div>
            </div>
            <div class="ann-body">${esc(a.content)}</div>

            <!-- Rejection Drawer -->
            <div class="reject-box" id="reject-ann-box-${a.id}" style="display:none;">
              <label for="reject-ann-reason-${a.id}"><b>Rejection Reason (Required) *</b></label>
              <textarea id="reject-ann-reason-${a.id}" rows="2" placeholder="Provide clear feedback on why this announcement cannot be approved..."></textarea>
              <div class="acts">
                <button class="btn sm bad" data-reject-ann-submit="${a.id}" data-rev="${a.revision}">Confirm Rejection</button>
                <button class="btn sm ghost" data-reject-ann-cancel="${a.id}">Cancel</button>
              </div>
            </div>
          </section>
        `).join('') : empty('No company announcements currently awaiting approval.')}
      `;
      const refreshBtn = $('#btn-refresh-admin-pending');
      if (refreshBtn) refreshBtn.onclick = () => viewAdminAnnouncements(el);

    } else if (adminAnnTab === 'create') {
      contentEl.innerHTML = `
        <form id="form-admin-ann" class="box" style="max-width:650px;">
          <h3 style="margin-top:0;">Publish Placement Cell Announcement</h3>
          <p class="help">Placement Cell announcements are published directly to students without requiring approval.</p>

          <label for="adm-ann-t" style="margin-top:.8rem;">Title *</label>
          <input id="adm-ann-t" required minlength="3" maxlength="150" placeholder="e.g., Placement Drive Schedule Announcement">

          <label for="adm-ann-cat" style="margin-top:.8rem;">Category (optional)</label>
          <input id="adm-ann-cat" maxlength="100" placeholder="e.g., General, Guidelines, Exam Notice, Campus Drive">

          <label for="adm-ann-co" style="margin-top:.8rem;">Associate with Company (optional)</label>
          <select id="adm-ann-co">
            <option value="">None (General Placement Cell Notice)</option>
            ${companies.map(c => `<option value="${c.id}">${esc(c.name)} (${esc(c.email)})</option>`).join('')}
          </select>

          <label for="adm-ann-c" style="margin-top:.8rem;">Content *</label>
          <textarea id="adm-ann-c" rows="6" required minlength="10" maxlength="5000" placeholder="Enter announcement body text..."></textarea>

          <p class="err" id="adm-ann-err"></p>
          <button class="btn" type="submit" id="btn-adm-ann-submit" style="margin-top:1rem;">Publish Immediately</button>
        </form>
      `;

      const form = $('#form-admin-ann');
      if (form) {
        form.onsubmit = async (e) => {
          e.preventDefault();
          const btn = $('#btn-adm-ann-submit');
          const errEl = $('#adm-ann-err');
          errEl.textContent = '';

          const title = $('#adm-ann-t').value.trim();
          const content = $('#adm-ann-c').value.trim();
          const category = $('#adm-ann-cat').value.trim();
          const company_id = $('#adm-ann-co').value;

          if (title.length < 3 || title.length > 150) {
            errEl.textContent = 'Title must be between 3 and 150 characters.';
            return;
          }
          if (content.length < 10 || content.length > 5000) {
            errEl.textContent = 'Content must be between 10 and 5000 characters.';
            return;
          }

          btn.disabled = true;
          btn.textContent = 'Publishing...';
          try {
            await api('/api/announcements', {
              method: 'POST',
              body: {
                title,
                content,
                category: category || undefined,
                company_id: company_id ? Number(company_id) : undefined,
              },
            });
            toast('Announcement published immediately to student feed.');
            adminAnnTab = 'all';
            viewAdminAnnouncements(el);
          } catch (err) {
            errEl.textContent = err.message;
            btn.disabled = false;
            btn.textContent = 'Publish Immediately';
          }
        };
      }

    } else if (adminAnnTab === 'all') {
      contentEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;gap:.5rem;flex-wrap:wrap;">
          <div>
            <h3 style="margin:0;">All Placement Announcements</h3>
            <p class="help">Comprehensive list of all Placement Cell and Company announcements.</p>
          </div>
          <button class="btn ghost sm" id="btn-refresh-admin-all">↻ Refresh</button>
        </div>
        ${allList.length ? allList.map(a => {
        const isCell = a.posting_source === 'placement_cell';
        return `
            <section class="ann-card" data-ann="${a.id}">
              <div class="ann-card-head">
                <div>
                  <h4 class="ann-title">${esc(a.title)}</h4>
                  <div class="ann-meta" style="margin-top:.3rem;">
                    ${isCell ? '<span class="chip placement_cell">Placement Cell</span>' : `<span class="chip company">${esc(a.company_name || 'Company')}</span>`}
                    ${a.category ? `<span class="ann-tag">${esc(a.category)}</span>` : ''}
                    ${chip(a.approval_status)}
                    <span>Published ${fmtDate(a.published_at || a.created_at)}</span>
                    ${a.creator_name ? `<span class="muted">By ${esc(a.creator_name)}</span>` : ''}
                  </div>
                </div>
                <div class="acts">
                  <button class="btn sm danger" data-del-ann="${a.id}">Delete</button>
                </div>
              </div>
              <div class="ann-body">${esc(a.content)}</div>
              ${a.approval_status === 'rejected' && a.rejection_reason ? `
                <div class="rejection-box" style="margin-top:.4rem;">
                  <b>Rejection Reason:</b> ${esc(a.rejection_reason)}
                  ${a.reviewer_name ? `<br><small class="muted">Reviewed by ${esc(a.reviewer_name)} on ${fmtDate(a.reviewed_at)}</small>` : ''}
                </div>
              ` : ''}
            </section>
          `;
      }).join('') : empty('No announcements found.')}
      `;
      const refreshBtn = $('#btn-refresh-admin-all');
      if (refreshBtn) refreshBtn.onclick = () => viewAdminAnnouncements(el);
    }
  } catch (err) {
    el.innerHTML = empty(esc(err.message));
  }
}

// Student "What's Going On?" Feed View
async function viewStudentAnnouncements(el) {
  el.innerHTML = '<p class="muted">Loading announcements…</p>';
  try {
    studentAnnouncements = await api('/api/announcements');
    await updateUnreadBadge();
    renderStudentAnnouncements(el);
  } catch (err) {
    el.innerHTML = empty(esc(err.message));
  }
}

function renderStudentAnnouncements(el) {
  const total = studentAnnouncements.length;
  const unreadList = studentAnnouncements.filter(a => !a.is_read);
  const unreadCount = unreadList.length;

  const displayList = studentAnnFilter === 'unread' ? unreadList : studentAnnouncements;

  el.innerHTML = `
    <div class="ann-toolbar">
      <div>
        <div class="ann-filters">
          <button class="btn sm ${studentAnnFilter === 'all' ? '' : 'ghost'}" id="btn-flt-all">
            All Announcements (${total})
          </button>
          <button class="btn sm ${studentAnnFilter === 'unread' ? '' : 'ghost'}" id="btn-flt-unread">
            Unread (${unreadCount})
          </button>
        </div>
      </div>
      <div style="display:flex;gap:.5rem;align-items:center;">
        <button class="btn sm ghost" id="btn-mark-all-read" ${unreadCount === 0 ? 'disabled' : ''}>
          ✓ Mark All as Read
        </button>
        <button class="btn sm ghost" id="btn-student-ann-refresh">↻ Refresh</button>
      </div>
    </div>

    <div id="student-ann-feed">
      ${displayList.length ? displayList.map(a => {
    const isUnread = !a.is_read;
    const isCell = a.posting_source === 'placement_cell';
    return `
          <article class="ann-card ${isUnread ? 'unread' : ''}" data-ann="${a.id}">
            <div class="ann-card-head">
              <div>
                <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem;flex-wrap:wrap;">
                  ${isCell ? '<span class="chip placement_cell">Placement Cell</span>' : `<span class="chip company">${esc(a.company_name || 'Recruiting Company')}</span>`}
                  ${a.category ? `<span class="ann-tag">${esc(a.category)}</span>` : ''}
                  ${isUnread ? '<span class="ann-badge-unread">NEW</span>' : ''}
                </div>
                <h3 class="ann-title">${esc(a.title)}</h3>
              </div>
              <div class="acts">
                ${isUnread ? `
                  <button class="btn sm" data-mark-ann-read="${a.id}">Mark as read</button>
                ` : `
                  <span class="ann-badge-read">✓ Read ${fmtDate(a.read_at)}</span>
                `}
              </div>
            </div>
            <div class="ann-body">${esc(a.content)}</div>
            <div class="ann-meta">
              <span>Published ${fmtDate(a.published_at || a.created_at)}</span>
              ${a.creator_name ? `<span>&bull; Posted by ${esc(a.creator_name)}</span>` : ''}
            </div>
          </article>
        `;
  }).join('') : (
      studentAnnFilter === 'unread'
        ? empty("You're all caught up! No unread announcements.")
        : empty('No announcements published yet. Check back soon for placement updates.')
    )}
    </div>
  `;

  $('#btn-flt-all').onclick = () => {
    studentAnnFilter = 'all';
    renderStudentAnnouncements(el);
  };
  $('#btn-flt-unread').onclick = () => {
    studentAnnFilter = 'unread';
    renderStudentAnnouncements(el);
  };
  $('#btn-student-ann-refresh').onclick = () => viewStudentAnnouncements(el);

  const markAllBtn = $('#btn-mark-all-read');
  if (markAllBtn && unreadCount > 0) {
    markAllBtn.onclick = async () => {
      markAllBtn.disabled = true;
      markAllBtn.textContent = 'Marking all…';
      try {
        await api('/api/announcements/read-all', { method: 'POST' });
        studentAnnouncements.forEach(a => { a.is_read = true; a.read_at = new Date().toISOString(); });
        unreadAnnouncementsCount = 0;
        await updateUnreadBadge();
        toast('All announcements marked as read.');
        renderStudentAnnouncements(el);
      } catch (err) {
        toast(err.message, 'bad');
        markAllBtn.disabled = false;
        markAllBtn.textContent = '✓ Mark All as Read';
      }
    };
  }
}

/* =============================================================================
 * 5. SHELL NAVIGATION & DISPATCH
 * ============================================================================= */
const views = isAdmin ? {
  overview: ['Overview', viewAdminOverview],
  pending: ['Pending Approvals', viewPendingApprovals],
  post: ['Post a Job', viewAdminPostJob],
  all: ['All Job Postings', viewAllJobs],
  announcements: ['Announcements', viewAdminAnnouncements],
} : isCo ? {
  jobs: ['My Jobs', viewCompanyJobs],
  post: ['Post a Job', viewCompanyPost],
  announcements: ['Announcements', viewCompanyAnnouncements],
} : {
  jobs: ['Browse Jobs', viewBrowse],
  apps: ['My Applications', viewApps],
  profile: ['My Profile', viewStudentProfile],
  announcements: ["What's Going On?", viewStudentAnnouncements],
};

async function show(v) {
  if (!views[v]) v = Object.keys(views)[0];
  const el = $('#view');

  if (isStudent) {
    await updateUnreadBadge();
  }

  $('#nav').innerHTML = Object.entries(views)
    .map(([k, [l]]) => {
      let badge = '';
      if (k === 'announcements' && isStudent && unreadAnnouncementsCount > 0) {
        badge = ` <span class="nav-badge" aria-label="${unreadAnnouncementsCount} unread announcements">${unreadAnnouncementsCount}</span>`;
      }
      return `<button data-view="${k}" class="${k === v ? 'on' : ''}">${l}${badge}</button>`;
    })
    .join('');
  $('#title').textContent = views[v][0];
  el.innerHTML = '<p class="muted">Loading…</p>';
  try {
    await views[v][1](el);
  } catch (e) {
    el.innerHTML = empty(esc(e.message));
  }
  loadStats();
}

/* =============================================================================
 * 6. GLOBAL EVENT DELEGATION
 * ============================================================================= */
document.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;

  try {
    if (d.view) {
      show(d.view);
    } else if (b.id === 'logout') {
      logout();
    } else if (b.id === 'theme') {
      toggleTheme();
    } else if (d.annTab) {
      // Admin Announcements Tab switch
      adminAnnTab = d.annTab;
      viewAdminAnnouncements($('#view'));
    } else if (d.approveAnn) {
      // Admin Approve Pending Announcement
      b.disabled = true;
      b.textContent = 'Approving...';
      try {
        await api(`/api/announcements/${d.approveAnn}/approval`, {
          method: 'PATCH',
          body: {
            approval_status: 'approved',
            expected_revision: d.rev ? Number(d.rev) : undefined,
          },
        });
        toast('Announcement approved and published.');
        viewAdminAnnouncements($('#view'));
      } catch (err) {
        b.disabled = false;
        b.textContent = 'Approve';
        if (/conflict/i.test(err.message) || err.message.includes('409') || /already/i.test(err.message)) {
          toast('Conflict: Announcement was modified or already reviewed. Queue refreshed.', 'bad');
          viewAdminAnnouncements($('#view'));
        } else {
          throw err;
        }
      }
    } else if (d.rejectAnnToggle) {
      // Toggle announcement rejection drawer
      const rBox = $(`#reject-ann-box-${d.rejectAnnToggle}`);
      if (rBox) {
        rBox.style.display = rBox.style.display === 'none' ? 'flex' : 'none';
      }
    } else if (d.rejectAnnCancel) {
      // Cancel announcement rejection
      const rBox = $(`#reject-ann-box-${d.rejectAnnCancel}`);
      if (rBox) rBox.style.display = 'none';
    } else if (d.rejectAnnSubmit) {
      // Admin Reject Pending Announcement with mandatory reason
      const reasonEl = $(`#reject-ann-reason-${d.rejectAnnSubmit}`);
      const reason = reasonEl ? reasonEl.value.trim() : '';
      if (!reason) {
        toast('A meaningful rejection reason is required.', 'bad');
        if (reasonEl) reasonEl.focus();
        return;
      }
      b.disabled = true;
      b.textContent = 'Rejecting...';
      try {
        await api(`/api/announcements/${d.rejectAnnSubmit}/approval`, {
          method: 'PATCH',
          body: {
            approval_status: 'rejected',
            rejection_reason: reason,
            expected_revision: d.rev ? Number(d.rev) : undefined,
          },
        });
        toast('Announcement rejected.');
        viewAdminAnnouncements($('#view'));
      } catch (err) {
        b.disabled = false;
        b.textContent = 'Confirm Rejection';
        if (/conflict/i.test(err.message) || err.message.includes('409') || /already/i.test(err.message)) {
          toast('Conflict: Announcement was modified or already reviewed. Queue refreshed.', 'bad');
          viewAdminAnnouncements($('#view'));
        } else {
          throw err;
        }
      }
    } else if (d.delAnn) {
      // Delete Announcement
      if (confirm('Are you sure you want to delete this announcement?')) {
        b.disabled = true;
        try {
          await api('/api/announcements/' + d.delAnn, { method: 'DELETE' });
          toast('Announcement deleted successfully.');
          if (isAdmin) viewAdminAnnouncements($('#view'));
          else if (isCo) viewCompanyAnnouncements($('#view'));
        } catch (err) {
          b.disabled = false;
          toast(err.message, 'bad');
          if (isAdmin) viewAdminAnnouncements($('#view'));
          else if (isCo) viewCompanyAnnouncements($('#view'));
        }
      }
    } else if (d.markAnnRead) {
      // Student mark single announcement as read
      b.disabled = true;
      b.textContent = 'Marking…';
      try {
        await api(`/api/announcements/${d.markAnnRead}/read`, { method: 'POST' });
        const target = studentAnnouncements.find(a => a.id === Number(d.markAnnRead));
        if (target) {
          target.is_read = true;
          target.read_at = new Date().toISOString();
        }
        await updateUnreadBadge();
        toast('Marked as read.');
        renderStudentAnnouncements($('#view'));
      } catch (err) {
        b.disabled = false;
        b.textContent = 'Mark as read';
        toast(err.message, 'bad');
      }
    } else if (d.downloadAppResume) {
      b.disabled = true;
      try {
        const headers = {};
        if (session.token()) headers.Authorization = `Bearer ${session.token()}`;
        const response = await fetch(`${API_BASE}/api/applications/${d.downloadAppResume}/resume`, { headers });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          if (response.status === 401 && session.token()) logout();
          throw new Error(errorBody.error || `Download failed (${response.status})`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = safeDownloadNameForApplication(d.resumename || 'submitted_resume.pdf');
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        toast('Resume snapshot download started.');
      } catch (err) {
        toast(err.message, 'bad');
      } finally {
        b.disabled = false;
      }
    } else if (d.apply) {
      // Student Job Application with Resume Picker Modal
      const jobId = Number(d.apply);
      const targetJob = jobs.find(j => j.id === jobId) || { id: jobId, title: 'Job' };

      b.disabled = true;
      const originalText = b.textContent;
      b.textContent = 'Loading resumes…';

      let studentResumes = [];
      try {
        const rData = await api('/api/profile/resumes').catch(() => api('/api/profile/resume'));
        studentResumes = rData.resumes || (rData.resume ? [rData.resume] : []);
      } catch (err) {
        b.disabled = false;
        b.textContent = originalText;
        toast('Could not load resumes: ' + err.message, 'bad');
        return;
      }

      b.disabled = false;
      b.textContent = originalText;

      if (!studentResumes.length) {
        if (confirm('You must upload at least one resume in My Profile before applying for jobs.\n\nGo to My Profile now?')) {
          show('profile');
        }
        return;
      }

      const existingModal = document.getElementById('apply-resume-modal');
      if (existingModal) existingModal.remove();

      const defaultResume = studentResumes.find(r => r.is_default) || studentResumes[0];

      const modal = document.createElement('div');
      modal.id = 'apply-resume-modal';
      modal.className = 'apply-modal-backdrop';
      modal.innerHTML = `
        <div class="apply-modal-box card" style="max-width: 520px; width: 90%; box-shadow: 0 10px 25px rgba(0,0,0,0.3); border: 1px solid var(--line); background: var(--card); padding: 1.5rem; border-radius: var(--r-m);">
          <h3 style="margin-top:0;">Apply for ${esc(targetJob.title)}</h3>
          <p class="muted" style="margin-top:0.25rem;">${esc(targetJob.recruiting_organization || '')}</p>
          <div style="margin: 1.2rem 0;">
            <label for="modal-resume-select" style="font-weight:bold; display:block; margin-bottom:0.5rem;">Choose Resume to Submit *</label>
            <select id="modal-resume-select" style="width:100%; padding:0.6rem; border:1px solid var(--line); border-radius:var(--r-s); background:var(--bg); color:var(--text);">
              ${studentResumes.map(r => `
                <option value="${r.id}" ${r.id === defaultResume.id ? 'selected' : ''}>
                  ${esc(r.label || r.original_name)} (${esc(r.original_name)})${r.is_default ? ' — [Default]' : ''}
                </option>
              `).join('')}
            </select>
            <div id="modal-resume-preview" class="help" style="margin-top:0.75rem; padding:0.6rem; background:var(--bg); border:1px solid var(--line); border-radius:var(--r-s);">
            </div>
            <p class="help" style="margin-top:0.75rem;">
              An immutable snapshot of your selected resume will be submitted. If you update or delete your profile resume later, this job application will retain the exact snapshot submitted.
            </p>
            <p class="err" id="modal-apply-error" role="alert" style="margin-top:0.5rem;"></p>
          </div>
          <div class="acts" style="justify-content: flex-end; gap:0.5rem;">
            <button class="btn ghost" id="modal-apply-cancel" type="button">Cancel</button>
            <button class="btn" id="modal-apply-confirm" type="button">Submit Application</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const selectEl = modal.querySelector('#modal-resume-select');
      const previewEl = modal.querySelector('#modal-resume-preview');
      const confirmBtn = modal.querySelector('#modal-apply-confirm');
      const cancelBtn = modal.querySelector('#modal-apply-cancel');
      const errEl = modal.querySelector('#modal-apply-error');

      const updatePreview = () => {
        const chosenId = Number(selectEl.value);
        const chosen = studentResumes.find(r => r.id === chosenId);
        if (chosen) {
          previewEl.innerHTML = `<b>Resume:</b> ${esc(chosen.label || chosen.original_name)} <span class="muted">(${esc(chosen.original_name)}, ${formatResumeSizeForApply(chosen.file_size)})${chosen.is_default ? ' [Default]' : ''}</span>`;
        }
      };
      updatePreview();
      selectEl.onchange = updatePreview;

      cancelBtn.onclick = () => modal.remove();

      confirmBtn.onclick = async () => {
        const chosenResumeId = Number(selectEl.value);
        if (!chosenResumeId) {
          errEl.textContent = 'Please choose a resume to submit.';
          return;
        }
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        confirmBtn.textContent = 'Submitting…';
        errEl.textContent = '';

        try {
          await api('/api/jobs/apply', {
            method: 'POST',
            body: {
              job_id: jobId,
              resume_id: chosenResumeId,
            },
          });
          modal.remove();
          b.disabled = true;
          b.textContent = 'Applied';
          apps.push({ job_id: jobId });
          toast('Application submitted successfully.');
          loadStats();
        } catch (applyErr) {
          confirmBtn.disabled = false;
          cancelBtn.disabled = false;
          confirmBtn.textContent = 'Submit Application';
          errEl.textContent = applyErr.message;
        }
      };
    } else if (d.approve) {
      // Admin Approve Pending Job
      b.disabled = true;
      b.textContent = 'Approving...';
      try {
        await api(`/api/jobs/${d.approve}/approval`, {
          method: 'PATCH',
          body: {
            approval_status: 'approved',
            expected_revision: d.rev ? Number(d.rev) : undefined,
          },
        });
        toast('Job approved and published.');
        show('pending');
      } catch (err) {
        b.disabled = false;
        b.textContent = 'Approve';
        throw err;
      }
    } else if (d.rejectToggle) {
      // Toggle rejection input drawer
      const rBox = $(`#reject-box-${d.rejectToggle}`);
      if (rBox) {
        rBox.style.display = rBox.style.display === 'none' ? 'flex' : 'none';
      }
    } else if (d.rejectCancel) {
      // Cancel rejection
      const rBox = $(`#reject-box-${d.rejectCancel}`);
      if (rBox) rBox.style.display = 'none';
    } else if (d.rejectSubmit) {
      // Admin Reject Pending Job with mandatory reason
      const reasonEl = $(`#reject-reason-${d.rejectSubmit}`);
      const reason = reasonEl ? reasonEl.value.trim() : '';
      if (!reason) {
        toast('A rejection reason is required.', 'bad');
        if (reasonEl) reasonEl.focus();
        return;
      }
      b.disabled = true;
      b.textContent = 'Rejecting...';
      try {
        await api(`/api/jobs/${d.rejectSubmit}/approval`, {
          method: 'PATCH',
          body: {
            approval_status: 'rejected',
            rejection_reason: reason,
            expected_revision: d.rev ? Number(d.rev) : undefined,
          },
        });
        toast('Job posting rejected.');
        show('pending');
      } catch (err) {
        b.disabled = false;
        b.textContent = 'Confirm Rejection';
        throw err;
      }
    } else if (d.editCo) {
      // Toggle Company Edit Drawer
      const box = $(`#edit-box-co-${d.editCo}`);
      if (box) {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      }
    } else if (d.cancelCoEdit) {
      // Cancel Company Edit Drawer
      const box = $(`#edit-box-co-${d.cancelCoEdit}`);
      if (box) box.style.display = 'none';
    } else if (d.editAdmin) {
      // Toggle Admin Edit Drawer
      const box = $(`#edit-box-admin-${d.editAdmin}`);
      if (box) {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      }
    } else if (d.cancelAdminEdit) {
      // Cancel Admin Edit Drawer
      const box = $(`#edit-box-admin-${d.cancelAdminEdit}`);
      if (box) box.style.display = 'none';
    } else if (d.statusToggle) {
      // Job Availability Toggle (open / closed)
      const targetStatus = d.targetStatus;
      if (confirm(`Are you sure you want to change this job's availability to '${targetStatus}'?`)) {
        b.disabled = true;
        await api(`/api/jobs/${d.statusToggle}/status`, {
          method: 'PATCH',
          body: { job_status: targetStatus },
        });
        toast(`Job availability updated to ${targetStatus}.`);
        show(isAdmin ? 'all' : 'jobs');
      }
    } else if (d.ap) {
      // Toggle Applicant Panel
      toggleApplicants(d.ap);
    } else if (d.del) {
      // Delete Job
      if (confirm('Delete this job posting and all its associated records?')) {
        b.disabled = true;
        try {
          await api('/api/jobs/' + d.del, { method: 'DELETE' });
          toast('Job deleted successfully.');
          show(isAdmin ? 'all' : 'jobs');
        } catch (err) {
          b.disabled = false;
          toast(err.message, 'bad');
        }
      }
    } else if (d.st) {
      // Application Status Update (shortlisted / rejected)
      b.disabled = true;
      await api(`/api/applications/${d.app}/status`, {
        method: 'PATCH',
        body: { status: d.st },
      });
      toast(`Applicant marked as ${d.st}.`);
      toggleApplicants(d.j, true);
      loadStats();
    }
  } catch (err) {
    toast(err.message, 'bad');
  }
});

// User identity presentation
$('#me-name').textContent = user.name || 'User';
$('#me-role').textContent = isAdmin
  ? 'Placement Cell Admin'
  : isCo
    ? 'Company Account'
    : 'Student Account';

// Initialize default tab
show(isAdmin ? 'overview' : 'jobs');
