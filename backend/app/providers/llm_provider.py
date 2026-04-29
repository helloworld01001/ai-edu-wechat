import os

from openai import OpenAI

from ..config import Settings


def build_client():
    api_key = os.getenv("MODEL_API_KEY", "")
    base_url = os.getenv("MODEL_BASE_URL", "https://api.flagos.net/v1")
    if not api_key:
        raise ValueError("请先设置环境变量 MODEL_API_KEY")
    return OpenAI(
        api_key=api_key,
        base_url=base_url,
        max_retries=Settings.MODEL_MAX_RETRIES,
    )
