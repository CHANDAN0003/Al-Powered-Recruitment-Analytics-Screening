# AI Recruitment Analytics & Screening Portal

FastAPI + Jinja2 web app with SQLite storage, OTP-based auth, dashboards for recruiters and candidates, AI resume scoring, chatbot, CSRF protection, toasts, and a dark/light theme.

Key features
- Role-based auth: Email + password + OTP for recruiters and candidates
- Recruiter dashboard: Post jobs, view applicants, send messages
- Candidate dashboard: Browse jobs, apply with resume upload
- AI screening: TF‑IDF score (0–100) for resume vs JD
- Chatbot assistant: Mocked unless `OPENAI_API_KEY` is set
- CSRF protection: Cookie + hidden form token on all POSTs
- UX: Toast notifications and persistent dark/light theme

Quickstart (Windows CMD)
1) Create and activate a virtual environment
```
python -m venv .venv
.\.venv\Scripts\activate
```
2) Install dependencies
```
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```
3) Configure environment (create `.env` in project root)
```
# SMTP (optional; falls back to console print)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_app_password
SENDER_NAME=AI Recruitment Portal

# OpenAI (optional for chatbot)
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini

# App secret for sessions (change in production)
APP_SECRET=change-me
```
4) Run the app
```
python server.py
```
Open http://127.0.0.1:8000

How to use
- Landing modal: Choose role, Sign Up or Sign In → OTP sent → verify on role page → you’re logged in.
- Recruiter dashboard: Use “Add New Job Requirement” to post jobs. Applicants appear after candidates apply.
- Candidate dashboard: Click “Apply Now”, upload resume (PDF/DOC/DOCX). Suitability score is computed automatically.
- Theme toggle: Top-right “Toggle Theme” persists choice in the browser.
- Toasts: Query params `?flash=...` or `?error=...` show notifications.

Project structure
```
.
├── server.py                 # FastAPI entrypoint
├── requirements.txt
├── README.md
├── database/
│   └── db_manager.py         # SQLite + schema + queries
├── auth/
│   ├── otp_handler.py        # OTP generation + email
│   ├── login_manager.py      # Password hashing + flows
│   └── role_auth.py          # Role guards
├── models/
│   └── resume_matcher.py     # TF‑IDF matcher
├── utils/
│   ├── email_service.py      # SMTP or console fallback
│   └── resume_parser.py      # PDF/DOC/DOCX to text
├── templates/                # Jinja2 pages
│   ├── base.html
│   ├── landing.html
│   ├── recruiter.html        # Legacy simple page
│   ├── candidate.html        # Legacy simple page
│   ├── recruiter_dashboard.html
│   └── candidate_dashboard.html
├── static/
│   ├── styles.css
│   ├── portal.css            # Modern UI + dark theme
│   └── portal.js             # Modal + toasts + theme + wiring
└── uploads/                  # Saved resumes
```

Security notes
- Passwords hashed with bcrypt; OTPs expire after 5 minutes.
- CSRF: A `csrf` cookie is set on GET pages. All POST forms include a `csrf_token` hidden input which the server validates.
- Sessions: Signed cookie via `itsdangerous` (see `APP_SECRET`).

Troubleshooting
- Missing pip or install failures:
```
python -m ensurepip --upgrade
python -m pip install --upgrade pip
```
If pip is still missing:
```
powershell -Command "Invoke-WebRequest -Uri https://bootstrap.pypa.io/get-pip.py -OutFile get-pip.py"
python get-pip.py
```
- If you have both `venv` and `.venv`, activate the intended one before installing:
```
.\.venv\Scripts\activate
# or
.\venv\Scripts\activate
```

Architecture overview (brief)
- UI: Jinja2 templates + CSS/JS. Modal auth on landing; dashboards per role.
- Logic: Auth + OTP flows; job posting; applications; email messaging.
- AI: TF‑IDF vectorizer + cosine similarity.
- Data: SQLite with tables for users, jobs, applications, otps.
- Integrations: SMTP email; optional OpenAI for chatbot.

Next steps (optional)
- Replace TF‑IDF with embeddings.
- Add job search, pagination, and filters.
- Application status lifecycle + bulk outreach.
- Persisted chat history per user.

