import os
import secrets
from typing import Optional
from fastapi import FastAPI, Request, Form, UploadFile, File, Depends, Response
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from itsdangerous import URLSafeSerializer
from dotenv import load_dotenv

from database.db_manager import DBManager
from auth.login_manager import signup_start, signup_verify, login_start, login_verify, AuthError
from auth.role_auth import require_role
from utils.email_service import send_recruiter_message
from utils.resume_parser import parse_resume
from models.resume_matcher import matcher

load_dotenv()

SECRET = os.getenv("APP_SECRET", "dev-secret")
serializer = URLSafeSerializer(SECRET, salt="session")

db = DBManager()
app = FastAPI(title="AI Recruitment Portal")

# Static & templates
BASE_DIR = os.path.dirname(__file__)
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# ---------------------- Helpers ----------------------

def get_user_from_cookie(request: Request):
    token = request.cookies.get("session")
    if not token:
        return None
    try:
        data = serializer.loads(token)
        user = db.get_user_by_email(data.get("email"))
        return user
    except Exception:
        return None


def set_session(response: RedirectResponse, user):
    token = serializer.dumps({"email": user["email"], "role": user["role"]})
    response.set_cookie("session", token, httponly=True, max_age=60*60*8)


def clear_session(response: RedirectResponse):
    response.delete_cookie("session")


def ensure_csrf_cookie(request: Request, response: Optional[RedirectResponse] = None) -> str:
    token = request.cookies.get("csrf")
    if not token:
        token = secrets.token_urlsafe(32)
        # If a response is provided, set cookie on it, otherwise we will set it on TemplateResponse later
        if response is not None:
            response.set_cookie("csrf", token, httponly=False, samesite="lax")
    return token

def validate_csrf(request: Request, csrf_token: str) -> bool:
    try:
        header_token = request.headers.get("X-CSRF-Token")
        cookie_token = request.cookies.get("csrf")
        return (csrf_token and csrf_token == cookie_token) or (header_token and header_token == cookie_token)
    except Exception:
        return False

# ---------------------- Landing ----------------------
@app.get("/", response_class=HTMLResponse)
async def landing(request: Request):
    resp = templates.TemplateResponse("landing.html", {"request": request, "user": get_user_from_cookie(request)})
    # Ensure CSRF token cookie exists for forms on landing modal
    if not request.cookies.get("csrf"):
        resp.set_cookie("csrf", secrets.token_urlsafe(32), httponly=False, samesite="lax")
    return resp

# ---------------------- Logout ----------------------
@app.get("/logout")
async def logout(request: Request):
    resp = RedirectResponse("/", status_code=302)
    clear_session(resp)
    return resp

# ---------------------- Recruiter Pages & Auth ----------------------
@app.get("/recruiter", response_class=HTMLResponse)
async def recruiter_page_legacy(request: Request):
    # legacy page kept; link new dashboard route below
    user = get_user_from_cookie(request)
    jobs = db.list_jobs_by_recruiter(user["id"]) if user and user["role"] == "recruiter" else []
    resp = templates.TemplateResponse("recruiter.html", {"request": request, "user": user, "jobs": jobs, "applicants": None})
    if not request.cookies.get("csrf"):
        resp.set_cookie("csrf", secrets.token_urlsafe(32), httponly=False, samesite="lax")
    return resp

@app.get("/recruiter/dashboard", response_class=HTMLResponse)
async def recruiter_dashboard(request: Request):
    resp = templates.TemplateResponse("recruiter_dashboard.html", {"request": request, "user": get_user_from_cookie(request)})
    if not request.cookies.get("csrf"):
        resp.set_cookie("csrf", secrets.token_urlsafe(32), httponly=False, samesite="lax")
    return resp

@app.post("/recruiter/signup")
async def recruiter_signup(request: Request, name: str = Form(...), email: str = Form(...), password: str = Form(...), csrf_token: str = Form(...)):
    if not validate_csrf(request, csrf_token):
        return RedirectResponse("/?error=Invalid+CSRF", status_code=302)
    try:
        signup_start(name=name, email=email, password=password, role="recruiter")
        # store temp in cookie-like memory using signed token
        token = serializer.dumps({"pending_email": email, "pending_password": password, "pending_name": name, "mode": "signup", "role": "recruiter"})
        resp = RedirectResponse("/recruiter", status_code=302)
        resp.set_cookie("pending", token, max_age=300, httponly=True)
        return resp
    except AuthError as e:
        return RedirectResponse(f"/recruiter?error={e}", status_code=302)

@app.post("/recruiter/login")
async def recruiter_login(request: Request, email: str = Form(...), password: str = Form(...), csrf_token: str = Form(...)):
    if not validate_csrf(request, csrf_token):
        return RedirectResponse("/?error=Invalid+CSRF", status_code=302)
    try:
        login_start(email=email)
        token = serializer.dumps({"pending_email": email, "pending_password": password, "mode": "login", "role": "recruiter"})
        resp = RedirectResponse("/recruiter", status_code=302)
        resp.set_cookie("pending", token, max_age=300, httponly=True)
        return resp
    except AuthError as e:
        return RedirectResponse(f"/recruiter?error={e}", status_code=302)

@app.post("/recruiter/verify")
async def recruiter_verify(request: Request, email: str = Form(...), code: str = Form(...), mode: str = Form(...), password: str = Form(""), name: str = Form(""), next_page: Optional[str] = Form(None), csrf_token: str = Form(...)):
    if not validate_csrf(request, csrf_token):
        return RedirectResponse("/?error=Invalid+CSRF", status_code=302)
    try:
        if mode == "signup":
            signup_verify(name=name, email=email, password=password, role="recruiter", code=code)
        else:
            user = login_verify(email=email, password=password, code=code)
        user = db.get_user_by_email(email)
        redirect_to = next_page or "/recruiter"
        resp = RedirectResponse(redirect_to, status_code=302)
        set_session(resp, user)
        resp.delete_cookie("pending")
        return resp
    except AuthError as e:
        return RedirectResponse(f"/recruiter?error={e}", status_code=302)

@app.post("/recruiter/post")
async def post_job(request: Request, title: str = Form(...), skills: str = Form(""), experience: str = Form(""), description: str = Form(...), csrf_token: str = Form(...)):
    user = get_user_from_cookie(request)
    if not validate_csrf(request, csrf_token):
        return RedirectResponse("/recruiter?error=Invalid+CSRF", status_code=302)
    if not require_role(user, "recruiter"):
        return RedirectResponse("/recruiter?error=Not+authorized", status_code=302)
    db.create_job(recruiter_id=user["id"], title=title.strip(), description=description.strip(), skills=skills.strip(), experience=experience.strip())
    return RedirectResponse("/recruiter?flash=Job+posted", status_code=302)

@app.get("/recruiter/applicants", response_class=HTMLResponse)
async def recruiter_applicants(request: Request, job_id: int):
    user = get_user_from_cookie(request)
    if not require_role(user, "recruiter"):
        return RedirectResponse("/recruiter?error=Not+authorized", status_code=302)
    jobs = db.list_jobs_by_recruiter(user["id"])
    applicants = db.list_applicants_for_job(job_id)
    resp = templates.TemplateResponse("recruiter.html", {"request": request, "user": user, "jobs": jobs, "applicants": applicants})
    if not request.cookies.get("csrf"):
        resp.set_cookie("csrf", secrets.token_urlsafe(32), httponly=False, samesite="lax")
    return resp

@app.post("/recruiter/message")
async def recruiter_message(request: Request, email: str = Form(...), job_title: str = Form(...), message: str = Form(...), csrf_token: str = Form(...)):
    if not validate_csrf(request, csrf_token):
        return RedirectResponse("/recruiter?error=Invalid+CSRF", status_code=302)
    send_recruiter_message(email, candidate_name=email.split('@')[0], message=message, job_title=job_title)
    return RedirectResponse("/recruiter?flash=Message+sent", status_code=302)

# ---------------------- Candidate Pages & Auth ----------------------
@app.get("/candidate", response_class=HTMLResponse)
async def candidate_page_legacy(request: Request):
    user = get_user_from_cookie(request)
    jobs = db.list_jobs()
    applications = db.list_user_applications(user["id"]) if user and user["role"] == "candidate" else []
    resp = templates.TemplateResponse("candidate.html", {"request": request, "user": user, "jobs": jobs, "applications": applications})
    if not request.cookies.get("csrf"):
        resp.set_cookie("csrf", secrets.token_urlsafe(32), httponly=False, samesite="lax")
    return resp

@app.get("/candidate/dashboard", response_class=HTMLResponse)
async def candidate_dashboard(request: Request):
    resp = templates.TemplateResponse("candidate_dashboard.html", {"request": request, "user": get_user_from_cookie(request)})
    if not request.cookies.get("csrf"):
        resp.set_cookie("csrf", secrets.token_urlsafe(32), httponly=False, samesite="lax")
    return resp

@app.post("/candidate/signup")
async def candidate_signup(request: Request, name: str = Form(...), email: str = Form(...), password: str = Form(...), csrf_token: str = Form(...)):
    if not validate_csrf(request, csrf_token):
        return RedirectResponse("/?error=Invalid+CSRF", status_code=302)
    try:
        signup_start(name=name, email=email, password=password, role="candidate")
        token = serializer.dumps({"pending_email": email, "pending_password": password, "pending_name": name, "mode": "signup", "role": "candidate"})
        resp = RedirectResponse("/candidate", status_code=302)
        resp.set_cookie("pending", token, max_age=300, httponly=True)
        return resp
    except AuthError as e:
        return RedirectResponse(f"/candidate?error={e}", status_code=302)

@app.post("/candidate/login")
async def candidate_login(request: Request, email: str = Form(...), password: str = Form(...), csrf_token: str = Form(...)):
    if not validate_csrf(request, csrf_token):
        return RedirectResponse("/?error=Invalid+CSRF", status_code=302)
    try:
        login_start(email=email)
        token = serializer.dumps({"pending_email": email, "pending_password": password, "mode": "login", "role": "candidate"})
        resp = RedirectResponse("/candidate", status_code=302)
        resp.set_cookie("pending", token, max_age=300, httponly=True)
        return resp
    except AuthError as e:
        return RedirectResponse(f"/candidate?error={e}", status_code=302)

@app.post("/candidate/verify")
async def candidate_verify(request: Request, email: str = Form(...), code: str = Form(...), mode: str = Form(...), password: str = Form(""), name: str = Form(""), next_page: Optional[str] = Form(None), csrf_token: str = Form(...)):
    if not validate_csrf(request, csrf_token):
        return RedirectResponse("/?error=Invalid+CSRF", status_code=302)
    try:
        if mode == "signup":
            signup_verify(name=name, email=email, password=password, role="candidate", code=code)
        else:
            login_verify(email=email, password=password, code=code)
        user = db.get_user_by_email(email)
        redirect_to = next_page or "/candidate"
        resp = RedirectResponse(redirect_to, status_code=302)
        set_session(resp, user)
        resp.delete_cookie("pending")
        return resp
    except AuthError as e:
        return RedirectResponse(f"/candidate?error={e}", status_code=302)

@app.post("/candidate/apply")
async def candidate_apply(request: Request, job_id: int = Form(...), full_name: str = Form(...), email: str = Form(...), resume: UploadFile = File(...), csrf_token: str = Form(...)):
    user = get_user_from_cookie(request)
    if not validate_csrf(request, csrf_token):
        return RedirectResponse("/candidate?error=Invalid+CSRF", status_code=302)
    if not require_role(user, "candidate"):
        return RedirectResponse("/candidate?error=Not+authorized", status_code=302)
    upload_dir = os.path.join(BASE_DIR, "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(resume.filename)[1]
    dest = os.path.join(upload_dir, f"{user['id']}_job{job_id}{ext}")
    with open(dest, "wb") as f:
        f.write(await resume.read())
    app_id = db.apply_to_job(job_id=job_id, candidate_id=user['id'], candidate_name=full_name, candidate_email=email, resume_path=dest)
    resume_text = parse_resume(dest)
    job = [j for j in db.list_jobs() if j['id']==job_id]
    jd = job[0]['description'] if job else ''
    score = matcher.score(jd, [resume_text])[0] if resume_text else 0.0
    db.set_application_score(app_id, score)
    return RedirectResponse("/candidate?flash=Applied", status_code=302)

# ---------------------- JSON APIs for Frontend Fetch ----------------------
@app.post("/api/auth/start")
async def api_auth_start(request: Request, response: Response, mode: str = Form(...), role: str = Form(...), email: str = Form(...), password: str = Form(""), name: str = Form("")):
    # CSRF from header accepted
    if not validate_csrf(request, request.headers.get("X-CSRF-Token", "")):
        return {"ok": False, "error": "Invalid CSRF"}
    try:
        if mode == "signup":
            signup_start(name=name, email=email, password=password, role=role)
        else:
            login_start(email=email)
        # pending info for verify convenience (cookie set like web flow)
        token = serializer.dumps({"pending_email": email, "pending_password": password, "pending_name": name, "mode": mode, "role": role})
        response.set_cookie("pending", token, max_age=300, httponly=True)
        return {"ok": True}
    except AuthError as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/auth/verify")
async def api_auth_verify(request: Request, response: Response, mode: str = Form(...), role: str = Form(...), email: str = Form(...), code: str = Form(...), password: str = Form(""), name: str = Form("")):
    if not validate_csrf(request, request.headers.get("X-CSRF-Token", "")):
        return {"ok": False, "error": "Invalid CSRF"}
    try:
        if mode == "signup":
            signup_verify(name=name, email=email, password=password, role=role, code=code)
        else:
            login_verify(email=email, password=password, code=code)
        user = db.get_user_by_email(email)
        set_session(response, user)
        return {"ok": True, "role": user["role"]}
    except AuthError as e:
        return {"ok": False, "error": str(e)}

@app.get("/api/jobs")
async def api_jobs(request: Request):
    jobs = db.list_jobs()
    return {"ok": True, "jobs": jobs}

@app.get("/api/recruiter/jobs")
async def api_recruiter_jobs(request: Request):
    user = get_user_from_cookie(request)
    if not require_role(user, "recruiter"):
        return {"ok": False, "error": "Not authorized"}
    return {"ok": True, "jobs": db.list_jobs_by_recruiter(user["id"])}

@app.post("/api/recruiter/jobs")
async def api_recruiter_post_job(request: Request, title: str = Form(...), description: str = Form(...), skills: str = Form(""), experience: str = Form("")):
    if not validate_csrf(request, request.headers.get("X-CSRF-Token", "")):
        return {"ok": False, "error": "Invalid CSRF"}
    user = get_user_from_cookie(request)
    if not require_role(user, "recruiter"):
        return {"ok": False, "error": "Not authorized"}
    job_id = db.create_job(user["id"], title.strip(), description.strip(), skills.strip(), experience.strip())
    return {"ok": True, "job_id": job_id}

@app.put("/api/recruiter/jobs/{job_id}")
async def api_recruiter_update_job(request: Request, job_id: int, title: str = Form(...), description: str = Form(...), skills: str = Form(""), experience: str = Form("")):
    if not validate_csrf(request, request.headers.get("X-CSRF-Token", "")):
        return {"ok": False, "error": "Invalid CSRF"}
    user = get_user_from_cookie(request)
    if not require_role(user, "recruiter"):
        return {"ok": False, "error": "Not authorized"}
    ok = db.update_job(job_id, user["id"], title.strip(), description.strip(), skills.strip(), experience.strip())
    if not ok:
        return {"ok": False, "error": "Job not found or not owned by user"}
    return {"ok": True}

@app.delete("/api/recruiter/jobs/{job_id}")
async def api_recruiter_delete_job(request: Request, job_id: int):
    if not validate_csrf(request, request.headers.get("X-CSRF-Token", "")):
        return {"ok": False, "error": "Invalid CSRF"}
    user = get_user_from_cookie(request)
    if not require_role(user, "recruiter"):
        return {"ok": False, "error": "Not authorized"}
    ok = db.delete_job(job_id, user["id"])
    if not ok:
        return {"ok": False, "error": "Job not found or not owned by user"}
    return {"ok": True}

@app.post("/api/candidate/apply")
async def api_candidate_apply(request: Request, job_id: int = Form(...), full_name: str = Form(...), email: str = Form(...), resume: UploadFile = File(...)):
    if not validate_csrf(request, request.headers.get("X-CSRF-Token", "")):
        return {"ok": False, "error": "Invalid CSRF"}
    user = get_user_from_cookie(request)
    if not require_role(user, "candidate"):
        return {"ok": False, "error": "Not authorized"}
    upload_dir = os.path.join(BASE_DIR, "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(resume.filename)[1]
    dest = os.path.join(upload_dir, f"{user['id']}_job{job_id}{ext}")
    with open(dest, "wb") as f:
        f.write(await resume.read())
    app_id = db.apply_to_job(job_id=job_id, candidate_id=user['id'], candidate_name=full_name, candidate_email=email, resume_path=dest)
    resume_text = parse_resume(dest)
    job = [j for j in db.list_jobs() if j['id']==job_id]
    jd = job[0]['description'] if job else ''
    score = matcher.score(jd, [resume_text])[0] if resume_text else 0.0
    db.set_application_score(app_id, score)
    return {"ok": True, "application_id": app_id, "score": score}

@app.get("/api/recruiter/ranking")
async def api_recruiter_ranking(request: Request):
    user = get_user_from_cookie(request)
    if not require_role(user, "recruiter"):
        return {"ok": False, "error": "Not authorized"}
    data = db.list_ranked_candidates_for_recruiter(user["id"])
    # normalize payload for frontend
    candidates = [
        {
            "id": row.get("application_id"),
            "name": row.get("name"),
            "email": row.get("email"),
            "score": round(float(row.get("score")), 2) if row.get("score") is not None else None,
            "job_id": row.get("job_id"),
            "job_title": row.get("job_title"),
        }
        for row in data
    ]
    return {"ok": True, "candidates": candidates}

# ---------------------- Chatbot ----------------------
@app.post("/chat")
async def chat_endpoint(request: Request, data: dict):
    prompt = data.get("prompt", "")
    jobs = db.list_jobs()
    ctx = '\n'.join([f"{j['title']} - Skills: {j.get('skills','')} - Exp: {j.get('experience','')} - JD: {j['description'][:250]}" for j in jobs])
    answer = "No OpenAI API key configured" if not os.getenv("OPENAI_API_KEY") else f"[Mocked AI] Based on jobs: {prompt[:200]}"
    return {"answer": answer}

# ---------------------- Dev convenience ----------------------
@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=int(os.getenv("PORT", "8000")), reload=True)
