from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from .api.routes import register_routes
from .services.agent_service import AppError
from .repositories.chat_repository import init_db_safe


def create_app():
    app = Flask(__name__)
    CORS(app)
    register_routes(app)
    init_db_safe()

    @app.errorhandler(AppError)
    def handle_app_error(e):
        return (
            jsonify({"ok": False, "error": {"code": e.code, "message": e.message}}),
            e.status_code,
        )

    @app.errorhandler(HTTPException)
    def handle_http_exception(e):
        # 统一返回 JSON，避免反向代理返回 HTML 错误页影响前端解析。
        return (
            jsonify({"ok": False, "error": {"code": e.name.upper().replace(" ", "_"), "message": e.description}}),
            e.code,
        )

    @app.errorhandler(Exception)
    def handle_unexpected_error(_e):
        return (
            jsonify(
                {
                    "ok": False,
                    "error": {
                        "code": "INTERNAL_ERROR",
                        "message": "服务内部异常，请稍后重试",
                    },
                }
            ),
            500,
        )

    return app
