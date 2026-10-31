"""Перезапуск процесса ничего не теряет: правила, заявки, политика, устройства и журналы."""
import pytest

from app import ai
from app.bus import EventBus
from app.dispatcher import Dispatcher
from app.emu import DeviceRegistry
from app.engine import Engine
from app.persistence import Persistence
from app.rules import RuleStore
from app.storage import Storage
from app.tickets import TicketService

from test_backend_core import fake_jev, rule


def boot(db):
    """Поднять всё приложение заново поверх той же базы, как это делает main.py."""
    storage = Storage(db)
    bus = EventBus()
    reg = DeviceRegistry(bus)
    store = RuleStore(storage)
    tickets = TicketService(bus, storage=storage)
    tickets.network = False
    engine = Engine(reg, bus, store)
    disp = Dispatcher(bus, reg, tickets, notify=engine.notify)
    persist = Persistence(storage, reg, engine, disp)
    fresh = not persist.restore()
    if fresh:
        reg.create("leak", device_id="leak", room="Кухня")
        reg.create("valve", device_id="valve", room="Кухня")
    return storage, reg, store, tickets, engine, disp, persist, fresh


@pytest.mark.asyncio
async def test_restart_keeps_everything(tmp_path, monkeypatch):
    monkeypatch.setattr(ai, "jev", fake_jev())
    db = tmp_path / "scenarist.db"
    storage, reg, store, tickets, engine, disp, persist, fresh = boot(db)
    assert fresh

    store.put(rule("leak-shutoff", title="Перекрыть воду"))
    reg.command("valve", "valve", 0)
    for _ in range(3):
        reg.step_all(1)
    reg.update_meta("leak", title="Датчик под мойкой")
    reg.set_online("valve", False)
    inc = await disp.handle("leak", "leak", "Протечка воды", held_s=3)
    disp.policy.auto_send_building = True
    persist.save_policy()
    persist.snapshot()
    storage.close()

    storage, reg, store, tickets, engine, disp, persist, fresh = boot(db)
    assert not fresh
    assert store.get("leak-shutoff").title == "Перекрыть воду"
    assert reg.get("leak").title == "Датчик под мойкой"
    assert reg.get("valve").online is False
    assert reg.get("valve").state()["valve"] == 0 and reg.get("valve").state()["state"] == 0
    assert tickets.tickets[inc["ticket_id"]].status == "new"
    assert disp.incidents[inc["id"]]["decision"] == "auto"
    assert disp.policy.auto_send_building is True
    assert engine.notifications
    storage.close()


def test_legacy_rules_json_is_migrated(tmp_path):
    import json
    legacy = tmp_path / "rules.json"
    legacy.write_text(json.dumps([rule("old").model_dump(mode="json")]), encoding="utf-8")
    storage = Storage(tmp_path / "db.sqlite")
    assert "old" in RuleStore(storage, legacy_path=legacy).rules
    assert storage.count("rules") == 1
