class DBManager:
    def __init__(self):
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        self.conn = get_conn()
        self.init_db()

    # ...existing code...
import os
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple

DB_PATH = os.path.join(os.path.dirname(__file__), 'app.db')

SCHEMA = [
    # users: recruiter or candidate
    """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT CHECK(role IN ('recruiter','candidate')) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
    # jobs
    """
    CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recruiter_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        skills TEXT,
        experience TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (recruiter_id) REFERENCES users(id)
    );
    """,
    # applications
    """
    CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        candidate_id INTEGER NOT NULL,
        candidate_name TEXT,
        candidate_email TEXT,
        resume_path TEXT,
        suitability_score REAL DEFAULT NULL,
        status TEXT DEFAULT 'applied',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id),
        FOREIGN KEY (candidate_id) REFERENCES users(id)
    );
    """,
    # OTPs for email verification and login
    """
    CREATE TABLE IF NOT EXISTS otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
]


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


class DBManager:
    def __init__(self):
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        self.conn = get_conn()
        self.init_db()

    def init_db(self):
        cur = self.conn.cursor()
        for stmt in SCHEMA:
            cur.execute(stmt)
        self.conn.commit()

    # Users
    def create_user(self, name: str, email: str, password_hash: str, role: str) -> int:
        cur = self.conn.cursor()
        cur.execute(
            'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
            (name, email.lower(), password_hash, role)
        )
        self.conn.commit()
        return cur.lastrowid

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        cur = self.conn.cursor()
        cur.execute('SELECT * FROM users WHERE email = ?', (email.lower(),))
        row = cur.fetchone()
        return dict(row) if row else None

    def get_user_by_id(self, user_id: int) -> Optional[Dict[str, Any]]:
        cur = self.conn.cursor()
        cur.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        row = cur.fetchone()
        return dict(row) if row else None

    # OTPs
    def save_otp(self, email: str, code: str, purpose: str, ttl_minutes: int = 5):
        expires_at = datetime.utcnow() + timedelta(minutes=ttl_minutes)
        cur = self.conn.cursor()
        cur.execute(
            'INSERT INTO otps (email, code, purpose, expires_at) VALUES (?,?,?,?)',
            (email.lower(), code, purpose, expires_at.isoformat())
        )
        self.conn.commit()

    def verify_otp(self, email: str, code: str, purpose: str) -> bool:
        self.cleanup_expired_otps()
        cur = self.conn.cursor()
        cur.execute(
            'SELECT * FROM otps WHERE email = ? AND code = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1',
            (email.lower(), code, purpose)
        )
        row = cur.fetchone()
        if not row:
            return False
        expires_at = datetime.fromisoformat(row['expires_at'])
        return datetime.utcnow() <= expires_at

    def cleanup_expired_otps(self):
        cur = self.conn.cursor()
        cur.execute('DELETE FROM otps WHERE expires_at < ?', (datetime.utcnow().isoformat(),))
        self.conn.commit()

    # Jobs
    def create_job(self, recruiter_id: int, title: str, description: str, skills: str, experience: str) -> int:
        cur = self.conn.cursor()
        cur.execute(
            'INSERT INTO jobs (recruiter_id, title, description, skills, experience) VALUES (?,?,?,?,?)',
            (recruiter_id, title, description, skills, experience)
        )
        self.conn.commit()
        return cur.lastrowid

    def list_jobs(self) -> List[Dict[str, Any]]:
        cur = self.conn.cursor()
        cur.execute('SELECT j.*, u.name as recruiter_name FROM jobs j JOIN users u ON u.id = j.recruiter_id ORDER BY j.created_at DESC')
        rows = cur.fetchall()
        return [dict(r) for r in rows]

    def list_jobs_by_recruiter(self, recruiter_id: int) -> List[Dict[str, Any]]:
        cur = self.conn.cursor()
        cur.execute('SELECT * FROM jobs WHERE recruiter_id = ? ORDER BY created_at DESC', (recruiter_id,))
        rows = cur.fetchall()
        return [dict(r) for r in rows]

    def update_job(self, job_id: int, recruiter_id: int, title: str, description: str, skills: str, experience: str) -> bool:
        cur = self.conn.cursor()
        cur.execute(
            'UPDATE jobs SET title = ?, description = ?, skills = ?, experience = ? WHERE id = ? AND recruiter_id = ?',
            (title, description, skills, experience, job_id, recruiter_id)
        )
        self.conn.commit()
        return cur.rowcount > 0

    def delete_job(self, job_id: int, recruiter_id: int) -> bool:
        cur = self.conn.cursor()
        cur.execute('DELETE FROM jobs WHERE id = ? AND recruiter_id = ?', (job_id, recruiter_id))
        self.conn.commit()
        return cur.rowcount > 0

    # Applications
    def apply_to_job(self, job_id: int, candidate_id: int, candidate_name: str, candidate_email: str, resume_path: str) -> int:
        cur = self.conn.cursor()
        cur.execute(
            'INSERT INTO applications (job_id, candidate_id, candidate_name, candidate_email, resume_path) VALUES (?,?,?,?,?)',
            (job_id, candidate_id, candidate_name, candidate_email, resume_path)
        )
        self.conn.commit()
        return cur.lastrowid

    def set_application_score(self, application_id: int, score: float):
        cur = self.conn.cursor()
        cur.execute('UPDATE applications SET suitability_score = ? WHERE id = ?', (float(score), application_id))
        self.conn.commit()

    def list_applicants_for_job(self, job_id: int) -> List[Dict[str, Any]]:
        cur = self.conn.cursor()
        cur.execute('SELECT * FROM applications WHERE job_id = ? ORDER BY created_at DESC', (job_id,))
        rows = cur.fetchall()
        return [dict(r) for r in rows]

    def list_user_applications(self, candidate_id: int) -> List[Dict[str, Any]]:
        cur = self.conn.cursor()
        cur.execute('SELECT a.*, j.title FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.candidate_id = ? ORDER BY a.created_at DESC', (candidate_id,))
        rows = cur.fetchall()
        return [dict(r) for r in rows]

    def list_ranked_candidates_for_recruiter(self, recruiter_id: int) -> List[Dict[str, Any]]:
        """Return applications for this recruiter's jobs, ordered by suitability_score desc."""
        cur = self.conn.cursor()
        cur.execute(
            '''
            SELECT a.id as application_id, a.candidate_name as name, a.candidate_email as email,
                   a.suitability_score as score, a.job_id, j.title as job_title
            FROM applications a
            JOIN jobs j ON j.id = a.job_id
            WHERE j.recruiter_id = ? AND a.suitability_score IS NOT NULL
            ORDER BY a.suitability_score DESC, a.created_at DESC
            ''',
            (recruiter_id,)
        )
        rows = cur.fetchall()
        return [dict(r) for r in rows]

    def get_application_by_id(self, application_id: int) -> Optional[Dict[str, Any]]:
        cur = self.conn.cursor()
        cur.execute(
            '''
            SELECT a.*, j.title as job_title, j.recruiter_id as recruiter_id
            FROM applications a
            JOIN jobs j ON j.id = a.job_id
            WHERE a.id = ?
            ''',
            (application_id,)
        )
        row = cur.fetchone()
        return dict(row) if row else None

    def update_application_status(self, application_id: int, status: str) -> bool:
        cur = self.conn.cursor()
        cur.execute('UPDATE applications SET status = ? WHERE id = ?', (status, application_id))
        self.conn.commit()
        return cur.rowcount > 0
