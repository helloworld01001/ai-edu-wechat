import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from psycopg2.errors import UniqueViolation

from ..repositories.chat_repository import (
    create_user,
    create_user_session,
    delete_user_session,
    get_user_by_token,
    get_user_by_username,
)
from .agent_service import AppError


SESSION_EXPIRE_DAYS = 30


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000).hex()


def _new_token() -> str:
    return secrets.token_urlsafe(32)


def register(username: str, password: str, display_name: str = ""):
    username = (username or "").strip().lower()
    password = (password or "").strip()
    display_name = (display_name or "").strip() or username
    if len(username) < 3:
        raise AppError("INVALID_USERNAME", "用户名至少 3 位", 400)
    if len(password) < 6:
        raise AppError("INVALID_PASSWORD", "密码至少 6 位", 400)
    salt = secrets.token_hex(16)
    pwd_hash = _hash_password(password, salt)
    try:
        user = create_user(username=username, password_hash=pwd_hash, password_salt=salt, display_name=display_name)
    except UniqueViolation:
        raise AppError("USERNAME_EXISTS", "用户名已存在", 409)
    except Exception as e:
        raise AppError("REGISTER_FAILED", f"注册失败: {e}", 500)
    token = _new_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRE_DAYS)
    create_user_session(token=token, user_id=user["id"], expires_at=expires_at)
    return {"ok": True, "token": token, "user": user}


def login(username: str, password: str):
    username = (username or "").strip().lower()
    password = (password or "").strip()
    if not username or not password:
        raise AppError("INVALID_REQUEST", "用户名和密码不能为空", 400)
    user = get_user_by_username(username)
    if not user:
        raise AppError("AUTH_FAILED", "用户名或密码错误", 401)
    expected = _hash_password(password, user["password_salt"])
    if expected != user["password_hash"]:
        raise AppError("AUTH_FAILED", "用户名或密码错误", 401)
    token = _new_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRE_DAYS)
    create_user_session(token=token, user_id=user["id"], expires_at=expires_at)
    return {
        "ok": True,
        "token": token,
        "user": {"id": user["id"], "username": user["username"], "display_name": user["display_name"]},
    }


def me(token: str):
    user = get_user_by_token((token or "").strip())
    if not user:
        raise AppError("UNAUTHORIZED", "登录状态已失效，请重新登录", 401)
    return {"ok": True, "user": user}


def logout(token: str):
    token = (token or "").strip()
    if token:
        delete_user_session(token)
    return {"ok": True}
