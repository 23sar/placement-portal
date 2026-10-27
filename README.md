# Campus Placement Portal

A full-stack campus recruitment management application for students, recruiting companies, and a college Placement Cell administrator. The portal supports job posting and approval, applications and candidate review, student profile and resume management, and moderated placement announcements with persistent student read/unread tracking.

> **Project status:** The major application workflows and automated regression suites have been implemented. Complete browser-based acceptance testing and deployment-specific hardening should be performed before using the system for real college recruitment. Passing local tests alone does not certify production readiness.

## Features

### Students
- Register and sign in using JWT-based authentication.
- Browse jobs that have been approved, are open, and have not passed their application deadline.
- Apply to eligible jobs and view application history/status. Duplicate applications are prevented at the database level.
- Maintain a student profile with academic/contact details, technical interests, and GitHub, LinkedIn, and portfolio links.
- Manage structured profile sections for skills, projects, internships/experience, and achievements/certifications.
- View a profile-completion indicator based on profile information.
- Upload, download, replace, and delete a PDF resume. Resume files are stored outside the public frontend and served through authenticated endpoints.
- Read published placement announcements in **What's Going On?**. Pending and rejected company announcements are not shown to students.
- Track unread announcements using a sidebar count; mark an individual announcement or all published announcements as read. Read state is persisted independently for each student.
- Use a role-specific dashboard and application metrics.

### Companies
- Create job postings, which enter the Placement Cell approval queue.
- View their own postings and approval status.
- Edit their own company-created jobs. A substantive edit returns the posting to **Pending Approval** and clears previous rejection/review metadata as appropriate.
- See rejection reasons and resubmit corrected postings for review.
- View applicants for postings they are authorized to manage and update candidate decisions using the existing application workflow.
- Close or reopen eligible company-owned postings.
- Submit placement announcements for Placement Cell review and track Pending, Approved, or Rejected status.
- View rejection feedback and delete only their own announcements, subject to backend authorization rules.
- Cannot edit or delete Placement Cell-managed job postings, approve their own announcements, or publish a pending announcement directly.

### Placement Cell administrators
- View dashboard metrics and the pending company-job approval queue.
- Approve or reject company job postings; a meaningful rejection reason is required.
- Publish jobs directly for external organizations or registered companies without sending Placement Cell-created postings through the company approval queue.
- View and filter all job postings, including posting source, approval state, availability, creator/reviewer metadata, and application counts.
- Edit Placement Cell-created postings while preserving creator attribution and posting source.
- Manage job availability and review applicants within the existing permission rules.
- Use revision-aware review requests to reject stale job approval/rejection actions.
- Create and publish Placement Cell announcements immediately.
- Review company announcement submissions, approve or reject them with a reason, and view announcement management information.

### Application history and data integrity
- Jobs with existing applications cannot be permanently deleted through the application; the API returns **HTTP 409 Conflict** and advises the authorized user to close the job instead.
- The `applications.job_id` foreign key uses `ON DELETE RESTRICT` in the current schema, helping prevent accidental loss of application history.
- Editing or resubmitting a job preserves its ID and existing applications.
- User accounts associated with historical records are intended to be deactivated rather than physically deleted.
- Announcement approval uses revision-aware, transaction-based review checks to reject stale or repeated review requests.
- Student announcement read state is stored per student, not globally on an announcement.

## Technology stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js, modular routes and controllers |
| Database | MySQL with InnoDB foreign keys, indexes, and constraints |
| Authentication | JSON Web Tokens (`jsonwebtoken`) and `bcrypt` password hashing |
| Frontend | HTML, CSS, Vanilla JavaScript, Fetch API |
| Database driver/configuration | `mysql2`, `dotenv`, Express CORS middleware |
| Resume storage | Private filesystem storage by default, configurable using `RESUME_STORAGE_DIR` |
| Testing | Node.js test scripts using isolated temporary MySQL databases |

## Repository layout

```text
placement-portal/
├── README.md
├── docs/
│   └── api.md
├── database/
│   ├── schema.sql                     # Fresh-install schema
│   ├── seed.sql                       # Local demo users/data
│   ├── seed_admin_dev.sql             # Development-only admin seed
│   └── migrations/
│       ├── 001_job_approval_workflow.sql
│       ├── 002_approval_review_audit.sql
│       ├── 003_restrict_application_deletion.sql
│       ├── 004_add_job_revision.sql
│       ├── 005_create_student_profiles.sql
│       ├── 006_student_profile_details.sql
│       ├── 007_create_student_resumes.sql
│       ├── 008_create_announcements.sql
│       └── 009_create_announcement_reads.sql
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── src/
│   │   ├── server.js
│   │   ├── app.js
│   │   ├── config/db.js
│   │   ├── middleware/
│   │   ├── routes/                    # Auth, jobs, applications, profile, resume, announcements
│   │   └── controllers/               # Auth, jobs, applications, profiles, resumes, announcements
│   ├── storage/resumes/               # Private resume files; do not commit or serve publicly
│   └── tests/
│       ├── step3_backend.test.js
│       ├── step4_backend.test.js
│       ├── step5_integration.test.js
│       ├── step6_backend.test.js
│       ├── step7_backend.test.js
│       ├── step8_profile_api.test.js
│       ├── step8_profile_details.test.js
│       ├── step8_resume_api.test.js
│       ├── step8_announcements_api.test.js
│       └── step8_announcements_read_tracking.test.js
└── frontend/
    ├── index.html
    ├── pages/
    │   ├── login.html
    │   ├── register.html
    │   └── dashboard.html
    └── assets/
        ├── css/style.css
        └── js/
            ├── core/core.js
            └── pages/dashboard.js
```

## Prerequisites

- Node.js 18 or later.
- MySQL 8 or a compatible MariaDB installation.
- MySQL Workbench or the MySQL command-line client.
- A browser such as Chrome, Firefox, or Edge.

## Local setup

Run commands from the repository root unless the step says otherwise.

### 1. Create the database (fresh installation only)

For a **fresh local installation**, create the latest schema:

```bash
mysql -u root -p < database/schema.sql
```

Then, if you want demo users and sample data, run the seed scripts:

```bash
mysql -u root -p placement_portal < database/seed.sql
mysql -u root -p placement_portal < database/seed_admin_dev.sql
```

You can also execute SQL files in MySQL Workbench. The `seed_admin_dev.sql` script is for local development and QA only; **do not use its development credentials in a deployed environment**.

> **Existing database warning:** Do not rerun the schema, drop tables, or run every migration blindly against a database that already contains data. Inspect its current schema, back it up, and apply only migrations that are still needed. Some earlier migrations alter existing tables and are not intended to be blindly repeated.

### 2. Configure the backend

```bash
cd backend
npm install
```

Create a local environment file from the template. In Git Bash on Windows:

```bash
cp .env.example .env
```

Edit `backend/.env` with your local MySQL credentials and a unique, random JWT secret:

```dotenv
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=placement_portal
JWT_SECRET=replace_with_a_long_random_secret
PORT=5000
ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000
```

Do not commit `.env` or share its contents. `.env.example` should contain placeholders only.

Resume PDFs are stored privately by default under `backend/storage/resumes/`. This directory is ignored by Git and must not be exposed as a public static directory. To use a dedicated private disk or persistent volume, set `RESUME_STORAGE_DIR` to an absolute directory that is writable by the backend process and not publicly served.

### 3. Start the backend

From `backend/`:

```bash
npm run dev
```

`npm run dev` uses Nodemon for development auto-restarts. Alternatively, start the server without auto-restarting:

```bash
npm start
```

The API defaults to `http://localhost:5000`. The root endpoint can be used as a basic health check:

```text
http://localhost:5000/
```

### 4. Start the frontend

Open a **second terminal** and run a static file server from the frontend directory. For example, using Python:

```bash
cd frontend
py -m http.server 5500
```

Open [http://localhost:5500](http://localhost:5500). You can alternatively use VS Code Live Server on port 5500.

The frontend API base URL is configured in `frontend/assets/js/core/core.js`. If you change the backend host or port, update that setting and `ALLOWED_ORIGINS` to match the frontend origin.

## Local demo accounts

The demo seed data documents the following student/company credentials for local testing:

| Role | Email | Password |
|---|---|---|
| Company | `techcorp@example.com` | `Test@1234` |
| Student | `alice@example.com` | `Test@1234` |
| Student | `bob@example.com` | `Test@1234` |

The development administrator is created by `database/seed_admin_dev.sql`. That script contains local-only credentials and warns against use outside development/QA. Do not use demo accounts or default credentials for a real deployment.

## Automated tests

Run tests from the `backend/` directory. The suites provision isolated temporary test databases; they must not be configured to target the development or production database.

```bash
npm test                              # Step 4 approval/lifecycle tests and Step 3 baseline scenarios
npm run test:step3                    # Job creation and publication rules
npm run test:step5                    # Admin dashboard integration
npm run test:step6                    # Job editing, resubmission and application retention
npm run test:step7                    # Stale approvals and strict job input validation
npm run test:step8-profile            # Core student profile API
npm run test:step8-details            # Skills, projects, internships and achievements
npm run test:step8-resume             # Private PDF resume API
npm run test:step8-announcements      # Company announcement and admin approval workflow
npm run test:step8-read-tracking      # Student-specific announcement read/unread state
npm run test:step8                    # All Step 8 test suites
```

The suites cover authorization, student profile ownership, profile data validation, resume file validation and access, announcement submission/review, stale review protection, student-specific read tracking, and regression protection for existing job/application workflows. Run the commands and inspect their output to verify the current checkout; historical test results do not guarantee future changes will pass.

## Database migrations

Migration files are numbered in execution order for existing databases:

1. `001_job_approval_workflow.sql` — job source and approval workflow schema.
2. `002_approval_review_audit.sql` — review metadata and audit fields.
3. `003_restrict_application_deletion.sql` — restricts deleting jobs referenced by applications.
4. `004_add_job_revision.sql` — adds the revision counter used to detect stale job approval actions.
5. `005_create_student_profiles.sql` — core student profile table.
6. `006_student_profile_details.sql` — skills, projects, internships and achievements tables.
7. `007_create_student_resumes.sql` — resume metadata table; PDF bytes are stored separately in private filesystem storage.
8. `008_create_announcements.sql` — announcement creation, publishing, and approval/rejection workflow.
9. `009_create_announcement_reads.sql` — per-student persistent announcement read tracking.

`database/schema.sql` is the fresh-install schema and should contain the current table definitions, including these Step 8 tables. For an existing database, inspect which tables/columns already exist and apply only the missing migrations in order. In particular, migration 009 depends on the `announcements` table from migration 008. Do not rerun a migration merely because a test database was created; test suites provision their own isolated schemas.

You may apply migration files with MySQL Workbench. If using the MySQL CLI, run commands from the repository root with the appropriate database credentials and confirm the target database before applying a migration. Back up important data first. Do not use `DROP DATABASE` as a migration strategy.

## API overview

See [`docs/api.md`](docs/api.md) for the project's REST API documentation. Major route groups include:

- `/api/auth` — registration and login.
- `/api/jobs` — job browsing, creation, editing, approval/rejection, closing/reopening and deletion, subject to role and retention rules.
- `/api/applications` — application operations and related dashboard information.
- `/api/profile` — student core profile and structured profile details.
- `/api/profile/resume` — authenticated resume metadata, upload, download and deletion operations.
- `/api/announcements` — announcement feed, company submissions, administrator review, and placement-cell publishing.
- `/api/announcements/unread-count`, `/api/announcements/:id/read`, and `/api/announcements/read-all` — authenticated student read/unread tracking.

The backend's route definitions and controllers are the source of truth for current request/response details. Keep `docs/api.md` synchronized when the API contract changes.

## Security and operational notes

- Passwords are stored as bcrypt hashes.
- JWT authentication and server-side role checks protect restricted routes.
- Company ownership, Placement Cell posting-source rules, and student-specific read state are checked server-side.
- SQL operations use parameterized queries in application code.
- A database uniqueness constraint prevents duplicate applications to the same job.
- Revision-aware review requests help prevent stale approval/rejection actions.
- Company announcements remain hidden from students until approved and published.
- Resume uploads are PDF-only, size-limited, checked by the backend, and saved under private storage with generated storage keys. Downloads require authorization. Keep stored resume files out of Git and outside any public static directory.
- Jobs with application history are protected from permanent deletion through API rules and the database foreign key.
- CORS is configured through `ALLOWED_ORIGINS`.
- Keep secrets out of Git; rotate credentials immediately if they are exposed.

Before deploying, configure production credentials and CORS explicitly, use HTTPS, review logging and error handling, set up operational monitoring and backups, provision administrator accounts securely, and test the target deployment environment. The local automated suites are important checks but are not, by themselves, a production-readiness certification.

## Project goal

This project demonstrates full-stack development, relational data modeling, role-based access control, moderation and approval workflows, auditability, concurrency-aware updates, student profile and resume management, persistent notifications/read tracking, and careful retention of student application history in a campus recruitment setting.
