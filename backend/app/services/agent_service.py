import re
from typing import Dict, Iterator, List

from openai import APIConnectionError, APIError, APITimeoutError, RateLimitError

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


_THINK_BLOCK_RE = re.compile(r"<think>.*?</think>", flags=re.IGNORECASE | re.DOTALL)
_THINK_OPEN_TO_END_RE = re.compile(r"<think>.*$", flags=re.IGNORECASE | re.DOTALL)
_THINK_CLOSE_TAG_RE = re.compile(r"</think>", flags=re.IGNORECASE)


def _strip_think_content(text: str) -> str:
    # 过滤模型推理标签，避免把思维链展示给用户。
    out = _THINK_BLOCK_RE.sub("", text or "")
    out = _THINK_OPEN_TO_END_RE.sub("", out)
    out = _THINK_CLOSE_TAG_RE.sub("", out)
    return out.strip()


def _build_llm_messages(session_id: str, message: str) -> List[Dict[str, str]]:
    history = get_session_messages(session_id, include_system=True)
    llm_messages = (
        [{"role": "system", "content": Settings.SYSTEM_PROMPT}]
        if not history
        else [{"role": item["role"], "content": item["content"]} for item in history]
    )
    llm_messages.append({"role": "user", "content": message})
    return llm_messages


def _request_completion(client, messages, stream=False):
    try:
        return client.chat.completions.create(
            model=Settings.MODEL_NAME,
            messages=messages,
            stream=stream,
        )
    except APITimeoutError:
        raise AppError("MODEL_TIMEOUT", "模型响应超时，请稍后重试", 504)
    except RateLimitError:
        raise AppError("MODEL_RATE_LIMIT", "模型请求过于频繁，请稍后再试", 429)
    except APIConnectionError:
        raise AppError("MODEL_CONNECTION_ERROR", "模型服务连接失败，请稍后重试", 502)
    except APIError as e:
        raise AppError("MODEL_API_ERROR", f"模型服务异常: {e}", 502)


def chat_with_messages(messages, session_id=None):
    sid = ensure_session(session_id or "default")
    client = build_client()
    response = _request_completion(client, messages=messages)
    content = _strip_think_content(response.choices[0].message.content or "")
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
    response = _request_completion(client, messages=llm_messages)
    reply = _strip_think_content(response.choices[0].message.content or "")
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
    stream = _request_completion(client, messages=llm_messages, stream=True)

    collected: List[str] = []
    visible_so_far = ""
    yield {"type": "meta", "session_id": sid}
    for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if not delta:
            continue
        collected.append(delta)
        current_visible = _strip_think_content("".join(collected))
        newly_visible = current_visible[len(visible_so_far) :]
        if newly_visible:
            visible_so_far = current_visible
            yield {"type": "delta", "content": newly_visible}

    reply = _strip_think_content("".join(collected))
    if not reply:
        raise AppError("MODEL_EMPTY_RESPONSE", "模型返回为空", 502)

    save_message(sid, "user", message, touch_title=True)
    save_message(sid, "assistant", reply)
    yield {"type": "done", "session_id": sid}
