const db = require('../config/db');

exports.createJob = (req, res) => {
  const { title, description, location, stipend } = req.body;
  const company_id = req.user.id;

  const sql = "INSERT INTO jobs (title, description, location, stipend, company_id) VALUES (?, ?, ?, ?, ?)";

  db.query(sql, [title, description, location, stipend, company_id], (err, result) => {
    if (err) return res.send(err);
    res.send('Job created successfully');
  });
};

exports.getJobs = (req, res) => {
  const sql = "SELECT * FROM jobs";

  db.query(sql, (err, result) => {
    if (err) return res.send(err);
    res.json(result);
  });
};