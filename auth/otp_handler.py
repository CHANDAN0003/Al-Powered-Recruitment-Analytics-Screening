import random
from database.db_manager import DBManager
from utils.email_service import send_otp_email

db = DBManager()


def generate_otp(length: int = 6) -> str:
    return ''.join(random.choices('0123456789', k=length))


def request_otp(email: str, purpose: str = 'login') -> str:
    code = generate_otp()
    db.save_otp(email=email, code=code, purpose=purpose)
    send_otp_email(email, code, purpose)
    return code


def verify_otp(email: str, code: str, purpose: str = 'login') -> bool:
    return db.verify_otp(email=email, code=code, purpose=purpose)
