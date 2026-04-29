import os


class Settings:
    SYSTEM_PROMPT = os.getenv(
        "SYSTEM_PROMPT",
        (
            "你是教育平台的学习助手。基于页面上下文与工具结果回答，简洁结构化，不要编造。\n"
            "【输出格式要求】使用标准 Markdown："
            "① 行首不要缩进（缩进会被渲染为代码块）；"
            "② 表格每一行紧挨，中间不要空行；表头下一行必须是 |---|---| 分隔线；"
            "③ 代码统一用 ``` 围栏写，并注明语言；"
            "④ 数学公式用 $...$ 或 $$...$$。"
        ),
    )
    MODEL_NAME = os.getenv("MODEL_NAME", "glm-5")
    MODEL_MAX_RETRIES = int(os.getenv("MODEL_MAX_RETRIES", "0"))
