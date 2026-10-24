# Campus Placement Portal — API Documentation

Base URL: `http://localhost:5000`

All endpoints under `/api/jobs` and `/api/applications` require a Bearer token in the Authorization header unless specified otherwise:
```
Authorization: Bearer <your_jwt_token>
```

---

## 1. Authentication (`/api/auth`)

### 1.1 Register User
- **Method:** `POST`
- **Path:** `/api/auth/register`
- **Access:** Public
- **Request Body:**
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "password123",
    "role": "student"
  }
  ```
  *(Role can be either `"student"` or `"company"`)*
- **Success Response (`201 Created`):**
  ```json
  {
    "message": "User registered successfully"
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Missing required fields, invalid email format, or invalid role.
  - `409 Conflict`: Email already in use.

---

### 1.2 Login
- **Method:** `POST`
- **Path:** `/api/auth/login`
- **Access:** Public
- **Request Body:**
  ```json
  {
    "email": "jane@example.com",
    "password": "password123"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "student"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Email and password are required.
  - `401 Unauthorized`: Invalid email or password.

---

## 2. Jobs (`/api/jobs`)

### 2.1 Get All Jobs
- **Method:** `GET`
- **Path:** `/api/jobs`
- **Access:** Protected (Student & Company)
- **Success Response (`200 OK`):**
  ```json
  [
    {
      "id": 1,
      "title": "Software Engineering Intern",
      "description": "Work on scalable Node.js services.",
      "location": "Bangalore / Remote",
      "stipend": 40000,
      "company_id": 2,
      "company_name": "Acme Tech",
      "created_at": "2026-10-24T10:00:00.000Z"
    }
  ]
  ```

---

### 2.2 Get Jobs Posted by Current Company
- **Method:** `GET`
- **Path:** `/api/jobs/my`
- **Access:** Protected (Company only)
- **Success Response (`200 OK`):**
  ```json
  [
    {
      "id": 1,
      "title": "Software Engineering Intern",
      "description": "...",
      "location": "Bangalore / Remote",
      "stipend": 40000,
      "application_count": 5,
      "created_at": "2026-10-24T10:00:00.000Z"
    }
  ]
  ```

---

### 2.3 Create a Job Posting
- **Method:** `POST`
- **Path:** `/api/jobs/create`
- **Access:** Protected (Company only)
- **Request Body:**
  ```json
  {
    "title": "Backend Developer",
    "description": "Node.js and MySQL developer",
    "location": "Remote",
    "stipend": 35000
  }
  ```
- **Success Response (`201 Created`):**
  ```json
  {
    "message": "Job posted successfully",
    "jobId": 3
  }
  ```

---

### 2.4 Get Single Job Details
- **Method:** `GET`
- **Path:** `/api/jobs/:id`
- **Access:** Protected (Student & Company)
- **Success Response (`200 OK`):**
  ```json
  {
    "id": 1,
    "title": "Software Engineering Intern",
    "description": "Work on scalable Node.js services.",
    "location": "Bangalore / Remote",
    "stipend": 40000,
    "company_id": 2,
    "company_name": "Acme Tech",
    "created_at": "2026-10-24T10:00:00.000Z"
  }
  ```

---

### 2.5 Apply for a Job
- **Method:** `POST`
- **Path:** `/api/jobs/apply`
- **Access:** Protected (Student only)
- **Request Body:**
  ```json
  {
    "job_id": 1
  }
  ```
- **Success Response (`201 Created`):**
  ```json
  {
    "message": "Application submitted successfully"
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: `job_id` missing or invalid.
  - `404 Not Found`: Job does not exist.
  - `409 Conflict`: You have already applied for this job.

---

### 2.6 Get Applicants for a Job
- **Method:** `GET`
- **Path:** `/api/jobs/applicants/:jobId`
- **Access:** Protected (Company owner only)
- **Success Response (`200 OK`):**
  ```json
  [
    {
      "application_id": 10,
      "student_id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "status": "pending",
      "created_at": "2026-10-24T11:00:00.000Z"
    }
  ]
  ```

---

### 2.7 Delete a Job
- **Method:** `DELETE`
- **Path:** `/api/jobs/:id`
- **Access:** Protected (Company owner only)
- **Success Response (`200 OK`):**
  ```json
  {
    "message": "Job deleted successfully"
  }
  ```

---

## 3. Applications (`/api/applications`)

### 3.1 Get Dashboard Statistics
- **Method:** `GET`
- **Path:** `/api/applications/dashboard/stats`
- **Access:** Protected (Student or Company)
- **Student Response Example:**
  ```json
  {
    "total_applications": 4,
    "shortlisted": 1,
    "rejected": 0
  }
  ```
- **Company Response Example:**
  ```json
  {
    "total_jobs": 2,
    "total_applications": 6,
    "shortlisted": 2,
    "pending": 4
  }
  ```

---

### 3.2 Get Student's Applications
- **Method:** `GET`
- **Path:** `/api/applications/my`
- **Access:** Protected (Student only)
- **Success Response (`200 OK`):**
  ```json
  [
    {
      "id": 10,
      "job_id": 1,
      "title": "Software Engineering Intern",
      "company_name": "Acme Tech",
      "location": "Bangalore / Remote",
      "stipend": 40000,
      "status": "shortlisted",
      "created_at": "2026-10-24T11:00:00.000Z"
    }
  ]
  ```

---

### 3.3 Update Application Status
- **Method:** `PATCH`
- **Path:** `/api/applications/:applicationId/status`
- **Access:** Protected (Company owner only)
- **Request Body:**
  ```json
  {
    "status": "shortlisted"
  }
  ```
  *(Status must be `"pending"`, `"shortlisted"`, or `"rejected"`)*
- **Success Response (`200 OK`):**
  ```json
  {
    "message": "Application status updated successfully",
    "status": "shortlisted"
  }
  ```
