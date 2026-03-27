# 🎓 Campus Placement Portal

A full-stack web application designed to streamline campus recruitment by connecting students and companies.

---

## 🚀 Features

- 🔐 User Authentication (JWT-based login/register)
- 🛡 Role-Based Access Control (Student / Company)
- 💼 Job Posting System (Company)
- 📄 Job Application System (Student)
- 👀 Applicant Tracking (Company dashboard)

---

## 🛠 Tech Stack

- **Backend:** Node.js, Express.js  
- **Database:** MySQL  
- **Authentication:** JWT, bcrypt  
- **API Testing:** Postman  

---

## 📡 API Endpoints

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`

### Jobs
- `POST /api/jobs/create` (Company only)
- `GET /api/jobs`
- `POST /api/jobs/apply` (Student only)
- `GET /api/jobs/applicants/:jobId` (Company only)

---

## ⚙️ Setup Instructions

```bash
git clone https://github.com/23sar/placement-portal.git
cd placement-portal
npm install
node server.js
