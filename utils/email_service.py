import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_HOST = os.getenv('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
SMTP_USER = os.getenv('SMTP_USER', '')
SMTP_PASS = os.getenv('SMTP_PASS', '')
SENDER_NAME = os.getenv('SENDER_NAME', 'AI Recruitment Portal')


def _send_email(to_email: str, subject: str, html_body: str):
    if not (SMTP_USER and SMTP_PASS):
        print(f"[EMAIL MOCK] To: {to_email} | Subject: {subject}\n{html_body}")
        return
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = f"{SENDER_NAME} <{SMTP_USER}>"
    msg['To'] = to_email
    part = MIMEText(html_body, 'html')
    msg.attach(part)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_USER, to_email, msg.as_string())


def send_otp_email(email: str, code: str, purpose: str):
    subj = f"Your OTP for {purpose.capitalize()}"
    body = f"<p>Use OTP <b>{code}</b> for {purpose}.</p><p>It expires in 5 minutes.</p>"
    _send_email(email, subj, body)


def send_recruiter_message(email: str, candidate_name: str, message: str, job_title: str):
    subj = f"Update regarding your application for {job_title}"
    body = f"<p>Hi {candidate_name},</p><p>{message}</p><p>Regards,<br/>Recruitment Team</p>"
    _send_email(email, subj, body)
