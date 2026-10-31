"""Свои типы устройств из интерфейса: декларация в четырёх разрезах ТЗ без написания Python.

Человек описывает сигналы по группам:
- измерения (property): то, что устройство меряет и сообщает, только чтение;
- события (event): именованные состояния со справочником значений, например «Открыто / Закрыто»;
- команды (command): то, чем платформа и правила управляют;
- настройки (setting): параметры работы, тоже управляемые.

Из декларации собирается класс эмулятора на ядре организаторов (тот же Signal и Device, что у
готовых типов), поэтому линтер, прогон, Gherkin, движок и мост в Ujin работают с ним без доработок.
Поведение задаётся без кода тремя видами правил устройства (behaviors), они исполняются на каждом тике:
- drift: измерение меняется само (батарея −0.5 за тик, шум ±0.3 в пределах min/max);
- effect: команда ведёт к результату через N тиков («Открыть» = 1 → «Створка» = «открыта» через 3 тика);
- threshold: порог рождает событие (давление > 8 → «Состояние» = «авария», ниже порога обратно «норма»).
Измерения и события по-прежнему можно выставить вручную в песочнице.
"""
from __future__ import annotations

import random
import re
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field, field_validator, model_validator

from .dictionaries import OP_SIGNS
from .emu import INPUTS, REGISTRY  # noqa: I001  emu кладёт папку эмуляторов в sys.path

from core import Device, Signal  # noqa: E402  тот же модуль ядра, что у готовых типов

Group = Literal["property", "event", "command", "setting"]
ValueType = Literal["number", "switch", "list", "text"]

GROUP_TITLES = {"property": "Измерения", "event": "События", "command": "Команды", "setting": "Настройки"}
BUILTIN = frozenset(REGISTRY)


class SignalSpec(BaseModel):
    name: str = Field(pattern=r"^[a-z][a-z0-9_]{0,31}$")
    title: str = Field(min_length=1, max_length=60)
    group: Group
    type: ValueType = "number"
    measure: str = ""
    min: float | None = None
    max: float | None = None
    layout: dict[str, str] | None = None          # значения для list и switch: {"0": "закрыто", "1": "открыто"}
    default: Any = 0
    alarm_value: Any = None                       # значение-неисправность: по нему сработает автодиспетчер

    @model_validator(mode="after")
    def _check(self):
        if self.group == "event" and self.type not in ("list", "switch"):
            self.type = "list"
        if self.type == "switch" and not self.layout:
            self.layout = {"0": "выкл", "1": "вкл"}
        if self.type == "list" and not self.layout:
            raise ValueError(f"у «{self.title}» нет списка значений")
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError(f"у «{self.title}» минимум больше максимума")
        return self

    def to_signal(self) -> Signal:
        management = "r" if self.group in ("property", "event") else "rw"
        kind = {"property": "property", "event": "property", "command": "capability", "setting": "setting"}[self.group]
        control = {"switch": "switch", "list": "list", "text": "text"}.get(self.type) or (
            "counter" if self.group == "setting" else "graph")
        layout = {_key(k): v for k, v in self.layout.items()} if self.layout else None
        return Signal(self.name, self.title, control, management, kind, _key(self.default) if layout else self.default,
                      self.measure, self.min, self.max, layout)


class Drift(BaseModel):
    """Измерение меняется само на каждом тике: тренд step плюс случайный шум, в пределах min/max."""
    type: Literal["drift"] = "drift"
    signal: str
    step: float = 0
    noise: float = Field(0, ge=0)


class Effect(BaseModel):
    """Команда ведёт к результату: когда command получил value, через delay тиков target = target_value."""
    type: Literal["effect"] = "effect"
    command: str
    value: Any = None                       # None: любое значение команды
    target: str
    target_value: Any = None                # None: то же значение, что пришло в команде
    delay: int = Field(0, ge=0, le=600)


class Threshold(BaseModel):
    """Порог рождает событие: пока source op limit, target = value, иначе target = else_value."""
    type: Literal["threshold"] = "threshold"
    source: str
    op: Literal["gt", "gte", "lt", "lte"] = "gt"
    limit: float
    target: str
    value: Any
    else_value: Any = None                  # None: при возврате за порог значение не трогаем


Behavior = Annotated[Union[Drift, Effect, Threshold], Field(discriminator="type")]
OPS = {"gt": lambda a, b: a > b, "gte": lambda a, b: a >= b, "lt": lambda a, b: a < b, "lte": lambda a, b: a <= b}
OP_WORDS = OP_SIGNS


class DeviceType(BaseModel):
    family: str = Field(pattern=r"^[a-z][a-z0-9_]{1,31}$")
    title: str = Field(min_length=1, max_length=60)
    signals: list[SignalSpec] = Field(min_length=1)
    behaviors: list[Behavior] = []

    @field_validator("family")
    @classmethod
    def _not_builtin(cls, v: str) -> str:
        if v in BUILTIN:
            raise ValueError(f"тип «{v}» встроенный, выберите другое имя")
        return v

    @model_validator(mode="after")
    def _unique(self):
        names = [s.name for s in self.signals]
        dup = {n for n in names if names.count(n) > 1}
        if dup or "fw" in names:
            raise ValueError(f"повторяются имена сигналов: {', '.join(sorted(dup or {'fw'}))}")
        self._check_behaviors()
        return self

    def _check_behaviors(self) -> None:
        """Поведение ссылается только на свои сигналы и только туда, где это имеет смысл."""
        by = {s.name: s for s in self.signals}

        def need(name: str, groups: tuple[str, ...], what: str) -> SignalSpec:
            sig = by.get(name)
            if sig is None:
                raise ValueError(f"поведение ссылается на неизвестный сигнал «{name}»")
            if sig.group not in groups:
                names = ", ".join(GROUP_TITLES[g].lower() for g in groups)
                raise ValueError(f"{what}: «{sig.title}» должен быть из групп: {names}")
            return sig

        for b in self.behaviors:
            if isinstance(b, Drift):
                sig = need(b.signal, ("property",), "само меняется только измерение")
                if sig.type != "number":
                    raise ValueError(f"«{sig.title}» не число, меняться само не может")
            elif isinstance(b, Effect):
                need(b.command, ("command", "setting"), "результат вызывает команда или настройка")
                need(b.target, ("property", "event"), "результатом команды становится измерение или событие")
            else:
                sig = need(b.source, ("property",), "порог считается по измерению")
                if sig.type != "number":
                    raise ValueError(f"«{sig.title}» не число, порог к нему не применить")
                need(b.target, ("event", "property"), "порог выставляет событие или измерение")

    def describe(self) -> list[str]:
        """Поведение простым языком: что устройство делает само."""
        by = {s.name: s for s in self.signals}

        def val(name: str, v: Any) -> str:
            sig = by[name]
            if sig.layout:
                return f"«{sig.layout.get(str(v), v)}»"
            return f"{v:g} {sig.measure}".strip() if isinstance(v, (int, float)) else str(v)

        out = []
        for b in self.behaviors:
            if isinstance(b, Drift):
                parts = []
                if b.step:
                    parts.append(f"{'растёт' if b.step > 0 else 'падает'} на {abs(b.step):g} {by[b.signal].measure} за тик".replace("  ", " "))
                if b.noise:
                    parts.append(f"колеблется на ±{b.noise:g}")
                out.append(f"«{by[b.signal].title}» сама {' и '.join(parts) or 'не меняется'}.")
            elif isinstance(b, Effect):
                when = f"«{by[b.command].title}»" + (f" = {val(b.command, b.value)}" if b.value is not None else "")
                then = val(b.target, b.target_value) if b.target_value is not None else "значение команды"
                delay = f"через {b.delay} тик." if b.delay else "сразу"
                out.append(f"Команда {when}: {delay} «{by[b.target].title}» = {then}.")
            else:
                tail = f", иначе {val(b.target, b.else_value)}" if b.else_value is not None else ""
                out.append(f"Если «{by[b.source].title}» {OP_WORDS[b.op]} {val(b.source, b.limit)}: "
                           f"«{by[b.target].title}» = {val(b.target, b.value)}{tail}.")
        return out

    def faults(self) -> list[tuple[str, Any, str]]:
        """Неисправности для автодиспетчера в формате FAULTS."""
        out = []
        for s in self.signals:
            if s.alarm_value is None:
                continue
            value = _key(s.alarm_value)
            label = (s.layout or {}).get(str(s.alarm_value), str(s.alarm_value))
            out.append((s.name, value, f"{self.title}: {s.title.lower()} {label}"))
        return out


def _key(v: Any) -> Any:
    """Ключи справочника приходят строками из JSON, а сигналы у ядра числовые: «1» → 1."""
    if isinstance(v, str) and re.fullmatch(r"-?\d+", v):
        return int(v)
    return v


def build_class(spec: DeviceType) -> type[Device]:
    signals = [s.to_signal() for s in spec.signals]
    drifts = [b for b in spec.behaviors if isinstance(b, Drift)]
    effects = [b for b in spec.behaviors if isinstance(b, Effect)]
    thresholds = [b for b in spec.behaviors if isinstance(b, Threshold)]

    def __init__(self, *args, **kwargs):
        Device.__init__(self, *args, **kwargs)
        self._queue: list[list] = []                    # [тиков осталось, сигнал, значение]
        for sig in signals:
            self.add_signal(Signal(**{**sig.__dict__}))

    def on_command(self, name: str, value: Any) -> None:
        for e in effects:
            if e.command == name and (e.value is None or _key(e.value) == _key(value)):
                target = value if e.target_value is None else _key(e.target_value)
                if e.delay:
                    self._queue.append([e.delay, e.target, target])
                else:
                    self.set_value(e.target, target)

    def tick(self, dt: int) -> None:
        for item in list(self._queue):
            item[0] -= dt
            if item[0] <= 0:
                self._queue.remove(item)
                self.set_value(item[1], item[2])
        for d in drifts:
            sig = self.signals[d.signal]
            value = float(sig.value or 0) + d.step * dt + (random.uniform(-d.noise, d.noise) if d.noise else 0)
            if sig.minimum is not None:
                value = max(sig.minimum, value)
            if sig.maximum is not None:
                value = min(sig.maximum, value)
            self.set_value(d.signal, round(value, 2))
        for t in thresholds:
            current = self.signals[t.source].value
            if isinstance(current, (int, float)) and OPS[t.op](current, t.limit):
                self.set_value(t.target, _key(t.value))
            elif t.else_value is not None:
                self.set_value(t.target, _key(t.else_value))

    attrs: dict[str, Any] = {"model": f"custom_{spec.family}", "title": spec.title,
                             "__init__": __init__, "tick": tick, "on_command": on_command}
    for s in spec.signals:
        if s.group in ("property", "event"):
            attrs[f"input_{s.name}"] = (lambda name: lambda self, value: self.set_value(name, _key(value)))(s.name)
    return type(f"Custom_{spec.family}", (Device,), attrs)


class DeviceTypes:
    """Реестр своих типов: регистрирует класс у ядра, воздействия у песочницы, неисправности у диспетчера."""

    def __init__(self, storage=None, faults: dict | None = None):
        self.storage = storage
        self.faults = faults if faults is not None else {}
        self.types: dict[str, DeviceType] = {}
        for raw in storage.all("device_types") if storage else []:
            self._register(DeviceType.model_validate(raw))

    def put(self, spec: DeviceType) -> DeviceType:
        self._register(spec)
        if self.storage:
            self.storage.put("device_types", spec.family, spec.model_dump(mode="json"))
        return spec

    def delete(self, family: str) -> None:
        self.types.pop(family)
        REGISTRY.pop(family, None)
        INPUTS.pop(family, None)
        self.faults.pop(family, None)
        if self.storage:
            self.storage.delete("device_types", family)

    def _register(self, spec: DeviceType) -> None:
        self.types[spec.family] = spec
        REGISTRY[spec.family] = build_class(spec)
        INPUTS[spec.family] = {s.name: f"input_{s.name}" for s in spec.signals if s.group in ("property", "event")}
        self.faults[spec.family] = spec.faults()
