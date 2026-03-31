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