from flask import Flask
from flask_cors import CORS

from .api.routes import register_routes
from .repositories.chat_repository import init_db_safe


def create_app():
    app = Flask(__name__)
    CORS(app)
    register_routes(app)
    init_db_safe()
    return app
