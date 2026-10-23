# Campus Placement Portal — Code Review

**Review type:** Static review of the uploaded ZIP  
**Scope:** Express/MySQL backend, JWT authentication, frontend JavaScript/HTML, Git/configuration, service directories  
**Checks performed:** Source inspection, JavaScript syntax checks, Git tracking/history inspection, project-structure review. No backend/database integration test was run.

## Executive summary

The project has a useful starting point: the primary MySQL/Express API, prepared SQL parameters, bcrypt password hashing in the main auth flow, JWT issuance, and basic student/company route separation. All inspected JavaScript files passed `node --check`.

It is **not ready for real student/company data yet**. The highest-priority issues are exposed tracked configuration secrets, missing company ownership checks on applicant data, and stored HTML/JavaScript injection risk when rendering job data. The UI and API are also out of sync, and the archive has no SQL schema/migration file or meaningful test suite.

## Findings by priority

### P0 — Rotate secrets and remove them from Git

- `server/.env` exists in the archive and is tracked in Git. The committed version contains non-placeholder configuration values. Values are intentionally not repeated here.
- If these values are real, rotate the database password and JWT signing secret immediately. JWT rotation invalidates existing tokens, which is appropriate after a secret exposure.
- Remove `server/.env` from tracking (`git rm --cached server/.env`) and keep it ignored. Retain only `server/.env.example` with placeholders.
- Removing the file in a new commit does not erase previous versions. If the repository is accessible to others and the values were real, rewrite repository history to remove the secret and coordinate the force-push; rotate first regardless.
- Avoid running the application as the database root user. Create a dedicated MySQL user with only the permissions it requires.

### P1 — Company accounts can read applicants for jobs they do not own

- `server/routes/jobRoutes.js:18` checks only that the caller's role is `company`.
- `server/controllers/applicationController.js:15-28` queries applicants by `job_id` and never verifies that the job's `company_id` equals `req.user.id`.
- A company user who learns or guesses another job ID can request that job's applicants and retrieve student names/emails.
- Fix by joining `jobs` in the applicant query and requiring both `applications.job_id = ?` and `jobs.company_id = ?` (the authenticated company ID). Return a proper 403/404 when ownership fails. Add a test proving Company A cannot see Company B's applicants.

### P1 — Stored XSS risk in the job list

- `client/js/jobs.js:27-37` interpolates database values such as `job.title`, `job.company`, and `job.location` into `innerHTML`.
- Job titles/locations can originate from company input. A malicious value can inject markup/event handlers into the student dashboard; this can also expose tokens stored in `localStorage`.
- Build the card with DOM APIs and place untrusted strings with `textContent`. Attach button behavior with `addEventListener`, not an inline `onclick` string. Do not rely on a simple blacklist or HTML escaping applied inconsistently.

### P1 — Registration trusts the submitted role and has no input validation

- `server/controllers/authController.js:4-11` accepts `name`, `email`, `password`, and `role` directly from the request body.
- The UI offers `student` and `company`, but clients can bypass the UI and submit other role values. Company registration is also open without any verification workflow.
- Validate and normalize fields server-side, enforce an explicit role allowlist, and decide whether company accounts require placement-cell approval. Do not support an admin role through public registration.

### P1 — Error responses use success status codes and can leak database details

- Most controllers use `res.send(err)` for database failures and `res.send(...)` for authentication failures without setting HTTP status codes.
- Since Express defaults these responses to HTTP 200, the frontend can treat failures as success. For example, `client/js/jobs.js:64-66` only checks `res.ok`, so an application insert failure returned with status 200 can make the button display “Applied”.
- Return structured JSON errors with correct statuses (400 validation, 401 unauthenticated, 403 forbidden, 404 missing resource, 409 duplicate, 500 unexpected failure). Log detailed internal errors on the server; do not send raw SQL errors to the browser. Update frontend requests to handle non-2xx responses and show meaningful messages.

### P2 — Authentication header contract is non-standard

- `server/middleware/authMiddleware.js:3-13` passes the entire `Authorization` header directly to `jwt.verify`.
- The current frontend sends only the raw token, so these pieces match each other. Standard clients usually send `Authorization: Bearer <token>`, which this middleware will reject.
- Standardize on the Bearer scheme: parse and validate the prefix server-side and send `Bearer ${token}` from the client. Return 401 JSON for absent/invalid tokens and 403 for insufficient role.

### P2 — Job company label does not match the API data

- `server/controllers/jobController.js:7` stores `company_id`; `getJobs` returns `SELECT * FROM jobs` without joining a company/user name.
- `client/js/jobs.js:29` reads `job.company`. That field is not populated by the visible create-job API, so the UI is likely to show the generic “Company” label instead of a company name.
- Return an explicit, minimal job response and join the owning company name (or store a dedicated company profile reference). Avoid exposing unnecessary `SELECT *` columns.

### P2 — Dashboard shows mock data and has unfinished navigation

- `client/dashboard.html:26-33` and `:41-81` contain literal triple-backtick characters that look like Markdown fences but are not HTML syntax; they will appear as page text.
- The dashboard's application counts (12, 5, 3) are hard-coded, and sidebar entries for Jobs, Applications, and Profile are not functioning navigation.
- An API endpoint exists at `GET /api/applications/my`, but there is no frontend page or script using it in this archive. The status display also has no visible employer endpoint to update an application's status.
- Add a client-side login guard for usability, but enforce authentication and permissions on the server as the real protection. Replace mock stats with API data or label them clearly as placeholders.

### P2 — Conflicting/incomplete server directories

- `server/` is the primary MySQL/Express application referenced by the README.
- `auth-service/` is a separate MongoDB implementation. It stores passwords as plain text (`auth-service/controllers/authController.js:6`) and looks up a user by matching the submitted email/password directly (`:15`); it does not issue JWTs. Do not use this implementation as-is.
- `application-service/app.js:12` requires `./routes/authRoutes`, but `application-service/routes/authRoutes.js` is absent from the uploaded files, so that service will fail to start.
- Choose one architecture. For the current MVP, the safest path is to keep the main MySQL server and remove/archive the unused service folders, or redesign them deliberately before running them.

### P2 — Missing schema, migration, and tests

- No `.sql` schema, migration, seed script, or test files were present in the uploaded project.
- The `server/package.json` test script is only a placeholder that exits with “no test specified”.
- Without the schema, I could not confirm foreign keys, enum/check constraints, uniqueness for duplicate applications, or the exact `applications.status` defaults.
- Add a versioned schema/migration for `users`, `jobs`, and `applications`; include appropriate foreign keys and unique constraints (at minimum, prevent duplicate applications for the same student/job if that is the intended policy). Add tests for auth, roles, job ownership, apply flow, duplicate applications, and error statuses.

### P3 — Setup and maintainability

- The browser JavaScript hard-codes `http://localhost:5000`, which will break outside the developer's machine unless changed for deployment. Use a configurable API base URL or serve the frontend from the same origin.
- `server/config/db.js` uses a single connection and logs connection failures but the server still starts. Prefer a connection pool and fail fast (or expose an unhealthy state) if database initialization fails.
- `cors()` permits every origin. Restrict origins for deployment.
- The ZIP includes `.git` and `node_modules`, adding size and unnecessarily packaging repository metadata/dependencies. Exclude them from project-sharing ZIPs; install dependencies from package-lock files.

## Recommended implementation sequence

1. **Secure configuration:** rotate real secrets, remove `.env` from Git tracking/history as appropriate, and use a dedicated MySQL app user.
2. **Fix server-side authorization:** enforce company ownership on applicant queries; validate all request bodies and allowed roles.
3. **Fix response contracts:** consistent JSON and HTTP statuses, safe error handling, duplicate-application behavior, Bearer token parsing.
4. **Fix frontend rendering:** remove `innerHTML` interpolation for server data; correct company names; handle error responses reliably.
5. **Complete placement workflow:** company job management, student applications page, applicant status updates, real dashboard statistics, functional navigation.
6. **Make it reproducible:** add schema/migrations, safe sample seed data, setup instructions, and meaningful automated tests.

## Verification notes

- JavaScript syntax checks: passed for the inspected `.js` files.
- Database/API integration: not run; no schema/migration file was included, and I did not run the uploaded application against a database.
- Dependency vulnerability audit: not run.

**Suggested next step:** begin with the secret rotation and the applicant-ownership authorization bug, then work through one tested backend flow at a time.
