import os
from typing import Optional
from pdfminer.high_level import extract_text as pdf_extract_text
import docx


def extract_text_from_pdf(path: str) -> str:
    try:
        return pdf_extract_text(path)
    except Exception:
        return ''


def extract_text_from_docx(path: str) -> str:
    try:
        doc = docx.Document(path)
        return '\n'.join(p.text for p in doc.paragraphs)
    except Exception:
        return ''


def parse_resume(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext == '.pdf':
        return extract_text_from_pdf(path)
    elif ext in ('.docx', '.doc'):
        return extract_text_from_docx(path)
    return ''
