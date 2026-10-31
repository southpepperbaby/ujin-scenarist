"""Свои типы устройств из интерфейса: декларация в четырёх разрезах ТЗ без написания Python.

Человек описывает сигналы по группам:
- измерения (property): то, что устройство меряет и сообщает, только чтение;
- события (event): именованные состояния со справочником значений, например «Открыто / Закрыто»;
- команды (command): то, чем платформа и правила управляют;
- настройки (setting): параметры работы, тоже управляемые.

Из декларации собирается класс эмулятора на ядре организаторов (тот же Signal и Device, что у
готовых типов), поэтому линтер, прогон, Gherkin, движок и мост в Ujin работают с ним без доработок.
Физики у такого устройства нет: команды и настройки применяются как есть, а измерения и события в
песочнице выставляются вручную (кнопки воздействий генерируются из декларации).
"""
from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

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


class DeviceType(BaseModel):
    family: str = Field(pattern=r"^[a-z][a-z0-9_]{1,31}$")
    title: str = Field(min_length=1, max_length=60)
    signals: list[SignalSpec] = Field(min_length=1)

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
        return self

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

    def __init__(self, *args, **kwargs):
        Device.__init__(self, *args, **kwargs)
        for sig in signals:
            self.add_signal(Signal(**{**sig.__dict__}))

    def tick(self, dt: int) -> None:          # физики нет: значения меняют команды и воздействия
        pass

    attrs: dict[str, Any] = {"model": f"custom_{spec.family}", "title": spec.title,
                             "__init__": __init__, "tick": tick}
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
