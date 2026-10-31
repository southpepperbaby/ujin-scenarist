#!/usr/bin/env python3
"""Готовит секреты для запуска: доступы стенда в secrets/ujin.json и .env с переменными бэкенда.

Доступы организаторов (доступы.json) лежат вне git. Скрипт ищет их в корне репозитория или по пути
из первого аргумента. Существующий .env не перезаписывается, недостающие переменные дописываются.
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "доступы.json"
target = ROOT / "secrets" / "ujin.json"

if source.exists():
    json.loads(source.read_text(encoding="utf-8"))          # падаем сразу, если файл битый
    target.parent.mkdir(exist_ok=True)
    shutil.copyfile(source, target)
    print(f"доступы стенда: {target}")
elif not target.exists():
    print(f"нет {source}: бэкенд запустится без стенда Ujin (только эмуляторы)")

env = ROOT / ".env"
current = env.read_text(encoding="utf-8") if env.exists() else ""
defaults = {
    "OPENROUTER_API_KEY": "",
    "LLM_MODEL": "qwen/qwen3.8-flash",
    "UJIN_LIVE": "1" if target.exists() else "0",
    "WEBHOOK_SECRET": "change-me",
    "TELEGRAM_BOT_TOKEN": "",
    "TELEGRAM_CHAT_ID": "",
}
missing = [f"{k}={v}" for k, v in defaults.items() if f"{k}=" not in current]
if missing:
    with open(env, "a", encoding="utf-8") as f:
        f.write(("\n" if current and not current.endswith("\n") else "") + "\n".join(missing) + "\n")
    print(f".env: дописано {len(missing)} переменных, заполни OPENROUTER_API_KEY")
else:
    print(".env уже полный")
