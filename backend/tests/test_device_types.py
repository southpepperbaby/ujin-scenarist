"""Свой тип устройства из интерфейса: четыре группы, работа с движком, диспетчером и памятью."""
import pytest
from pydantic import ValidationError

from app import ai
from app.bus import EventBus
from app.device_types import DeviceType, DeviceTypes
from app.dispatcher import FAULTS, Dispatcher
from app.emu import DeviceRegistry, device_events
from app.engine import Engine
from app.rules import RuleStore
from app.storage import Storage
from app.tickets import TicketService

WINDOW = {
    "family": "window", "title": "Окно с приводом",
    "signals": [
        {"name": "temp", "title": "Температура у окна", "group": "property", "measure": "°C", "min": -40, "max": 60},
        {"name": "state", "title": "Створка", "group": "event", "type": "list",
         "layout": {"0": "закрыта", "1": "открыта", "2": "заклинило"}, "alarm_value": 2},
        {"name": "open", "title": "Открыть", "group": "command", "type": "switch"},
        {"name": "angle", "title": "Угол проветривания", "group": "setting", "measure": "°", "min": 0, "max": 90,
         "default": 15},
    ],
}


@pytest.fixture
def types():
    faults: dict = {}
    t = DeviceTypes(faults=faults)
    t.put(DeviceType.model_validate(WINDOW))
    yield t
    t.delete("window")


def test_custom_type_declares_four_groups(types):
    reg = DeviceRegistry(EventBus())
    m = reg.create("window", device_id="w1", room="Спальня")
    decl = {s["name"]: s for s in m.device.declaration()}
    assert decl["temp"]["group"] == "property" and decl["temp"]["management"] == "r"
    assert decl["open"]["group"] == "capability" and decl["open"]["management"] == "rw"
    assert decl["angle"]["group"] == "setting" and m.state()["angle"] == 15
    assert {"state=1", "state=2"} <= {e["id"] for e in device_events(m.device)}
    reg.command("w1", "open", 1)
    reg.inject("w1", "state", "2")
    assert m.state()["open"] == 1 and m.state()["state"] == 2
    with pytest.raises(PermissionError):
        reg.command("w1", "temp", 5)


def test_bad_declarations_are_rejected():
    with pytest.raises(ValidationError):
        DeviceType.model_validate({**WINDOW, "family": "leak"})            # встроенный тип
    with pytest.raises(ValidationError):
        DeviceType.model_validate({**WINDOW, "signals": [WINDOW["signals"][0]] * 2})
    with pytest.raises(ValidationError):
        DeviceType.model_validate({**WINDOW, "signals": [{"name": "s", "title": "S", "group": "property",
                                                          "type": "list"}]})


@pytest.mark.asyncio
async def test_custom_fault_reaches_dispatcher_via_jev(types, monkeypatch):
    calls = []

    async def jev(state, questions):
        calls.append(set(questions))
        return {"category": {"choice": "general", "confidence": 0.9},
                "severity": {"probabilities": {"0": 0, "1": 0, "2": 1, "3": 0}}, "false_alarm": {"noul": 0.1}}

    monkeypatch.setattr(ai, "jev", jev)
    FAULTS.update(types.faults)
    try:
        bus = EventBus()
        reg = DeviceRegistry(bus)
        reg.create("window", device_id="w1")
        tickets = TicketService(bus)
        tickets.network = False
        disp = Dispatcher(bus, reg, tickets, notify=Engine(reg, bus, RuleStore()).notify)
        title = FAULTS["window"][0][2]
        inc = await disp.handle("w1", "state", title)
        assert calls == [{"category", "severity", "false_alarm"}] and inc["decision"] == "draft"
        assert "заклинило" in title
    finally:
        FAULTS.pop("window", None)


def test_custom_type_survives_restart(tmp_path):
    storage = Storage(tmp_path / "db.sqlite")
    DeviceTypes(storage).put(DeviceType.model_validate(WINDOW))
    again = DeviceTypes(Storage(tmp_path / "db.sqlite"))
    try:
        assert "window" in again.types
        assert DeviceRegistry(EventBus()).create("window").state()["angle"] == 15
    finally:
        again.delete("window")


PRESSURE = {
    "family": "pressure", "title": "Датчик давления",
    "signals": [
        {"name": "bar", "title": "Давление", "group": "property", "measure": "бар", "min": 0, "max": 12, "default": 5},
        {"name": "battery", "title": "Батарея", "group": "property", "measure": "%", "min": 0, "max": 100,
         "default": 100},
        {"name": "status", "title": "Состояние", "group": "event", "type": "list",
         "layout": {"0": "норма", "1": "авария"}, "alarm_value": 1},
        {"name": "pump", "title": "Насос", "group": "command", "type": "switch"},
    ],
    "behaviors": [
        {"type": "drift", "signal": "battery", "step": -0.5},
        {"type": "effect", "command": "pump", "value": 1, "target": "bar", "target_value": 9, "delay": 2},
        {"type": "threshold", "source": "bar", "op": "gt", "limit": 8, "target": "status", "value": 1,
         "else_value": 0},
    ],
}


def test_behaviors_run_on_tick():
    types = DeviceTypes()
    types.put(DeviceType.model_validate(PRESSURE))
    try:
        reg = DeviceRegistry(EventBus())
        m = reg.create("pressure", device_id="p1")
        reg.command("p1", "pump", 1)
        reg.step_all()
        assert m.state()["bar"] == 5 and m.state()["status"] == 0      # насос ещё не дожал
        reg.step_all()
        assert m.state()["bar"] == 9 and m.state()["status"] == 1      # через 2 тика давление и авария
        assert m.state()["battery"] == 99.0                            # батарея садится сама
        reg.inject("p1", "bar", 3)
        reg.step_all()
        assert m.state()["status"] == 0                                # ниже порога обратно «норма»
        text = " ".join(types.types["pressure"].describe())
        assert "Батарея» сама падает на 0.5 % за тик" in text and "через 2 тик." in text and "> 8 бар" in text
    finally:
        types.delete("pressure")


def test_behavior_must_reference_sensible_signals():
    bad = {**PRESSURE, "behaviors": [{"type": "drift", "signal": "status", "step": 1}]}
    with pytest.raises(ValidationError, match="само меняется только измерение"):
        DeviceType.model_validate(bad)
    bad = {**PRESSURE, "behaviors": [{"type": "effect", "command": "bar", "target": "status"}]}
    with pytest.raises(ValidationError, match="команда или настройка"):
        DeviceType.model_validate(bad)
    bad = {**PRESSURE, "behaviors": [{"type": "threshold", "source": "nope", "limit": 1, "target": "status",
                                      "value": 1}]}
    with pytest.raises(ValidationError, match="неизвестный сигнал"):
        DeviceType.model_validate(bad)
