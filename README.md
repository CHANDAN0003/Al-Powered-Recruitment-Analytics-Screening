```markdown
# AI Recruitment Analytics & Screening Portal

FastAPI + Jinja2 web app for recruiters and candidates. It uses SQLite for storage, an OTP-based authentication flow, a modern single-file frontend bundle in `static/portal.js`, AI resume scoring (TF‑IDF matcher), a simple chatbot endpoint, CSRF protection, toast notifications and a light/dark theme.

Key features
- Role-based auth (candidate / recruiter) with OTP verification and session cookies
- Recruiter dashboard: post jobs, view applications, send email messages to applicants
- Candidate dashboard: browse jobs, apply with resume upload, view suitability score
- AI screening: TF‑IDF similarity scorer (0–100) used to rank candidate resumes against job descriptions
- Chatbot endpoint: mocked unless `OPENAI_API_KEY` is configured
- CSRF protection: cookie + header support for X-CSRF-Token
- UX: single `portal.js` drives modals, toasts, and dashboard wiring

Quickstart (Windows CMD)
1) Create and activate a virtual environment
```cmd
python -m venv .venv
.\.venv\Scripts\activate
```
2) Install dependencies
```cmd
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```
3) Configure environment (create a `.env` file in project root). Common values:
```text
# Optional: SMTP settings to send real emails (otherwise emails print to console)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_app_password
SENDER_NAME=AI Recruitment Portal

# Optional: OpenAI (if you want a real chatbot)
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini

# Application secret (change for production)
APP_SECRET=change-me
```
4) Run the app (development)
```cmd
python server.py
# or use uvicorn directly
uvicorn server:app --reload --port 8000
```
Open http://127.0.0.1:8000 in your browser.

How to use
- On the landing page open the auth modal, choose role, sign up/sign in and verify the OTP to be redirected to the appropriate dashboard.
- Recruiter dashboard (POST /recruiter/dashboard): Post jobs, view applications, view candidate details and send acceptance/interview emails.
- Candidate dashboard (GET /candidate/dashboard): Browse jobs, click "Apply Now" and upload a resume (PDF/DOC/DOCX). The backend scores the resume and stores the application.
- Theme and UX: Theme preference is stored in localStorage; toasts are used for transient messages.

API endpoints (used by `static/portal.js`)
- Authentication (JSON fetch flows):
	- `POST /api/auth/start` — start signup/login (accepts `X-CSRF-Token` header or cookie `csrf`)
	- `POST /api/auth/verify` — verify OTP and create session (returns `role`)
- Jobs & applications:
	- `GET /api/jobs` — public jobs list
	- `GET /api/recruiter/jobs` — recruiter jobs (requires session cookie)
	- `POST /api/recruiter/jobs` — create job (requires `X-CSRF-Token` header)
	- `PUT /api/recruiter/jobs/{id}` — update job
	- `DELETE /api/recruiter/jobs/{id}` — delete job
	- `GET /api/recruiter/applications` — list applications for recruiter's jobs
	- `GET /api/recruiter/applications/{application_id}` — application details
	- `POST /api/candidate/apply` — candidate apply (multipart/form-data upload)
	- `POST /api/recruiter/send-email` — send messages to candidates

CSRF notes
- A `csrf` cookie is set for GET pages. API routes accept either the `X-CSRF-Token` header (used by `portal.js`) or a `csrf_token` form field for form POSTs. When making fetch requests from the UI, `portal.js` reads the `csrf` cookie and sends it via `X-CSRF-Token` where required.

Reset / wipe data (development)
- Quick and simple (delete DB file + uploaded resumes):
	```cmd
	del database\app.db
	rmdir /s /q uploads
	mkdir uploads
	```
	Then restart the server — the schema will be re-created automatically.
- SQL method (useful if you prefer not to delete the file):
	```cmd
	sqlite3 database\app.db "DELETE FROM applications; DELETE FROM jobs; DELETE FROM users; DELETE FROM otps; VACUUM;"
	```
	(Install `sqlite3` or use the `sqlite3.exe` binary.)

Developer notes
- Frontend wiring: `static/portal.js` contains initialization for dashboards, modals and exposes small helpers used by template inline handlers. If you change templates, ensure IDs/classes referenced by the JS are kept in sync.
- File uploads: resumes are stored in the `uploads/` folder. Filenames are currently generated as `<user_id>_job<job_id>.<ext>`.
- Database: `database/app.db` (SQLite). Schema is defined in `database/db_manager.py`.
- Email sending: `utils/email_service.py` falls back to console printing if SMTP is not configured.
- Chatbot: `/chat` returns a mocked response unless `OPENAI_API_KEY` is present.

Troubleshooting
- CSRF errors: ensure the browser has the `csrf` cookie and that `portal.js` is able to read it. For API requests made externally, include `X-CSRF-Token` with the cookie value.
- Static assets not loading: confirm `app.mount("/static", ...)` is present (it is) and that the `static` folder exists.
- Upload / permission errors: ensure the running user can write to `uploads/` and `database/`.

Project structure (short)
```
.\
├── server.py
├── requirements.txt
├── README.md
├── database\
│   └── db_manager.py
├── auth\
├── models\
├── utils\
├── templates\
└── static\
		├── portal.js
		└── portal.css
```

If you want, I can:
- Replace inline template handlers with explicit event listeners in `portal.js` (cleanup)
- Add a one-off admin route or management script to wipe data securely

```

