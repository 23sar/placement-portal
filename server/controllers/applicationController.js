const db = require('../config/db');

exports.applyJob = (req, res) => {
  const { job_id } = req.body;
  const student_id = req.user.id;

  const sql = "INSERT INTO applications (job_id, student_id) VALUES (?, ?)";

  db.query(sql, [job_id, student_id], (err, result) => {
    if (err) return res.send(err);
    res.send('Application submitted');
  });
};

exports.getApplicants = (req, res) => {
  const job_id = req.params.jobId;

  const sql = `
    SELECT users.name, users.email 
    FROM applications
    JOIN users ON applications.student_id = users.id
    WHERE applications.job_id = ?
  `;

  db.query(sql, [job_id], (err, result) => {
    if (err) return res.send(err);
    res.json(result);
  });
};