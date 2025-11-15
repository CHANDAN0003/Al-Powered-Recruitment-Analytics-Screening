from typing import Optional


def require_role(user: Optional[dict], role: str) -> bool:
    return bool(user and user.get('role') == role)
