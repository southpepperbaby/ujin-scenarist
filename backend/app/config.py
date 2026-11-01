"""Конфигурация: переменные окружения и доступы к стенду Ujin из secrets/ujin.json (вне git)."""
from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(ROOT / ".env")

DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "backend" / "data"))
SECRETS_PATH = Path(os.environ.get("UJIN_SECRETS", ROOT / "secrets" / "ujin.json"))


def load_ujin_secrets() -> dict:
    if not SECRETS_PATH.is_file():
        return {}
    with open(SECRETS_PATH, encoding="utf-8") as f:
        return json.load(f)


UJIN = load_ujin_secrets()
UJIN_BASE_URL = UJIN.get("api_base") or os.environ.get("UJIN_BASE", "https://api-uae-test.ujin.tech/api")
UJIN_LIVE = os.environ.get("UJIN_LIVE", "0") == "1"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "google/gemini-3.1-flash-lite")
# Запасные модели: OpenRouter переключается сам, если у основной лимит или сбой у провайдера.
LLM_FALLBACKS = [m for m in os.environ.get(
    "LLM_FALLBACKS", "qwen/qwen3.8-flash,deepseek/deepseek-v4.1-flash").split(",") if m]
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "scenarist-demo-secret")
LLM_REASONING = os.environ.get("LLM_REASONING", "off")
JEV_MODEL = os.environ.get("JEV_MODEL", "~typesafe/jev-latest")
# CORS выключен по умолчанию: статику и API отдаёт один nginx, запросы идут с того же адреса.
# Для стороннего фронтенда перечислите адреса через запятую, звёздочку не принимаем.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip() != ""]
