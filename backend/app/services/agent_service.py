from typing import Dict, Iterator, List

from ..config import Settings
from ..providers.llm_provider import build_client
from ..repositories.chat_repository import (
    ensure_session,
    get_session_messages,
    list_sessions,
    save_message,
)


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _build_llm_messages(session_id: str, message: str) -> List[Dict[str, str]]:
    history = get_session_messages(session_id, include_system=True)
    llm_messages = (
        [{"role": "system", "content": Settings.SYSTEM_PROMPT}]
        if not history
        else [{"role": item["role"], "content": item["content"]} for item in history]
    )
    llm_messages.append({"role": "user", "content": message})
    return llm_messages


def chat_with_messages(messages, session_id=None):
    sid = ensure_session(session_id or "default")
    client = build_client()
    response = client.chat.completions.create(model=Settings.MODEL_NAME, messages=messages)
    content = response.choices[0].message.content or ""
    if not content:
        raise AppError("MODEL_EMPTY_RESPONSE", "模型返回为空", 502)
    user_content = messages[-1].get("content") if isinstance(messages[-1], dict) else ""
    if user_content:
        save_message(sid, "user", user_content, touch_title=True)
    save_message(sid, "assistant", content)
    return {"ok": True, "content": content, "session_id": sid}


def agent_chat(message, session_id=None):
    if not message:
        raise AppError("INVALID_REQUEST", "message 不能为空", 400)
    sid = ensure_session(session_id)
    llm_messages = _build_llm_messages(sid, message)
    client = build_client()
    response = client.chat.completions.create(model=Settings.MODEL_NAME, messages=llm_messages)
    reply = response.choices[0].message.content or ""
    if not reply:
        raise AppError("MODEL_EMPTY_RESPONSE", "模型返回为空", 502)
    save_message(sid, "user", message, touch_title=True)
    save_message(sid, "assistant", reply)
    return {"ok": True, "session_id": sid, "reply": reply}


def session_list(limit=20):
    limit = max(1, min(limit, 100))
    return {"ok": True, "sessions": list_sessions(limit)}


def session_detail(session_id, include_system=False):
    return {
        "ok": True,
        "session_id": session_id,
        "messages": get_session_messages(session_id, include_system=include_system),
    }


def agent_chat_stream(message, session_id=None) -> Iterator[dict]:
    if not message:
        raise AppError("INVALID_REQUEST", "message 不能为空", 400)

    sid = ensure_session(session_id)
    llm_messages = _build_llm_messages(sid, message)
    client = build_client()
    stream = client.chat.completions.create(
        model=Settings.MODEL_NAME,
        messages=llm_messages,
        stream=True,
    )

    collected: List[str] = []
    yield {"type": "meta", "session_id": sid}
    for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if not delta:
            continue
        collected.append(delta)
        yield {"type": "delta", "content": delta}

    reply = "".join(collected).strip()
    if not reply:
        raise AppError("MODEL_EMPTY_RESPONSE", "模型返回为空", 502)

    save_message(sid, "user", message, touch_title=True)
    save_message(sid, "assistant", reply)
    yield {"type": "done", "session_id": sid}
