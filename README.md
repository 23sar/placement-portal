# Campus Placement Portal

A full-stack campus recruitment management application for students, recruiting companies, and a college Placement Cell administrator. The portal manages job posting, approval, applications, candidate review, and application-history retention through a role-aware web interface and an Express/MySQL API.

> **Project status:** The core workflows and automated regression suites have been implemented and tested locally. Complete browser-based acceptance testing and deployment-specific hardening should be performed before using the system for real college recruitment. This README does not claim the application is production-ready.

## Features

### Students
- Register and sign in using JWT-based authentication.
- Browse jobs that have been approved, are open, and have not passed their application deadline.
- Apply to eligible jobs and view application history/status.
- Duplicate applications are prevented at the database level.
- View a role-specific dashboard and application metrics.

### Companies
- Create job postings, which enter the Placement Cell approval queue.
- View their own postings and approval status.
- Edit their own company-created jobs. A substantive edit returns the posting to **Pending Approval** and clears the previous rejection/review metadata as appropriate.
- See rejection reasons and resubmit corrected postings for review.
- View applicants for postings they are authorized to manage and update candidate decisions using the existing application workflow.
- Close or reopen eligible company-owned postings.
- Cannot edit or delete Placement Cell-managed postings, even when associated with a company account for applicant review.

### Placement Cell administrators
- View dashboard metrics and the pending company-job approval queue.
- Approve or reject company postings; a meaningful rejection reason is required.
- Publish jobs directly for external organizations or registered companies without sending Placement Cell-created postings through the company approval queue.
- View and filter all job postings, including posting source, approval state, availability, creator/reviewer metadata, and application counts.
- Edit Placement Cell-created postings while preserving their creator attribution and posting source.
- Manage job availability and review applicants within the existing permission rules.
- Use revision-aware review requests to reject stale approval/rejection actions when the posting has changed since it was reviewed.

### Application history and data integrity
- Jobs with existing applications cannot be permanently deleted through the application; the API returns **HTTP 409 Conflict** and advises the authorized user to close the job instead.
- The `applications.job_id` foreign key uses `ON DELETE RESTRICT` in the current schema, helping prevent accidental loss of application history.
- Editing or resubmitting a job preserves its ID and existing applications.
- User accounts associated with historical records are intended to be deactivated rather than physically deleted.

## Technology stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js, modular routes and controllers |
| Database | MySQL with InnoDB foreign keys, indexes, and constraints |
| Authentication | JSON Web Tokens (`jsonwebtoken`) and `bcrypt` password hashing |
| Frontend | HTML, CSS, Vanilla JavaScript, Fetch API |
| Other | `mysql2`, `dotenv`, Express CORS middleware |

## Repository layout

```text
placement-portal/
├── README.md
├── docs/
│   └── api.md                         # API reference
├── database/
│   ├── schema.sql                     # Fresh-install schema
│   ├── seed.sql                       # Local demo users/data
│   ├── seed_admin_dev.sql             # Development-only admin seed
│   ├── verify_migration.js            # Migration verification utility
│   └── migrations/
│       ├── 001_job_approval_workflow.sql
│       ├── 002_approval_review_audit.sql
│       ├── 003_restrict_application_deletion.sql
│       └── 004_add_job_revision.sql
├── backend/
│   ├── .env.example                   # Environment template; safe to commit
│   ├── package.json
│   ├── src/
│   │   ├── server.js                  # Server entry point
│   │   ├── app.js                     # Express app, middleware and routes
│   │   ├── config/db.js               # MySQL connection pool
│   │   ├── middleware/                # Authentication and error handling
│   │   ├── routes/                    # Auth, jobs and applications routes
│   │   └── controllers/               # Auth, job and application logic
│   └── tests/
│       ├── step3_backend.test.js
│       ├── step4_backend.test.js
│       ├── step5_integration.test.js
│       ├── step6_backend.test.js
│       └── step7_backend.test.js
└── frontend/
    ├── index.html
    ├── pages/
    │   ├── login.html
    │   ├── register.html
    │   └── dashboard.html
    └── assets/
        ├── css/style.css
        └── js/
            ├── core/core.js           # API base URL, auth/session, escaping, theme, toast
            └── pages/                 # Authentication and role-aware dashboard logic
```

## Prerequisites

- Node.js 18 or later.
- MySQL 8 or a compatible MariaDB installation.
- MySQL Workbench or the MySQL command-line client.
- A browser such as Chrome, Firefox, or Edge.

## Local setup

Run commands from the repository root unless the step says otherwise.

### 1. Create the database

For a **fresh local installation**, create the latest schema:

```bash
mysql -u root -p < database/schema.sql
```

Then, if you want the demo users and sample data, run the seed scripts:

```bash
mysql -u root -p placement_portal < database/seed.sql
mysql -u root -p placement_portal < database/seed_admin_dev.sql
```

You can also execute these SQL files through MySQL Workbench. The `seed_admin_dev.sql` script is for local development and QA only; **do not use its development credentials in a deployed environment**.

> **Existing database warning:** Do not rerun the schema or all migrations blindly against a database that already contains data. Inspect its current schema and determine which migrations have already been applied. Migrations 003 and 004 change existing tables and are not intended to be run repeatedly. Back up the database before applying a migration.

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

Do not commit `.env` or share its contents. The repository includes `.env.example` as a placeholder-based template.

### 3. Start the backend

From `backend/`:

```bash
npm run dev
```

`npm run dev` uses Nodemon for development auto-restarts. Alternatively, run the server without auto-restarting:

```bash
npm start
```

The API defaults to `http://localhost:5000`. The root endpoint can be used as a basic health check:

```text
http://localhost:5000/
```

It should return a small JSON status response when the server is running.

### 4. Start the frontend

Open a **second terminal** and run a static file server from the frontend directory. For example, using Python:

```bash
cd frontend
py -m http.server 5500
```

Open [http://localhost:5500](http://localhost:5500). You can alternatively use VS Code Live Server on port 5500.

The frontend's API base URL is configured in `frontend/assets/js/core/core.js`. If you change the backend host or port, update that setting and the `ALLOWED_ORIGINS` environment variable to match the frontend origin.

## Local demo accounts

The demo seed data documents the following student/company credentials for local testing:

| Role | Email | Password |
|---|---|---|
| Company | `techcorp@example.com` | `Test@1234` |
| Student | `alice@example.com` | `Test@1234` |
| Student | `bob@example.com` | `Test@1234` |

The development administrator is created by `database/seed_admin_dev.sql`. That script contains its local-only credentials and warns against use outside development/QA. Do not use demo accounts or default credentials for a real deployment.

## Automated tests

Run tests from the `backend/` directory. Each suite provisions its own isolated test database; do not change the test configuration to target a development or production database.

```bash
npm test                 # Step 4 approval/lifecycle tests and baseline regressions
npm run test:step3       # Job creation and publication rules
npm run test:step5       # Admin dashboard integration
npm run test:step6       # Job editing, resubmission and application retention
npm run test:step7       # Stale approvals and strict input validation
```

The suites cover role authorization, job creation, approval/rejection, revision-aware reviews, editing and resubmission, dashboard data, input validation, application duplication, and protection of application history. Run the commands and inspect the output to verify the current checkout; historical test results do not guarantee future changes will pass.

## Database migrations

Migration files are numbered in execution order for existing databases:

1. `001_job_approval_workflow.sql` — job source and approval workflow schema.
2. `002_approval_review_audit.sql` — review metadata and audit fields.
3. `003_restrict_application_deletion.sql` — restricts deleting jobs referenced by applications.
4. `004_add_job_revision.sql` — adds the revision counter used to detect stale approval actions.

The current `database/schema.sql` represents a fresh-install schema and includes the job revision field and restrictive application foreign key. For an existing database, inspect its columns and foreign-key rules first, back it up, and apply only migrations that are still needed. Do not rerun migration 003 if `fk_app_job` already uses `ON DELETE RESTRICT`, or migration 004 if `jobs.revision` already exists.

## API documentation

See [`docs/api.md`](docs/api.md) for the REST endpoints and request/response details. Key route groups include:

- `/api/auth` — registration and login.
- `/api/jobs` — browsing, creating, editing, reviewing, closing/reopening, and deleting job postings subject to role and retention rules.
- `/api/applications` — application dashboard data and related application operations.

## Security and operational notes

- Passwords are stored as bcrypt hashes.
- JWT authentication and backend role checks protect restricted routes.
- Company ownership and Placement Cell posting-source rules are checked server-side.
- SQL operations use parameterized queries in the application code.
- A database uniqueness constraint prevents duplicate applications to the same job.
- Revision-aware approval requests help prevent a stale review from approving a newer job version.
- Jobs with application history are protected from permanent deletion both at the API layer and by the database foreign key.
- CORS is configured through `ALLOWED_ORIGINS`.
- Keep secrets out of Git; rotate credentials immediately if they are exposed.

Before deploying, configure production credentials and CORS explicitly, use HTTPS, review logging/error handling and operational monitoring, provision administrator accounts securely, and test the target deployment environment. The local automated suites are important checks but are not, by themselves, a production-readiness certification.

## Project goal

This project demonstrates full-stack development, relational data modeling, role-based access control, moderation workflows, auditability, concurrency-aware updates, and careful retention of student application history in a campus recruitment setting.
