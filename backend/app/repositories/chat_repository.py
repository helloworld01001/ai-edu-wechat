import os
import uuid
from contextlib import closing
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import psycopg2


def normalized_database_url():
    db_url = os.getenv("DATABASE_URL", "").strip()
    if not db_url:
        return ""
    parsed = urlparse(db_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.setdefault("sslmode", "require")
    return urlunparse(parsed._replace(query=urlencode(query)))


def get_db_connection():
    db_url = normalized_database_url()
    if not db_url:
        return None
    return psycopg2.connect(db_url)


def init_db():
    conn = get_db_connection()
    if conn is None:
        return False
    with closing(conn):
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS chat_sessions (
                      id TEXT PRIMARY KEY,
                      title TEXT NOT NULL DEFAULT '新会话',
                      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS chat_messages (
                      id BIGSERIAL PRIMARY KEY,
                      session_id TEXT NOT NULL,
                      role TEXT NOT NULL,
                      content TEXT NOT NULL,
                      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                      CONSTRAINT fk_session
                        FOREIGN KEY(session_id)
                          REFERENCES chat_sessions(id)
                          ON DELETE CASCADE
                    );
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                      id BIGSERIAL PRIMARY KEY,
                      username TEXT NOT NULL UNIQUE,
                      password_hash TEXT NOT NULL,
                      password_salt TEXT NOT NULL,
                      display_name TEXT NOT NULL,
                      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS user_sessions (
                      token TEXT PRIMARY KEY,
                      user_id BIGINT NOT NULL,
                      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                      expires_at TIMESTAMPTZ NOT NULL,
                      CONSTRAINT fk_user
                        FOREIGN KEY(user_id)
                          REFERENCES users(id)
                          ON DELETE CASCADE
                    );
                    """
                )
    return True


def init_db_safe():
    try:
        init_db()
    except Exception:
        pass


def ensure_session(session_id=None, title="新会话"):
    sid = (session_id or "").strip() or f"sess-{uuid.uuid4().hex[:12]}"
    conn = get_db_connection()
    if conn is None:
        return sid
    with closing(conn):
        with conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM chat_sessions WHERE id = %s;", (sid,))
                row = cur.fetchone()
                if not row:
                    cur.execute(
                        "INSERT INTO chat_sessions (id, title) VALUES (%s, %s);",
                        (sid, title or "新会话"),
                    )
                else:
                    cur.execute("UPDATE chat_sessions SET updated_at = NOW() WHERE id = %s;", (sid,))
    return sid


def save_message(session_id, role, content, touch_title=False):
    conn = get_db_connection()
    if conn is None:
        return
    with closing(conn):
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO chat_messages (session_id, role, content) VALUES (%s, %s, %s);",
                    (session_id, role, content),
                )
                cur.execute(
                    """
                    UPDATE chat_sessions
                    SET updated_at = NOW(),
                        title = CASE WHEN %s AND title = '新会话' THEN %s ELSE title END
                    WHERE id = %s;
                    """,
                    (
                        bool(touch_title),
                        ((content or "").strip()[:32] + ("..." if len((content or "").strip()) > 32 else ""))
                        or "新会话",
                        session_id,
                    ),
                )


def get_session_messages(session_id, include_system=True):
    conn = get_db_connection()
    if conn is None:
        return []
    with closing(conn):
        with conn:
            with conn.cursor() as cur:
                if include_system:
                    cur.execute(
                        """
                        SELECT role, content, created_at
                        FROM chat_messages
                        WHERE session_id = %s
                        ORDER BY id ASC;
                        """,
                        (session_id,),
                    )
                else:
                    cur.execute(
                        """
                        SELECT role, content, created_at
                        FROM chat_messages
                        WHERE session_id = %s AND role <> 'system'
                        ORDER BY id ASC;
                        """,
                        (session_id,),
                    )
                rows = cur.fetchall()
    return [{"role": r[0], "content": r[1], "ts": r[2].timestamp() if r[2] else None} for r in rows]


def list_sessions(limit=20):
    conn = get_db_connection()
    if conn is None:
        return []
    with closing(conn):
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, title, created_at, updated_at
                    FROM chat_sessions
                    ORDER BY updated_at DESC
                    LIMIT %s;
                    """,
                    (limit,),
                )
                rows = cur.fetchall()
    return [
        {
            "session_id": r[0],
            "title": r[1],
            "created_at": r[2].timestamp() if r[2] else None,
            "updated_at": r[3].timestamp() if r[3] else None,
        }
        for r in rows
    ]


def db_ready():
    conn = get_db_connection()
    if conn is None:
        return False, "DATABASE_URL 未配置"
    try:
        with closing(conn):
            with conn.cursor() as cur:
                cur.execute("SELECT 1;")
                cur.fetchone()
        return True, "ok"
    except Exception as e:
        return False, str(e)


def get_user_by_username(username):
    conn = get_db_connection()
    if conn is None:
        return None
    with closing(conn):
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, username, password_hash, password_salt, display_name, created_at
                    FROM users
                    WHERE username = %s
                    LIMIT 1;
                    """,
                    (username,),
                )
                row = cur.fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "username": row[1],
        "password_hash": row[2],
        "password_salt": row[3],
        "display_name": row[4],
        "created_at": row[5].timestamp() if row[5] else None,
    }


def get_user_by_id(user_id):
    conn = get_db_connection()
    if conn is None:
        return None
    with closing(conn):
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, username, display_name, created_at
                    FROM users
                    WHERE id = %s
                    LIMIT 1;
                    """,
                    (user_id,),
                )
                row = cur.fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "username": row[1],
        "display_name": row[2],
        "created_at": row[3].timestamp() if row[3] else None,
    }


def create_user(username, password_hash, password_salt, display_name):
    conn = get_db_connection()
    if conn is None:
        raise RuntimeError("DATABASE_URL 未配置")
    with closing(conn):
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (username, password_hash, password_salt, display_name)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, username, display_name, created_at;
                    """,
                    (username, password_hash, password_salt, display_name),
                )
                row = cur.fetchone()
    return {
        "id": row[0],
        "username": row[1],
        "display_name": row[2],
        "created_at": row[3].timestamp() if row[3] else None,
    }


def create_user_session(token, user_id, expires_at):
    conn = get_db_connection()
    if conn is None:
        raise RuntimeError("DATABASE_URL 未配置")
    with closing(conn):
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO user_sessions (token, user_id, expires_at)
                    VALUES (%s, %s, %s);
                    """,
                    (token, user_id, expires_at),
                )


def get_user_by_token(token):
    conn = get_db_connection()
    if conn is None:
        return None
    with closing(conn):
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT u.id, u.username, u.display_name, u.created_at, s.expires_at
                    FROM user_sessions s
                    JOIN users u ON u.id = s.user_id
                    WHERE s.token = %s
                    LIMIT 1;
                    """,
                    (token,),
                )
                row = cur.fetchone()
    if not row:
        return None
    if row[4] and row[4].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        delete_user_session(token)
        return None
    return {
        "id": row[0],
        "username": row[1],
        "display_name": row[2],
        "created_at": row[3].timestamp() if row[3] else None,
    }


def delete_user_session(token):
    conn = get_db_connection()
    if conn is None:
        return
    with closing(conn):
        with conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM user_sessions WHERE token = %s;", (token,))
