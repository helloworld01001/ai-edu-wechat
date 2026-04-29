import json

from flask import Response, jsonify, request, stream_with_context

from ..repositories.chat_repository import db_ready
from ..services.agent_service import (
    AppError,
    agent_chat,
    agent_chat_stream,
    chat_with_messages,
    session_detail,
    session_list,
)
from ..services.auth_service import login, logout, me, register


def ok(data, status=200):
    return jsonify({"ok": True, "data": data}), status


def fail(code, message, status=400):
    return jsonify({"ok": False, "error": {"code": code, "message": message}}), status


def register_routes(app):
    def _read_bearer_token():
        auth = (request.headers.get("Authorization") or "").strip()
        if auth.lower().startswith("bearer "):
            return auth[7:].strip()
        return ""

    @app.get("/api/health")
    def health():
        db_ok, message = db_ready()
        return ok(
            {
                "service": "ai-edu-backend",
                "db_ok": db_ok,
                "db_message": message,
            },
            200 if db_ok else 503,
        )

    @app.post("/api/chat")
    def chat():
        payload = request.get_json(silent=True) or {}
        messages = payload.get("messages", [])
        if not isinstance(messages, list) or not messages:
            return fail("INVALID_REQUEST", "messages 不能为空", 400)
        try:
            result = chat_with_messages(
                messages=messages,
                session_id=payload.get("sessionId") or payload.get("session_id") or "default",
            )
            # 兼容既有小程序前端：顶层直接返回 ok/content/session_id。
            return jsonify(result)
        except AppError as e:
            return fail(e.code, e.message, e.status_code)
        except Exception as e:
            return fail("INTERNAL_ERROR", str(e), 500)

    @app.post("/api/agent/chat")
    def agent_chat_api():
        payload = request.get_json(silent=True) or {}
        message = (payload.get("message") or "").strip()
        if not message:
            return fail("INVALID_REQUEST", "message 不能为空", 400)
        try:
            return jsonify(agent_chat(message=message, session_id=payload.get("session_id")))
        except AppError as e:
            return fail(e.code, e.message, e.status_code)
        except Exception as e:
            return fail("INTERNAL_ERROR", str(e), 500)

    @app.post("/api/agent/chat/stream")
    def agent_chat_stream_api():
        payload = request.get_json(silent=True) or {}
        message = (payload.get("message") or "").strip()
        if not message:
            return fail("INVALID_REQUEST", "message 不能为空", 400)

        def generate():
            try:
                for event in agent_chat_stream(message=message, session_id=payload.get("session_id")):
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            except AppError as e:
                err = {"type": "error", "code": e.code, "message": e.message}
                yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"
            except Exception as e:
                err = {"type": "error", "code": "INTERNAL_ERROR", "message": str(e)}
                yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"

        return Response(
            stream_with_context(generate()),
            headers={
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @app.get("/api/agent/sessions")
    def agent_sessions_api():
        limit = request.args.get("limit", default=20, type=int)
        return jsonify(session_list(limit=limit))

    @app.get("/api/agent/sessions/<session_id>")
    def agent_session_detail_api(session_id):
        include_system = request.args.get("include_system", "").strip().lower() in {"1", "true", "yes"}
        return jsonify(session_detail(session_id=session_id, include_system=include_system))

    @app.post("/api/auth/register")
    def auth_register_api():
        payload = request.get_json(silent=True) or {}
        try:
            return jsonify(
                register(
                    username=payload.get("username"),
                    password=payload.get("password"),
                    display_name=payload.get("display_name"),
                )
            )
        except AppError as e:
            return fail(e.code, e.message, e.status_code)

    @app.post("/api/auth/login")
    def auth_login_api():
        payload = request.get_json(silent=True) or {}
        try:
            return jsonify(login(username=payload.get("username"), password=payload.get("password")))
        except AppError as e:
            return fail(e.code, e.message, e.status_code)

    @app.get("/api/auth/me")
    def auth_me_api():
        try:
            return jsonify(me(token=_read_bearer_token()))
        except AppError as e:
            return fail(e.code, e.message, e.status_code)

    @app.post("/api/auth/logout")
    def auth_logout_api():
        try:
            return jsonify(logout(token=_read_bearer_token()))
        except AppError as e:
            return fail(e.code, e.message, e.status_code)
