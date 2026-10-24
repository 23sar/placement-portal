# 🎓 Campus Placement Portal

A production-ready, full-stack college recruitment management system built to connect students with hiring companies. The platform streamlines job postings, student applications, and candidate evaluation through an intuitive, role-based web interface.

---

## 🚀 Key Features

### 👨‍🎓 For Students
- **Role-based Authentication:** Secure JWT-based registration and login with bcrypt password hashing.
- **Job Discovery & Search:** Browse active job and internship openings with real-time title/location search filtering.
- **One-Click Application:** Apply for open positions with database-enforced duplicate prevention.
- **Application Tracking:** Real-time status tracking (Pending, Shortlisted, Rejected) with color-coded status badges.
- **Personalized Metrics:** Real-time dashboard showing application counts and review status.

### 🏢 For Companies
- **Job Lifecycle Management:** Create, list, view, and delete job postings with stipend, location, and description details.
- **Applicant Review Pipeline:** View all students who applied for each specific job posting.
- **Decision Workflow:** In-place shortlisting and rejection of candidates without page reloads.
- **Company Dashboard:** Overview of total jobs posted, total applicants, shortlisted counts, and pending reviews.

### 🎨 UI & Aesthetics
- Clean modern interface styled with Tailwind CSS and Font Awesome icons.
- Instant Dark/Light mode toggle with persistence via `localStorage`.
- Mobile-friendly responsive layouts with desktop sidebars.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express.js (Modular Router & Controller architecture) |
| **Database** | MySQL (Relational schema with foreign keys, indexes & constraints) |
| **Authentication** | JWT (`jsonwebtoken`) & `bcrypt` password hashing |
| **Frontend** | Semantic HTML5, Vanilla JavaScript (ES6+ modular fetch API), Tailwind CSS |
| **Documentation** | Markdown API specs (`docs/api.md`), Schema & Seed scripts |

---

## 📂 Project Architecture

```
placement-portal/
├── README.md                  # Project overview, setup, and features
├── .gitignore                 # Version control exclusions
│
├── docs/                      # Architectural & API reference
│   ├── api.md                 # Complete REST API specification
│   └── screenshots/           # UI walkthrough captures
│
├── database/                  # Database definitions
│   ├── schema.sql             # Table definitions & foreign key constraints
│   └── seed.sql               # Demo data with verified bcrypt hashes
│
├── backend/                   # Express.js REST API
│   ├── package.json
│   ├── .env.example           # Template for environment configuration
│   ├── .env                   # Local environment secrets (not committed)
│   └── src/
│       ├── server.js          # Server entrypoint (initializes port & DB pool)
│       ├── app.js             # Express app setup (CORS, JSON parser, routes, error handlers)
│       ├── config/
│       │   └── db.js          # MySQL2 connection pool with promise wrapper
│       ├── middleware/
│       │   ├── auth.js        # JWT verification and role authorization guards
│       │   └── errorHandler.js# Centralized error handler
│       ├── routes/
│       │   ├── auth.js        # /api/auth routes
│       │   ├── jobs.js        # /api/jobs routes
│       │   └── applications.js# /api/applications routes
│       └── controllers/
│           ├── authController.js
│           ├── jobController.js
│           └── applicationController.js
│
└── frontend/                  # Client-side web application
    ├── index.html             # Landing page
    ├── pages/
    │   ├── login.html         # User sign-in
    │   ├── register.html      # User registration
    │   ├── student/
    │   │   ├── dashboard.html # Job browsing & quick stats
    │   │   └── my-applications.html # Application status tracking table
    │   └── company/
    │       ├── dashboard.html # Company metrics & active job list
    │       ├── post-job.html  # Create job posting form
    │       └── applicants.html# Candidate review & shortlisting table
    └── assets/
        ├── css/
        │   └── style.css      # Core stylesheet and design tokens
        └── js/
            ├── core/
            │   ├── config.js  # Centralized API base URL config
            │   ├── api.js     # Unified fetch wrapper with auth header injection
            │   ├── auth.js    # Session storage, auth guards, logout handler
            │   └── theme.js   # Dark mode toggle & state management
            └── pages/
                ├── login.js
                ├── register.js
                ├── student-dashboard.js
                ├── student-applications.js
                ├── company-dashboard.js
                ├── company-post-job.js
                └── company-applicants.js
```

---

## ⚡ Quick Start Guide

### 1. Prerequisites
- **Node.js** (v18.x or later)
- **MySQL Server** (v8.x or MariaDB)

### 2. Database Setup
Log into your MySQL client and run the initialization scripts:

```bash
# 1. Create the database and tables
mysql -u root -p < database/schema.sql

# 2. Seed initial demo users and test jobs
mysql -u root -p < database/seed.sql
```

> **Demo Seed Accounts (Password: `Test@1234`):**
> - **Company:** `techcorp@example.com`
> - **Student 1:** `alice@example.com`
> - **Student 2:** `bob@example.com`

---

### 3. Backend Setup

1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your environment:
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your MySQL credentials:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=placement_portal
   JWT_SECRET=your_jwt_secret_key_here
   PORT=5000
   ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000
   ```
4. Start the server:
   ```bash
   # Development mode with hot-reloading:
   npm run dev

   # Or standard production mode:
   npm start
   ```
   The backend will be live at `http://localhost:5000`.

---

### 4. Frontend Access

Open the `frontend` folder using any static file server:
- **VS Code Live Server:** Right-click `frontend/index.html` → *Open with Live Server* (port 5500).
- **Node `serve` / `http-server`:**
  ```bash
  npx serve frontend -p 5500
  ```
- Browse to `http://localhost:5500`.

---

## 📚 API Reference

See [`docs/api.md`](docs/api.md) for full endpoint specifications, request payloads, and status codes.

---

## 🔒 Security Best Practices Implemented

- **Password Hashing:** Passwords hashed with `bcrypt` (salt rounds: 10).
- **Protected Endpoints:** Strict JWT verification and role-based checks (`student` vs `company`).
- **Resource Ownership Authorization:** Only the company that published a job can view applicants, delete the job, or modify application status.
- **SQL Injection Prevention:** 100% parameterized queries using `mysql2/promise`.
- **Duplicate Prevention:** Database `UNIQUE(job_id, student_id)` constraint prevents multi-apply race conditions.
- **CORS Protection:** Configurable origin allowlisting in Express.
=======
# 🎓 Campus Placement Portal  

A full-stack web application designed to simplify campus recruitment for both students and companies. It enables companies to post job openings and manage applicants, while students can explore opportunities and apply through a single platform.

---

## 🚀 Features  

- Secure authentication using JWT  
- Role-based access (Student / Company)  
- Job posting and management for companies  
- Job browsing and application system for students  
- Clean and responsive user interface  
- Dark mode support  

---

## 🛠 Tech Stack  

- **Backend:** Node.js, Express.js  
- **Database:** MySQL  
- **Frontend:** HTML, CSS, JavaScript  
- **Authentication:** JWT  

---

## ⚙️ Setup Instructions  

1. Clone the repository  
```bash
git clone https://github.com/23sar/placement-portal.git
```
2. Navigate to server directory
```bash
cd placement-portal/server
```
3. Install dependencies
```bash
npm install
```
4. Start the server
```bash
node server.js
```
# 📌 Project Overview

This project was built to gain hands-on experience with real-world system design, backend development, authentication, and database integration. It focuses on building a scalable and structured solution for managing campus placements efficiently.

# 🔮 Future Improvements
- Resume upload and parsing
- Admin dashboard
- Email notifications
- Advanced filtering and search
- Deployment and cloud integration
