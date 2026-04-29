import os


class Settings:
    SYSTEM_PROMPT = os.getenv(
        "SYSTEM_PROMPT",
        "你是启小智，一个面向中学生的 AI 学习助手。回答简洁、准确、结构化。",
    )
    MODEL_NAME = os.getenv("MODEL_NAME", "glm-5")
    # 默认值小于 Gunicorn 常见 30s 超时，避免请求被 worker 直接中止。
    MODEL_TIMEOUT_SECONDS = float(os.getenv("MODEL_TIMEOUT_SECONDS", "20"))
    MODEL_MAX_RETRIES = int(os.getenv("MODEL_MAX_RETRIES", "0"))
