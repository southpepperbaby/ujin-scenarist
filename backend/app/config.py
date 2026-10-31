"""Конфигурация: переменные окружения и доступы к стенду Ujin из secrets/ujin.json (вне git)."""
from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(ROOT / ".env")

SECRETS_PATH = Path(os.environ.get("UJIN_SECRETS", ROOT / "secrets" / "ujin.json"))


def load_ujin_secrets() -> dict:
    if not SECRETS_PATH.exists():
        return {}
    with open(SECRETS_PATH, encoding="utf-8") as f:
        return json.load(f)


UJIN = load_ujin_secrets()
UJIN_BASE_URL = UJIN.get("api_base") or os.environ.get("UJIN_BASE", "https://api-uae-test.ujin.tech/api")
UJIN_LIVE = os.environ.get("UJIN_LIVE", "0") == "1"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen/qwen3-30b-a3b")
JEV_MODEL = os.environ.get("JEV_MODEL", "~typesafe/jev-latest")
