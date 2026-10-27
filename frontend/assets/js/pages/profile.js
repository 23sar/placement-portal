/* Student profile + resume management (Step 8.3–8.5).
 * All user data is escaped before markup insertion and the backend remains the
 * authority for validation and ownership checks.
 */
const PROFILE_DETAIL_SECTIONS = {
  skills: {
    label: 'Skills', singular: 'Skill',
    fields: [
      { name: 'skill_name', label: 'Skill name', required: true, max: 100 },
      { name: 'proficiency', label: 'Proficiency', type: 'select', options: [['', 'Not specified'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced'], ['expert', 'Expert']] },
    ],
    summary: item => [item.skill_name, item.proficiency ? `Proficiency: ${item.proficiency}` : ''].filter(Boolean),
  },
  projects: {
    label: 'Projects', singular: 'Project',
    fields: [
      { name: 'title', label: 'Project title', required: true, max: 150 },
      { name: 'description', label: 'Description', type: 'textarea', required: true, rows: 3 },
      { name: 'technologies', label: 'Technologies (comma-separated)', max: 255 },
      { name: 'project_url', label: 'Project URL', type: 'url', max: 255 },
      { name: 'start_date', label: 'Start date', type: 'date' },
      { name: 'end_date', label: 'End date', type: 'date' },
    ],
    summary: item => [item.title, item.description, item.technologies, item.project_url, item.start_date && `Start: ${profileDisplayDate(item.start_date)}`, item.end_date && `End: ${profileDisplayDate(item.end_date)}`].filter(Boolean),
  },
  internships: {
    label: 'Internships & Experience', singular: 'Experience',
    fields: [
      { name: 'organization', label: 'Organization', required: true, max: 150 },
      { name: 'role', label: 'Role / position', required: true, max: 100 },
      { name: 'description', label: 'Description', type: 'textarea', rows: 3 },
      { name: 'start_date', label: 'Start date', type: 'date' },
      { name: 'end_date', label: 'End date', type: 'date' },
      { name: 'experience_url', label: 'Experience / offer URL', type: 'url', max: 255 },
    ],
    summary: item => [`${item.role} — ${item.organization}`, item.description, item.start_date && `Start: ${profileDisplayDate(item.start_date)}`, item.end_date && `End: ${profileDisplayDate(item.end_date)}`, item.experience_url].filter(Boolean),
  },
  achievements: {
    label: 'Achievements & Certifications', singular: 'Achievement',
    fields: [
      { name: 'title', label: 'Title', required: true, max: 150 },
      { name: 'issuer', label: 'Issuer / organization', max: 150 },
      { name: 'description', label: 'Description', type: 'textarea', rows: 3 },
      { name: 'achieved_on', label: 'Date achieved', type: 'date' },
      { name: 'credential_url', label: 'Credential URL', type: 'url', max: 255 },
    ],
    summary: item => [item.title, item.issuer, item.description, item.achieved_on && `Date: ${profileDisplayDate(item.achieved_on)}`, item.credential_url].filter(Boolean),
  },
};

function profileDateValue(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function profileDisplayDate(value) {
  const date = profileDateValue(value);
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function profileFieldInput(field, value = '') {
  const common = `name="${esc(field.name)}" id="${esc(field.name)}" ${field.required ? 'required' : ''} ${field.max ? `maxlength="${field.max}"` : ''}`;
  if (field.type === 'select') {
    return `<label for="${esc(field.name)}">${esc(field.label)}${field.required ? ' *' : ''}</label><select ${common}>${field.options.map(([v, l]) => `<option value="${esc(v)}" ${String(value ?? '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }
  if (field.type === 'textarea') {
    return `<label for="${esc(field.name)}">${esc(field.label)}${field.required ? ' *' : ''}</label><textarea ${common} rows="${field.rows || 3}">${esc(value ?? '')}</textarea>`;
  }
  const inputValue = field.type === 'date' ? profileDateValue(value) : (value ?? '');
  return `<label for="${esc(field.name)}">${esc(field.label)}${field.required ? ' *' : ''}</label><input ${common} type="${esc(field.type || 'text')}" value="${esc(inputValue)}" ${field.type === 'url' ? 'placeholder="https://..."' : ''}>`;
}

function normalizeProfileDetails(payload) {
  const source = payload?.sections || payload?.details || payload?.profile_details || payload || {};
  const normalized = {};
  for (const key of Object.keys(PROFILE_DETAIL_SECTIONS)) {
    normalized[key] = Array.isArray(source[key]) ? source[key] : [];
  }
  return normalized;
}

function profileCompletion(profile, details, resume) {
  const hasText = key => String(profile?.[key] ?? '').trim().length > 0;
  const hasValue = key => profile?.[key] !== null && profile?.[key] !== undefined && String(profile[key]).trim() !== '';
  const hasLink = ['github_url', 'linkedin_url', 'portfolio_url'].some(hasText);
  const checks = [
    ['Phone number', hasText('phone')],
    ['Department', hasText('department')],
    ['Degree program', hasText('degree_program')],
    ['Graduation year', hasValue('graduation_year')],
    ['Roll number', hasText('roll_number')],
    ['CGPA', hasValue('cgpa')],
    ['Backlog count', hasValue('backlog_count')],
    ['Technical interests', hasText('technical_interests')],
    ['At least one profile link', hasLink],
    ['At least one skill', (details.skills || []).length > 0],
    ['At least one project', (details.projects || []).length > 0],
    ['Resume uploaded', Boolean(resume)],
  ];
  const completed = checks.filter(([, ok]) => ok).length;
  return { checks, completed, total: checks.length, percent: Math.round((completed / checks.length) * 100) };
}

function renderDetailSection(section, rows) {
  const config = PROFILE_DETAIL_SECTIONS[section];
  const cards = rows.length ? rows.map(item => {
    const summary = config.summary(item);
    return `<article class="profile-detail-card">
      <div class="profile-detail-copy">${summary.map((line, i) => i === 0
        ? `<h4>${esc(line)}</h4>`
        : `<p>${esc(line)}</p>`).join('')}</div>
      <div class="acts profile-detail-actions">
        <button type="button" class="btn ghost sm" data-edit-detail="${esc(section)}" data-id="${Number(item.id)}">Edit</button>
        <button type="button" class="btn danger sm" data-delete-detail="${esc(section)}" data-id="${Number(item.id)}">Delete</button>
      </div>
    </article>`;
  }).join('') : '<p class="muted profile-empty">No records added yet.</p>';
  const fields = config.fields.map(field => profileFieldInput(field)).join('');
  return `<section class="profile-section card" id="section-${esc(section)}">
    <div class="profile-section-head"><div><h3>${esc(config.label)}</h3><p class="muted">${rows.length} ${rows.length === 1 ? 'record' : 'records'}</p></div></div>
    <div class="profile-detail-list">${cards}</div>
    <details class="profile-editor" id="editor-${esc(section)}">
      <summary>Add ${esc(config.singular)}</summary>
      <form class="profile-detail-form" id="detail-form-${esc(section)}" data-section="${esc(section)}">
        <div class="profile-form-grid">${fields}</div>
        <p class="err" id="detail-error-${esc(section)}" role="alert"></p>
        <div class="acts"><button class="btn" type="submit">Add ${esc(config.singular)}</button><button class="btn ghost" type="button" data-cancel-detail="${esc(section)}" hidden>Cancel edit</button></div>
      </form>
    </details>
  </section>`;
}

function formatResumeSize(bytes) {
  const n = Number(bytes || 0);
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function safeDownloadName(name) {
  const base = String(name || 'resume.pdf').replace(/[\\/\u0000-\u001f\u007f]/g, '_').replace(/\.\.+/g, '.');
  return base.toLowerCase().endsWith('.pdf') ? base.slice(0, 255) : 'resume.pdf';
}

async function viewStudentProfile(el) {
  const coreResponse = await api('/api/profile/me');
  const profile = coreResponse.profile || {};
  let details = { skills: [], projects: [], internships: [], achievements: [] };
  let detailsError = '';
  let resume = null;
  let resumeError = '';

  try { details = normalizeProfileDetails(await api('/api/profile/details')); }
  catch (err) { detailsError = err.message; }
  try { resume = (await api('/api/profile/resume')).resume || null; }
  catch (err) { resumeError = err.message; }

  const completion = profileCompletion(profile, details, resume);
  const coreFields = [
    { name: 'phone', label: 'Phone number', type: 'tel', max: 25 },
    { name: 'department', label: 'Department', max: 100 },
    { name: 'degree_program', label: 'Degree program', max: 120 },
    { name: 'graduation_year', label: 'Graduation year', type: 'number', min: 2000, max: 2100 },
    { name: 'roll_number', label: 'Roll number', max: 50 },
    { name: 'cgpa', label: 'CGPA (out of 10)', type: 'number', min: 0, max: 10, step: '0.01' },
    { name: 'backlog_count', label: 'Backlog count', type: 'number', min: 0, max: 100, step: '1' },
    { name: 'technical_interests', label: 'Technical interests', type: 'textarea', max: 1000, rows: 3 },
    { name: 'github_url', label: 'GitHub URL', type: 'url', max: 255 },
    { name: 'linkedin_url', label: 'LinkedIn URL', type: 'url', max: 255 },
    { name: 'portfolio_url', label: 'Portfolio URL', type: 'url', max: 255 },
  ];
  const coreInputs = coreFields.map(f => {
    const input = f.type === 'textarea'
      ? `<textarea name="${f.name}" id="profile-${f.name}" rows="${f.rows}" maxlength="${f.max || ''}">${esc(profile[f.name] ?? '')}</textarea>`
      : `<input name="${f.name}" id="profile-${f.name}" type="${f.type || 'text'}" value="${esc(profile[f.name] ?? '')}" ${f.max ? `maxlength="${f.max}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined && f.type === 'number' ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.type === 'url' ? 'placeholder="https://..."' : ''}>`;
    return `<div>${`<label for="profile-${f.name}">${esc(f.label)}</label>`}${input}</div>`;
  }).join('');

  const resumeMarkup = resume ? `
    <div class="resume-current" id="resume-current">
      <div><b>${esc(resume.original_name)}</b><p class="muted">PDF · ${formatResumeSize(resume.file_size)} · Updated ${esc(String(resume.updated_at || resume.created_at || '').slice(0, 10) || 'date unavailable')}</p></div>
      <div class="acts"><button class="btn sm" type="button" id="resume-download">Download</button><button class="btn danger sm" type="button" id="resume-delete">Delete</button></div>
    </div>
    <p class="help">Uploading a new PDF replaces this resume.</p>` : '<p class="muted">No resume uploaded yet. Upload a PDF (maximum 5 MB).</p>';

  el.innerHTML = `
    <div class="profile-intro">
      <div><h3>${esc(profile.name || user.name || 'Student profile')}</h3><p class="muted">${esc(profile.email || user.email || '')}</p></div>
      <div class="completion-number"><b>${completion.percent}%</b><span class="muted">Profile complete</span></div>
    </div>
    <section class="card profile-completion">
      <div class="completion-track" role="progressbar" aria-label="Profile completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${completion.percent}"><span style="width:${completion.percent}%"></span></div>
      <p class="muted">${completion.completed} of ${completion.total} profile items completed. Update these sections to improve your profile.</p>
      <div class="completion-checklist">${completion.checks.map(([label, done]) => `<span class="completion-item ${done ? 'done' : ''}"><span aria-hidden="true">${done ? '✓' : '○'}</span> ${esc(label)}</span>`).join('')}</div>
    </section>
    <section class="card profile-section">
      <div class="profile-section-head"><div><h3>Personal & Academic Details</h3><p class="muted">Your account name and email are managed separately and cannot be changed here.</p></div></div>
      <form id="profile-core-form"><div class="profile-form-grid">${coreInputs}</div><p class="err" id="profile-core-error" role="alert"></p><button class="btn" type="submit" id="profile-core-save">Save profile</button></form>
    </section>
    ${detailsError ? `<p class="profile-error" role="alert">Could not load profile sections: ${esc(detailsError)}. You can retry by reopening My Profile.</p>` : ''}
    <div class="profile-detail-grid">${Object.keys(PROFILE_DETAIL_SECTIONS).map(key => renderDetailSection(key, details[key] || [])).join('')}</div>
    <section class="card profile-section" id="resume-section">
      <div class="profile-section-head"><div><h3>Resume</h3><p class="muted">Upload a PDF resume. Files are private and can be downloaded only through your authenticated student account.</p></div></div>
      ${resumeError ? `<p class="profile-error" role="alert">Could not load resume information: ${esc(resumeError)}.</p>` : ''}
      ${resumeMarkup}
      <form id="resume-upload-form" class="resume-upload-form">
        <label for="resume-file">${resume ? 'Replace resume' : 'Choose resume'} (PDF, max 5 MB)</label>
        <input type="file" id="resume-file" name="resume" accept="application/pdf,.pdf" required>
        <p class="help">Only PDF files are accepted. The file is validated by the server before storage.</p>
        <p class="err" id="resume-error" role="alert"></p>
        <button class="btn" id="resume-upload-button" type="submit">${resume ? 'Upload replacement' : 'Upload resume'}</button>
      </form>
    </section>`;

  // Save the core profile. The API enforces all fields and ownership rules.
  $('#profile-core-form').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('#profile-core-save');
    const errorEl = $('#profile-core-error');
    const payload = {};
    for (const field of coreFields) {
      const value = form.elements.namedItem(field.name).value.trim();
      payload[field.name] = value === '' ? null : value;
    }
    button.disabled = true;
    button.textContent = 'Saving…';
    errorEl.textContent = '';
    try {
      await api('/api/profile/me', { method: 'PATCH', body: payload });
      toast('Profile saved.');
      await show('profile');
    } catch (err) {
      errorEl.textContent = err.message;
      button.disabled = false;
      button.textContent = 'Save profile';
    }
  };

  for (const form of el.querySelectorAll('.profile-detail-form')) {
    form.onsubmit = async event => {
      event.preventDefault();
      const section = form.dataset.section;
      const id = form.dataset.editId;
      const errorEl = $(`#detail-error-${section}`, el);
      const button = form.querySelector('button[type="submit"]');
      const payload = {};
      for (const field of PROFILE_DETAIL_SECTIONS[section].fields) {
        const value = form.elements.namedItem(field.name).value.trim();
        payload[field.name] = value === '' ? null : value;
      }
      button.disabled = true;
      errorEl.textContent = '';
      try {
        await api(`/api/profile/details/${section}${id ? `/${encodeURIComponent(id)}` : ''}`, {
          method: id ? 'PATCH' : 'POST', body: payload,
        });
        toast(`${PROFILE_DETAIL_SECTIONS[section].singular} ${id ? 'updated' : 'added'}.`);
        await show('profile');
      } catch (err) {
        errorEl.textContent = err.message;
        button.disabled = false;
      }
    };
  }

  for (const button of el.querySelectorAll('[data-edit-detail]')) {
    button.onclick = () => {
      const section = button.dataset.editDetail;
      const recordId = Number(button.dataset.id);
      const record = (details[section] || []).find(row => Number(row.id) === recordId);
      if (!record) return toast('This record is no longer available. Reload the profile.', 'bad');
      const form = $(`#detail-form-${section}`, el);
      form.dataset.editId = String(recordId);
      for (const field of PROFILE_DETAIL_SECTIONS[section].fields) {
        const control = form.elements.namedItem(field.name);
        if (control) control.value = field.type === 'date'
          ? profileDateValue(record[field.name])
          : (record[field.name] ?? '');
      }
      form.querySelector('button[type="submit"]').textContent = `Save ${PROFILE_DETAIL_SECTIONS[section].singular}`;
      form.querySelector(`[data-cancel-detail="${section}"]`).hidden = false;
      $(`#editor-${section}`, el).open = true;
      $(`#editor-${section}`, el).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  }

  for (const button of el.querySelectorAll('[data-cancel-detail]')) {
    button.onclick = () => {
      const section = button.dataset.cancelDetail;
      const form = $(`#detail-form-${section}`, el);
      form.reset();
      delete form.dataset.editId;
      form.querySelector('button[type="submit"]').textContent = `Add ${PROFILE_DETAIL_SECTIONS[section].singular}`;
      button.hidden = true;
      $(`#detail-error-${section}`, el).textContent = '';
    };
  }

  for (const button of el.querySelectorAll('[data-delete-detail]')) {
    button.onclick = async () => {
      const section = button.dataset.deleteDetail;
      const id = button.dataset.id;
      if (!confirm(`Delete this ${PROFILE_DETAIL_SECTIONS[section].singular.toLowerCase()}? This cannot be undone.`)) return;
      button.disabled = true;
      try {
        await api(`/api/profile/details/${section}/${encodeURIComponent(id)}`, { method: 'DELETE' });
        toast(`${PROFILE_DETAIL_SECTIONS[section].singular} deleted.`);
        await show('profile');
      } catch (err) {
        button.disabled = false;
        toast(err.message, 'bad');
      }
    };
  }

  const uploadForm = $('#resume-upload-form');
  uploadForm.onsubmit = async event => {
    event.preventDefault();
    const fileInput = $('#resume-file');
    const errorEl = $('#resume-error');
    const button = $('#resume-upload-button');
    const file = fileInput.files?.[0];
    errorEl.textContent = '';
    if (!file) { errorEl.textContent = 'Choose a PDF file first.'; return; }
    if (file.size > 5 * 1024 * 1024) { errorEl.textContent = 'Resume must be 5 MB or smaller.'; return; }
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
      errorEl.textContent = 'Choose a PDF file. Other file types are not accepted.'; return;
    }
    const formData = new FormData();
    formData.append('resume', file, file.name);
    button.disabled = true;
    button.textContent = 'Uploading…';
    try {
      await api('/api/profile/resume', { method: 'POST', body: formData });
      toast(resume ? 'Resume replaced successfully.' : 'Resume uploaded successfully.');
      await show('profile');
    } catch (err) {
      errorEl.textContent = err.message;
      button.disabled = false;
      button.textContent = resume ? 'Upload replacement' : 'Upload resume';
    }
  };

  const downloadButton = $('#resume-download');
  if (downloadButton) downloadButton.onclick = async () => {
    downloadButton.disabled = true;
    try {
      const headers = {};
      if (session.token()) headers.Authorization = `Bearer ${session.token()}`;
      const response = await fetch(`${API_BASE}/api/profile/resume/download`, { headers });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        if (response.status === 401 && session.token()) logout();
        throw new Error(errorBody.error || `Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = safeDownloadName(resume.original_name);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast('Resume download started.');
    } catch (err) {
      toast(err.message, 'bad');
    } finally { downloadButton.disabled = false; }
  };

  const deleteButton = $('#resume-delete');
  if (deleteButton) deleteButton.onclick = async () => {
    if (!confirm('Delete your uploaded resume?')) return;
    deleteButton.disabled = true;
    try {
      await api('/api/profile/resume', { method: 'DELETE' });
      toast('Resume deleted.');
      await show('profile');
    } catch (err) {
      deleteButton.disabled = false;
      toast(err.message, 'bad');
    }
  };
}
