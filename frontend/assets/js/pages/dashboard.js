/* Dashboard for both roles. Student: browse + applications. Company: my jobs + applicants + post job. */
if (!session.token()) location.href = 'login.html';
const user = session.user() || {}, isCo = user.role === 'company';
let jobs = [], apps = [];

const money = v => v ? '₹' + Number(v).toLocaleString('en-IN') + ' / month' : 'Stipend not listed';
const chip = s => `<span class="chip ${esc(s)}">${esc(s)}</span>`;
const empty = (msg, btn = '') => `<div class="empty"><p>${msg}</p>${btn}</div>`;
const loadJobs = async () => { jobs = await api('/api/jobs'); };
const loadApps = async () => { apps = await api('/api/applications/my'); };

async function loadStats() {
  try {
    const s = await api('/api/applications/dashboard/stats');
    const items = isCo
      ? [['Jobs posted', s.total_jobs], ['Applications', s.total_applications], ['Pending review', s.pending], ['Shortlisted', s.shortlisted]]
      : [['Applied', s.total], ['Pending', s.pending], ['Shortlisted', s.shortlisted], ['Rejected', s.rejected]];
    $('#stats').innerHTML = items.map(([l, v]) => `<div class="stat"><b>${Number(v || 0)}</b><span>${l}</span></div>`).join('');
  } catch { $('#stats').innerHTML = ''; }
}

/* ---------- student views ---------- */
async function viewBrowse(el) {
  await Promise.all([loadJobs(), loadApps()]);
  el.innerHTML = `<input class="search" id="q" placeholder="Search by title, company or city" aria-label="Search jobs"><div id="list" class="grid"></div>`;
  const draw = () => {
    const q = $('#q').value.toLowerCase(), done = new Set(apps.map(a => a.job_id));
    const list = jobs.filter(j => [j.title, j.company, j.location].join(' ').toLowerCase().includes(q));
    $('#list').innerHTML = list.length ? list.map(j => `
      <article class="card"><h3>${esc(j.title)}</h3><p class="muted">${esc(j.company)}</p>
        <div class="meta"><span>${esc(j.location)}</span><span>${money(j.stipend)}</span></div>
        <p class="desc">${esc(j.description)}</p>
        <button class="btn" data-apply="${j.id}" ${done.has(j.id) ? 'disabled' : ''}>${done.has(j.id) ? 'Applied' : 'Apply'}</button></article>`).join('')
      : empty('No jobs match your search.');
  };
  $('#q').oninput = draw; draw();
}

async function viewApps(el) {
  await loadApps();
  el.innerHTML = apps.length ? apps.map(a => `
    <section class="row"><div class="row-h"><div><h3>${esc(a.title)}</h3><p class="muted">${esc(a.company)}, ${esc(a.location)}</p></div>
    <div class="meta"><span>Applied ${new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>${chip(a.status)}</div></section>`).join('')
    : empty("You haven't applied to anything yet.", '<button class="btn" data-view="jobs">Browse jobs</button>');
}

/* ---------- company views ---------- */
async function viewMyJobs(el) {
  await loadJobs();
  const mine = jobs.filter(j => j.company_id === user.id);
  el.innerHTML = mine.length ? mine.map(j => `
    <section class="row" data-job="${j.id}"><div class="row-h"><div><h3>${esc(j.title)}</h3>
      <div class="meta"><span>${esc(j.location)}</span><span>${money(j.stipend)}</span></div></div>
      <div class="acts"><button class="btn ghost" data-ap="${j.id}">Applicants</button><button class="btn danger" data-del="${j.id}">Delete</button></div></div>
      <div class="panel" hidden></div></section>`).join('')
    : empty("You haven't posted a job yet.", '<button class="btn" data-view="post">Post your first job</button>');
}

async function toggleApplicants(id, force) {
  const p = $(`[data-job="${id}"] .panel`);
  if (!p.hidden && !force) { p.hidden = true; return; }
  p.hidden = false; p.innerHTML = '<p class="muted">Loading applicants…</p>';
  try {
    const list = await api('/api/jobs/applicants/' + id);
    p.innerHTML = list.length ? list.map(a => `
      <div class="app"><div><b>${esc(a.name)}</b> <span class="muted">${esc(a.email)}</span></div>${chip(a.status)}
      <div class="acts"><button class="btn sm" data-st="shortlisted" data-app="${a.application_id}" data-j="${id}">Shortlist</button>
      <button class="btn sm ghost" data-st="rejected" data-app="${a.application_id}" data-j="${id}">Reject</button></div></div>`).join('')
      : '<p class="muted">No applicants yet.</p>';
  } catch (e) { p.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

function viewPost(el) {
  el.innerHTML = `<form class="box" id="post"><label for="t">Job title</label><input id="t" name="title" required placeholder="Backend Intern">
    <label for="l">Location</label><input id="l" name="location" required placeholder="Bangalore or Remote">
    <label for="s">Monthly stipend (₹, optional)</label><input id="s" name="stipend" type="number" min="0">
    <label for="d">Description</label><textarea id="d" name="description" rows="5" required placeholder="What will the intern work on?"></textarea>
    <p class="err" id="perr"></p><button class="btn" type="submit">Post job</button></form>`;
  $('#post').onsubmit = async e => {
    e.preventDefault();
    try { await api('/api/jobs/create', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Job posted'); show('jobs'); }
    catch (err) { $('#perr').textContent = err.message; }
  };
}

/* ---------- shell ---------- */
const views = isCo ? { jobs: ['My jobs', viewMyJobs], post: ['Post a job', viewPost] }
                   : { jobs: ['Browse jobs', viewBrowse], apps: ['My applications', viewApps] };

async function show(v) {
  const el = $('#view');
  $('#nav').innerHTML = Object.entries(views).map(([k, [l]]) => `<button data-view="${k}" class="${k === v ? 'on' : ''}">${l}</button>`).join('');
  $('#title').textContent = views[v][0];
  el.innerHTML = '<p class="muted">Loading…</p>';
  try { await views[v][1](el); } catch (e) { el.innerHTML = empty(esc(e.message)); }
  loadStats();
}

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  try {
    if (d.view) show(d.view);
    else if (b.id === 'logout') logout();
    else if (b.id === 'theme') toggleTheme();
    else if (d.apply) {
      b.disabled = true;
      try { await api('/api/jobs/apply', { method: 'POST', body: { job_id: Number(d.apply) } }); toast('Application sent'); }
      catch (err) { if (!/already/i.test(err.message)) { b.disabled = false; throw err; } }
      b.textContent = 'Applied'; apps.push({ job_id: Number(d.apply) }); loadStats();
    }
    else if (d.ap) toggleApplicants(d.ap);
    else if (d.del && confirm('Delete this job and all its applications?')) { await api('/api/jobs/' + d.del, { method: 'DELETE' }); toast('Job deleted'); show('jobs'); }
    else if (d.st) { await api(`/api/applications/${d.app}/status`, { method: 'PATCH', body: { status: d.st } }); toast('Marked ' + d.st); toggleApplicants(d.j, true); loadStats(); }
  } catch (err) { toast(err.message, 'bad'); }
});

$('#me-name').textContent = user.name || '';
$('#me-role').textContent = isCo ? 'Company account' : 'Student account';
show('jobs');
