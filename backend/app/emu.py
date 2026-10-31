"""Обёртка над эмуляторами из пакета Ujin: реестр устройств, цикл тиков, события.

Код эмуляторов (`backend/emulators`) не трогаем: это эталон организаторов. Здесь только
управление экземплярами, снятие диффа сигналов после каждого шага и публикация в шину.
"""
from __future__ import annotations

import asyncio
import itertools
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

EMU_DIR = Path(__file__).resolve().parent.parent / "emulators"
if str(EMU_DIR) not in sys.path:
    sys.path.insert(0, str(EMU_DIR))

from core import Device  # noqa: E402
from devices import REGISTRY  # noqa: E402

from .bus import EventBus  # noqa: E402

# Ручки физики: чем песочница может подтолкнуть датчик снаружи (имя входа -> метод устройства).
INPUTS: dict[str, dict[str, str]] = {
    "leak": {"wet": "set_wet"},
    "fire": {"smoke": "set_smoke"},
    "barrier": {"obstacle": "set_obstacle"},
    "thermostat": {"fault": "set_fault"},
    "valve": {"jam": "set_jam"},
}


class DeviceUnavailable(RuntimeError):
    """Устройство офлайн: команда не доставлена, движок повторит попытку."""


def family_info(family: str) -> dict:
    cls = REGISTRY[family]
    probe = cls(serial="0", logger=lambda _m: None)
    return {
        "family": family,
        "title": cls.title,
        "model": cls.model,
        "inputs": sorted(INPUTS.get(family, {})),
        "declaration": probe.declaration(),
        "events": device_events(probe),
    }


def device_events(device: Device) -> list[dict]:
    """Генерируемые события (четвёртая группа ТЗ): переходы сигналов-состояний в именованные значения.

    В декларации Ujin событий как группы нет, поэтому выводим их из сигналов со справочником значений:
    `leak` с layout {0: нет, 1: протечка} даёт событие «Протечка: протечка».
    """
    out = []
    for sig in device.signals.values():
        if sig.kind == "system" or not sig.layout:
            continue
        for value, label in sig.layout.items():
            out.append({"id": f"{sig.name}={value}", "signal": sig.name, "value": value,
                        "title": f"{sig.title}: {label}"})
    return out


@dataclass
class Managed:
    id: str
    family: str
    title: str
    device: Device
    room: str = ""
    scope: str = "apartment"          # apartment | building
    ujin: dict | None = None          # привязка к стенду: sn / ext / model, если есть
    online: bool = True
    params: dict = field(default_factory=dict)   # параметры эмулятора (ресурс счётчика, этажи лифта)

    def state(self) -> dict[str, Any]:
        return {name: sig.value for name, sig in self.device.signals.items()}

    def to_dict(self) -> dict:
        signals = []
        for sig in self.device.signals.values():
            row = sig.as_declaration()
            row["value"] = sig.value
            signals.append(row)
        return {
            "id": self.id,
            "family": self.family,
            "title": self.title,
            "model": self.device.model,
            "room": self.room,
            "scope": self.scope,
            "ujin": {"sn": self.ujin["sn"], "ext": self.ujin["ext"]} if self.ujin else None,
            "online": self.online,
            "inputs": sorted(INPUTS.get(self.family, {})),
            "signals": signals,
            "events": device_events(self.device),
        }


class DeviceRegistry:
    def __init__(self, bus: EventBus, ujin_devices: list[dict] | None = None):
        self.bus = bus
        self.devices: dict[str, Managed] = {}
        self._seq = itertools.count(1)
        self._ujin_pool = list(ujin_devices or [])
        self.tick_seconds = 1.0
        self.speed = 1.0
        self.running = True
        self.tick_count = 0

    # ---------- жизненный цикл устройств ----------

    def create(self, family: str, title: str | None = None, room: str = "",
               scope: str = "apartment", device_id: str | None = None, binding: dict | None = None,
               serial: str | None = None, **kwargs) -> Managed:
        if family not in REGISTRY:
            raise KeyError(f"unknown family: {family}")
        n = next(self._seq)
        device_id = device_id or f"{family}-{n}"
        if device_id in self.devices:
            raise ValueError(f"device exists: {device_id}")
        cls = REGISTRY[family]
        if binding is not None:                       # восстановление: забираем ту же привязку из пула
            self._ujin_pool = [r for r in self._ujin_pool if r.get("sn") != binding.get("sn")]
        else:
            binding = self._take_binding(family)
        serial = serial or (binding["sn"] if binding else str(1000 + n))
        logger = lambda msg, _id=device_id: self.bus.emit("log", _id, message=str(msg))  # noqa: E731
        device = cls(serial=serial, client=None, logger=logger, **kwargs)
        managed = Managed(id=device_id, family=family, title=title or cls.title,
                          device=device, room=room, scope=scope, ujin=binding, params=dict(kwargs))
        self.devices[device_id] = managed
        self.bus.emit("device", device_id, action="created", device=managed.to_dict())
        return managed

    def remove(self, device_id: str) -> None:
        managed = self.devices.pop(device_id)
        if managed.ujin:
            self._ujin_pool.append(managed.ujin)
        self.bus.emit("device", device_id, action="removed")

    def get(self, device_id: str) -> Managed:
        return self.devices[device_id]

    def _take_binding(self, family: str) -> dict | None:
        for i, row in enumerate(self._ujin_pool):
            if row.get("family") == family:
                return self._ujin_pool.pop(i)
        return None

    # ---------- воздействия ----------

    def command(self, device_id: str, signal: str, value: Any) -> dict:
        """Команда платформы или правила: только управляемые сигналы (rw / w)."""
        managed = self.get(device_id)
        if not managed.online:
            raise DeviceUnavailable(f"{managed.title} недоступно")
        sig = managed.device.signals.get(signal)
        if sig is None:
            raise KeyError(f"unknown signal: {signal}")
        if not sig.writable:
            raise PermissionError(f"signal is read-only: {signal}")
        payload = {"recv": [{"command": "management", "id": managed.device.serial, signal: value}]}
        return self._apply(managed, lambda: managed.device.handle_recv(payload), source="command")

    def inject(self, device_id: str, name: str, value: Any) -> dict:
        """Воздействие физического мира: намочить датчик, задымить, положить предмет под стрелу."""
        managed = self.get(device_id)
        method = INPUTS.get(managed.family, {}).get(name)
        if method is None:
            raise KeyError(f"no input '{name}' for family {managed.family}")
        fn = getattr(managed.device, method)
        self.bus.emit("log", device_id, message=f"[мир] {name}={value}")
        return self._apply(managed, lambda: fn(_coerce_input(value)), source="inject")

    def set_signal(self, device_id: str, signal: str, value: Any) -> dict:
        """Прямое выставление любого сигнала (песочница). Физика может перетереть на следующем тике."""
        managed = self.get(device_id)
        if signal not in managed.device.signals:
            raise KeyError(f"unknown signal: {signal}")
        return self._apply(managed, lambda: managed.device.emit_event(signal, value), source="manual")

    def set_online(self, device_id: str, online: bool) -> None:
        managed = self.get(device_id)
        managed.online = online
        self.bus.emit("device", device_id, action="online" if online else "offline",
                      message=f"{managed.title}: {'на связи' if online else 'нет связи'}")

    def update_meta(self, device_id: str, title: str | None = None, room: str | None = None,
                    scope: str | None = None) -> Managed:
        managed = self.get(device_id)
        if title is not None:
            managed.title = title
        if room is not None:
            managed.room = room
        if scope is not None:
            managed.scope = scope
        self.bus.emit("device", device_id, action="updated", device=managed.to_dict())
        return managed

    # ---------- память между перезапусками ----------

    def snapshot(self) -> list[dict]:
        """Всё, что нужно, чтобы поднять устройства как были: метаданные, привязку, значения, физику."""
        out = []
        for m in self.devices.values():
            inner = {k: v for k, v in vars(m.device).items() if k.startswith("_") and _plain(v)}
            out.append({"id": m.id, "family": m.family, "title": m.title, "room": m.room, "scope": m.scope,
                        "ujin": m.ujin, "serial": m.device.serial, "online": m.online, "params": m.params,
                        "state": m.state(), "inner": inner})
        return out

    def restore(self, rows: list[dict]) -> None:
        for row in rows:
            if row["family"] not in REGISTRY or row["id"] in self.devices:
                continue
            m = self.create(row["family"], title=row["title"], room=row["room"], scope=row["scope"],
                            device_id=row["id"], binding=row.get("ujin"), serial=row.get("serial"),
                            **row.get("params", {}))
            for name, value in row.get("state", {}).items():
                if name in m.device.signals:
                    m.device.signals[name].value = value
            for k, v in row.get("inner", {}).items():
                if hasattr(m.device, k):
                    setattr(m.device, k, v)
            m.online = row.get("online", True)

    # ---------- симуляция ----------

    def step_all(self, dt: int = 1) -> None:
        self.tick_count += 1
        for managed in list(self.devices.values()):
            if not managed.online:
                continue
            self._apply(managed, lambda m=managed: m.device.step(dt), source="tick")

    async def run(self) -> None:
        while True:
            if self.running:
                self.step_all(1)
            await asyncio.sleep(self.tick_seconds / max(self.speed, 0.01))

    def _apply(self, managed: Managed, fn: Callable[[], None], source: str) -> dict:
        before = managed.state()
        fn()
        after = managed.state()
        changed = {k: v for k, v in after.items() if before.get(k) != v}
        for name, value in changed.items():
            self.bus.emit("signal", managed.id, signal=name, value=value,
                          prev=before.get(name), source=source,
                          title=managed.device.signals[name].title)
        return changed


def _coerce_input(value: Any) -> Any:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        low = value.strip().lower()
        if low in ("1", "true", "yes", "on"):
            return True
        if low in ("0", "false", "no", "off"):
            return False
        try:
            return float(value) if "." in value else int(value)
        except ValueError:
            return value
    return value


def _plain(v) -> bool:
    """Внутреннее состояние эмулятора, которое переживёт JSON: числа, строки и их списки (очередь эффектов)."""
    if isinstance(v, (int, float, str, bool, type(None))):
        return True
    if isinstance(v, (list, tuple)):
        return all(_plain(x) for x in v)
    if isinstance(v, dict):
        return all(isinstance(k, str) and _plain(x) for k, x in v.items())
    return False
