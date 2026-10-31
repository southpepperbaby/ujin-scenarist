"""Клиенты моделей через OpenRouter: LLM пишет (JSON по схеме), Jev судит (вердикты с вероятностями).

Конфиденциальность: в модели уходит только то, что передали явно. Идентификаторы устройств
подменяются псевдонимами (`Pseudonymizer`), номера квартир и имена жителей в запросы не попадают.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

import httpx

from . import config

OPENROUTER = "https://openrouter.ai/api"


class AIUnavailable(RuntimeError):
    """Нет ключа или сеть недоступна: вызывающий код переходит на запасной путь без ИИ."""


def enabled() -> bool:
    return bool(config.OPENROUTER_API_KEY)


def _headers() -> dict:
    if not enabled():
        raise AIUnavailable("OPENROUTER_API_KEY не задан")
    return {
        "Authorization": f"Bearer {config.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "X-Title": "HOMIE AI (Ujin hackathon)",
    }


async def llm_json(system: str, user: str, temperature: float = 0.1, timeout: float = 40) -> dict:
    """Запрос к LLM с требованием вернуть один JSON-объект. Возвращает разобранный объект."""
    body = {
        "models": [config.LLM_MODEL, *config.LLM_FALLBACKS],
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "provider": {"data_collection": "deny", "sort": "latency"},
    }
    if config.LLM_REASONING == "off":            # рассуждение модели удлиняет ответ в разы, для JSON по схеме не нужно
        body["reasoning"] = {"enabled": False}
    for attempt in range(2):                     # лимит у всех моделей сразу: одна пауза и повтор
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.post(f"{OPENROUTER}/v1/chat/completions", headers=_headers(), json=body)
        except httpx.HTTPError as exc:
            raise AIUnavailable(f"LLM недоступна: {exc}") from exc
        if r.status_code != 429:
            break
        await asyncio.sleep(1.5)
    if r.status_code != 200:
        raise AIUnavailable(f"LLM {r.status_code}: {r.text[:300]}")
    content = r.json()["choices"][0]["message"]["content"] or ""
    return parse_json(content)


def parse_json(text: str) -> dict:
    """Модели иногда оборачивают JSON в ```json или добавляют рассуждение: вырезаем объект."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, flags=re.S)
    if fence:
        text = fence.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("в ответе модели нет JSON")
    return json.loads(text[start:end + 1])


async def jev(state: Any, questions: dict, timeout: float = 20) -> dict:
    """Jev: типизированные вопросы → ответы с вероятностями. Возвращает dict answers."""
    body = {"model": config.JEV_MODEL, "state": state, "questions": questions}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(f"{OPENROUTER}/alpha/decisions", headers=_headers(), json=body)
    except httpx.HTTPError as exc:
        raise AIUnavailable(f"Jev недоступен: {exc}") from exc
    if r.status_code != 200:
        raise AIUnavailable(f"Jev {r.status_code}: {r.text[:300]}")
    return r.json()["answers"]


class Pseudonymizer:
    """Подмена реальных идентификаторов на `dev_1`, `dev_2`… и обратно."""

    def __init__(self):
        self.forward: dict[str, str] = {}
        self.back: dict[str, str] = {}

    def alias(self, real: str) -> str:
        if real not in self.forward:
            alias = f"dev_{len(self.forward) + 1}"
            self.forward[real] = alias
            self.back[alias] = real
        return self.forward[real]

    def real(self, alias: str) -> str:
        return self.back.get(alias, alias)
