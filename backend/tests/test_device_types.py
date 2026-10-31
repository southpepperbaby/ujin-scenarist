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
