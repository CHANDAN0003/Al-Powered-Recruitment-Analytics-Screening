import os
import bcrypt
from typing import Optional, Tuple
from database.db_manager import DBManager
from .otp_handler import request_otp, verify_otp


db = DBManager()


class AuthError(Exception):
    pass


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


# Signup flow: start -> sends OTP; verify -> creates user

def signup_start(name: str, email: str, password: str, role: str) -> str:
    if role not in ("recruiter", "candidate"):
        raise AuthError("Invalid role")
    if db.get_user_by_email(email):
        raise AuthError("User already exists")
    # send OTP for email verification
    return request_otp(email=email, purpose='signup')


def signup_verify(name: str, email: str, password: str, role: str, code: str) -> int:
    if not verify_otp(email=email, code=code, purpose='signup'):
        raise AuthError("Invalid OTP")
    user_id = db.create_user(name=name, email=email, password_hash=hash_password(password), role=role)
    return user_id


# Login flow: start -> sends OTP; verify -> password + OTP check returns user

def login_start(email: str) -> str:
    user = db.get_user_by_email(email)
    if not user:
        raise AuthError("User not found")
    return request_otp(email=email, purpose='login')


def login_verify(email: str, password: str, code: str) -> dict:
    user = db.get_user_by_email(email)
    if not user:
        raise AuthError("User not found")
    if not verify_password(password, user['password_hash']):
        raise AuthError("Invalid credentials")
    if not verify_otp(email=email, code=code, purpose='login'):
        raise AuthError("Invalid OTP")
    return user
