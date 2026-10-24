/**
 * company-post-job.js
 * Page: frontend/pages/company/post-job.html
 */

authGuard('company');
populateUserInfo();

document.getElementById('post-job-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const title       = document.getElementById('title').value.trim();
  const description = document.getElementById('description').value.trim();
  const location    = document.getElementById('location').value.trim();
  const stipend     = document.getElementById('stipend').value.trim();
  const errorEl     = document.getElementById('error-msg');
  const successEl   = document.getElementById('success-msg');
  const btn         = document.getElementById('post-btn');

  errorEl.textContent   = '';
  successEl.textContent = '';

  if (!title || !description || !location) {
    errorEl.textContent = 'Title, description, and location are required.';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Posting…';

  try {
    const data = await api.post('/api/jobs/create', {
      title,
      description,
      location,
      stipend: stipend ? Number(stipend) : null,
    });

    successEl.textContent = `Job posted successfully! (ID: ${data.jobId})`;
    document.getElementById('post-job-form').reset();
  } catch (err) {
    errorEl.textContent = err.message || 'Failed to post job.';
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Post Job';
  }
});
