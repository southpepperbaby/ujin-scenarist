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

from .dictionaries import CATEGORY_WORDS

# Задержка действия: сутки с запасом. Без верхней границы правило из чата вешало бы прогон насовсем.
MAX_DELAY_S = 86_400
NOW = "__now__"        # триггер разовой команды: «сделай сейчас», а не «когда случится»
Op = Literal["eq", "ne", "gt", "gte", "lt", "lte", "changed"]


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
    delay_s: float = Field(0, ge=0, le=MAX_DELAY_S)


class Notify(BaseModel):
    type: Literal["notify"] = "notify"
    target: Literal["resident", "concierge"] = "resident"
    message: str
    level: Literal["info", "warning", "critical"] = "info"
    delay_s: float = Field(0, ge=0, le=MAX_DELAY_S)


class Dispatch(BaseModel):
    """Заявка подрядчику. Категорию и уровень решает автодиспетчер, если не заданы явно."""
    type: Literal["dispatch"] = "dispatch"
    category: str | None = None
    device_id: str | None = None            # к чему вызывать мастера; нет: устройство из триггера или действий
    note: str = ""
    delay_s: float = Field(0, ge=0, le=MAX_DELAY_S)

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


Action = Annotated[Union[SetSignal, Notify, Dispatch], Field(discriminator="type")]


class Rule(BaseModel):
    id: str = Field(default_factory=lambda: "r-" + uuid.uuid4().hex[:8])
    title: str
    description: str = ""
    scope: Literal["apartment", "building"] = "apartment"
    owner: Literal["resident", "uk"] = "resident"
    priority: int = Field(50, ge=0, le=1000)
    enabled: bool = True
    status: Literal["draft", "tested", "active"] = "draft"   # enabled: включено ли; status: как далеко прошло проверку
    cooldown_s: float = Field(3, ge=0, le=86_400)
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
    """Правила в хранилище SQLite: переживают перезапуск. Старый rules.json забирается один раз."""

    def __init__(self, storage=None, legacy_path: Path | None = None):
        self.storage = storage
        self._lock = threading.Lock()
        self.rules: dict[str, Rule] = {}
        rows = storage.all("rules") if storage else []
        if not rows and legacy_path and legacy_path.exists():
            rows = json.loads(legacy_path.read_text(encoding="utf-8"))
        migrate = bool(rows) and storage is not None and not storage.count("rules")
        for raw in rows:
            rule = Rule.model_validate({**raw, "status": "draft"} if raw.get("status") == "checked" else raw)
            self.rules[rule.id] = rule
            if migrate:                          # rules.json переносится в базу один раз
                storage.put("rules", rule.id, rule.model_dump(mode="json"))

    def all(self) -> list[Rule]:
        return list(self.rules.values())

    def enabled(self) -> list[Rule]:
        return [r for r in self.rules.values() if r.enabled]

    def get(self, rule_id: str) -> Rule:
        return self.rules[rule_id]

    def put(self, rule: Rule) -> Rule:
        with self._lock:
            self.rules[rule.id] = rule
            if self.storage:
                self.storage.put("rules", rule.id, rule.model_dump(mode="json"))
        return rule

    def delete(self, rule_id: str) -> None:
        with self._lock:
            self.rules.pop(rule_id)
            if self.storage:
                self.storage.delete("rules", rule_id)


def _wire(value: Any) -> Any:
    """Мина №1 PULL-CLIENT: платформа не хранит 0 (empty()), сигналы публикуются как 0.001.

    Сценарий должен говорить на том же языке, иначе условие `=0` на стенде никогда не станет истинным,
    а команда `:0` не дойдёт. Тот же приём, что core.wire_value при публикации сигналов.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value == 0:
        return 0.001
    if isinstance(value, str) and value.strip() in ("0", "0.0"):
        return 0.001
    return value


def to_ujin_autoscript(rule: Rule, serial_of: dict[str, str], prefix: str = "") -> dict:
    """Экспорт в формат autoscripts/edit: `when:device-<sn>:<signal>=<v>` / `device-<sn>:<signal>:<v>`.

    Платформа понимает только равенство в условии и только выставление сигнала в действии,
    остальное (условия, уведомления, заявки) исполняет наш движок. Это честно отражаем в `unsupported`.

    Имя сигнала пишется по-разному с двух сторон (мина №6 из START.md организаторов): в условии
    платформа ждёт полное имя с классом модели (`integrations_devices_leak`), в действии — короткое
    (`valve`). Префикс с действия снимаем, иначе команда «вниз» не найдёт сигнал.
    """
    t = rule.trigger
    unsupported = []
    if t.op != "eq":
        unsupported.append(f"триггер со сравнением «{t.op}»")
    if rule.conditions:
        unsupported.append("условия блока «если»")
    sets = []
    for a in rule.actions:
        if not isinstance(a, SetSignal):
            unsupported.append(f"действие «{a.type}»")
        elif a.device_id not in serial_of:
            unsupported.append(f"устройства {a.device_id} нет на стенде")
        else:
            sets.append(f"device-{serial_of[a.device_id]}:{a.signal}:{_wire(a.value)}")
    if t.device_id not in serial_of:
        unsupported.append(f"устройства {t.device_id} из блока «когда» нет на стенде")
    return {
        "scenario_type": "trigger",
        "title": rule.title,
        "condition": f"when:device-{serial_of.get(t.device_id, '?')}:{prefix}{t.signal}={_wire(t.value)}",
        "set_signal": ";".join(sets),
        "unsupported": unsupported,
    }
