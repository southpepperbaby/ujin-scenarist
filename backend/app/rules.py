"""Схема правил «когда → если → то», хранилище и экспорт в формат Ujin autoscripts.

Правило — это единый формат, который пишут три источника: блочный редактор, LLM из текста и
шаблоны. Всё, что не проходит эту схему, в движок не попадает.
"""
from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field, field_validator

Op = Literal["eq", "ne", "gt", "gte", "lt", "lte", "changed"]

OP_TITLES = {"eq": "=", "ne": "≠", "gt": ">", "gte": "≥", "lt": "<", "lte": "≤", "changed": "изменился"}


class SignalRef(BaseModel):
    device_id: str
    signal: str


class Trigger(SignalRef):
    """Событие: сигнал перешёл в состояние, где выполняется сравнение (срабатывает по фронту)."""
    type: Literal["signal"] = "signal"
    op: Op = "eq"
    value: Any = None


class Condition(SignalRef):
    """Условие проверяется в момент срабатывания по текущему значению сигнала."""
    type: Literal["signal"] = "signal"
    op: Op = "eq"
    value: Any = None


class TimeCondition(BaseModel):
    """Окно времени суток: «ночью» = 22:00-07:00, окно может переходить через полночь."""
    type: Literal["time"] = "time"
    start: str = Field(pattern=r"^\d{2}:\d{2}$")
    end: str = Field(pattern=r"^\d{2}:\d{2}$")

    def contains(self, hhmm: str) -> bool:
        if self.start <= self.end:
            return self.start <= hhmm < self.end
        return hhmm >= self.start or hhmm < self.end

    def inside(self) -> str:
        """Момент внутри окна: нужен прогону, чтобы проверить правило «ночью» днём."""
        return self.start


AnyCondition = Annotated[Union[Condition, TimeCondition], Field(discriminator="type")]


class SetSignal(BaseModel):
    type: Literal["set_signal"] = "set_signal"
    device_id: str
    signal: str
    value: Any
    delay_s: float = 0


class Notify(BaseModel):
    type: Literal["notify"] = "notify"
    target: Literal["resident", "concierge"] = "resident"
    message: str
    level: Literal["info", "warning", "critical"] = "info"
    delay_s: float = 0


class Dispatch(BaseModel):
    """Заявка подрядчику. Категорию и уровень решает автодиспетчер, если не заданы явно."""
    type: Literal["dispatch"] = "dispatch"
    category: str | None = None
    note: str = ""
    delay_s: float = 0

    @field_validator("category", mode="before")
    @classmethod
    def normalize_category(cls, v):
        """LLM пишет «сантехник» вместо кода: приводим к справочнику, неизвестное отдаём автодиспетчеру."""
        if not v:
            return None
        low = str(v).lower()
        for code, words in CATEGORY_WORDS.items():
            if low == code or any(w in low for w in words):
                return code
        return None


CATEGORY_WORDS = {
    "plumbing": ("сантех", "вод", "труб", "протеч", "клапан"),
    "electric": ("электр", "свет", "розет"),
    "access": ("ворот", "шлагбаум", "домофон", "замок", "скуд"),
    "lift": ("лифт",),
    "fire": ("пожар", "дым"),
    "heating": ("отоплен", "вентиляц", "кондиц", "термостат", "тепл"),
    "general": ("мастер", "общ"),
}


Action = Annotated[Union[SetSignal, Notify, Dispatch], Field(discriminator="type")]


class Rule(BaseModel):
    id: str = Field(default_factory=lambda: "r-" + uuid.uuid4().hex[:8])
    title: str
    description: str = ""
    scope: Literal["apartment", "building"] = "apartment"
    owner: Literal["resident", "uk"] = "resident"
    priority: int = 50
    enabled: bool = True
    status: Literal["draft", "checked", "tested", "active"] = "draft"
    cooldown_s: float = 3
    trigger: Trigger
    conditions: list[AnyCondition] = []
    actions: list[Action] = Field(min_length=1)


def compare(op: str, current: Any, expected: Any, prev: Any = None) -> bool:
    if op == "changed":
        return current != prev
    try:
        a, b = float(current), float(expected)
    except (TypeError, ValueError):
        a, b = str(current), str(expected)
    return {
        "eq": a == b, "ne": a != b, "gt": a > b,
        "gte": a >= b, "lt": a < b, "lte": a <= b,
    }[op]


class RuleStore:
    """Правила в JSON-файле: переживают перезапуск, читаются глазами, легко сидить."""

    def __init__(self, path: Path | None = None):
        self.path = path
        self._lock = threading.Lock()
        self.rules: dict[str, Rule] = {}
        if path and path.exists():
            for raw in json.loads(path.read_text(encoding="utf-8")):
                rule = Rule.model_validate(raw)
                self.rules[rule.id] = rule

    def all(self) -> list[Rule]:
        return list(self.rules.values())

    def enabled(self) -> list[Rule]:
        return [r for r in self.rules.values() if r.enabled]

    def get(self, rule_id: str) -> Rule:
        return self.rules[rule_id]

    def put(self, rule: Rule) -> Rule:
        with self._lock:
            self.rules[rule.id] = rule
            self._save()
        return rule

    def delete(self, rule_id: str) -> None:
        with self._lock:
            self.rules.pop(rule_id)
            self._save()

    def _save(self) -> None:
        if not self.path:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = [r.model_dump(mode="json") for r in self.rules.values()]
        self.path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def to_ujin_autoscript(rule: Rule, serial_of: dict[str, str], prefix: str = "") -> dict:
    """Экспорт в формат autoscripts/edit: `when:device-<sn>:<signal>=<v>` / `device-<sn>:<signal>:<v>`.

    Платформа понимает только равенство в условии и только выставление сигнала в действии,
    остальное (условия, уведомления, заявки) исполняет наш движок. Это честно отражаем в `unsupported`.
    """
    t = rule.trigger
    unsupported = []
    if t.op != "eq":
        unsupported.append(f"trigger op {t.op}")
    if rule.conditions:
        unsupported.append("conditions")
    sets = []
    for a in rule.actions:
        if isinstance(a, SetSignal) and a.device_id in serial_of:
            sets.append(f"device-{serial_of[a.device_id]}:{prefix}{a.signal}:{a.value}")
        else:
            unsupported.append(f"action {a.type}")
    if t.device_id not in serial_of:
        unsupported.append("trigger device is not on the platform")
    return {
        "scenario_type": "trigger",
        "title": rule.title,
        "condition": f"when:device-{serial_of.get(t.device_id, '?')}:{prefix}{t.signal}={t.value}",
        "set_signal": ";".join(sets),
        "unsupported": unsupported,
    }
