import os


class Settings:
    SYSTEM_PROMPT = os.getenv(
        "SYSTEM_PROMPT",
        "你是启小智，一个面向中学生的 AI 学习助手。回答简洁、准确、结构化。",
    )
    MODEL_NAME = os.getenv("MODEL_NAME", "glm-5")
