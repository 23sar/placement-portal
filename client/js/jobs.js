async function loadJobs() {
  const token = localStorage.getItem('token');

  const res = await fetch('http://localhost:5000/api/jobs', {
    headers: { 'Authorization': token }
  });

  const jobs = await res.json();
  const container = document.getElementById('jobs');

  jobs.forEach(job => {
    const div = document.createElement('div');

    div.innerHTML = `
      <h3><i class="fa-solid fa-briefcase"></i> ${job.title}</h3>
      <p><i class="fa-solid fa-location-dot"></i> ${job.location}</p>
      <p>${job.description}</p>
      <p><i class="fa-solid fa-indian-rupee-sign"></i> ₹${job.stipend}</p>
      <button onclick="applyJob(${job.id})">
        <i class="fa-solid fa-paper-plane"></i> Apply
      </button>
    `;

    container.appendChild(div);
  });
}

async function applyJob(jobId) {
  const token = localStorage.getItem('token');

  const res = await fetch('http://localhost:5000/api/jobs/apply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token
    },
    body: JSON.stringify({ job_id: jobId })
  });

  const data = await res.text();
  alert(data);
}

function logout() {
  localStorage.removeItem('token');
  window.location.href = 'login.html';
}

loadJobs();