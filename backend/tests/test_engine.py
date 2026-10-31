import asyncio

import pytest

from app.bus import EventBus
from app.emu import DeviceRegistry
from app.engine import Engine
from app.rules import Condition, Notify, Rule, RuleStore, SetSignal, Trigger, to_ujin_autoscript


def leak_rule(**kw):
    return Rule(
        id=kw.pop("id", "leak"), title="Протечка", priority=kw.pop("priority", 50),
        trigger=Trigger(device_id="leak", signal="leak", op="eq", value=1),
        actions=kw.pop("actions", [
            SetSignal(device_id="valve", signal="valve", value=0),
            Notify(target="concierge", message="протечка", level="critical"),
        ]),
        **kw,
    )


def make(*rules):
    bus = EventBus()
    reg = DeviceRegistry(bus)
    reg.create("leak", device_id="leak")
    reg.create("valve", device_id="valve")
    reg.create("light", device_id="light")
    store = RuleStore()
    for r in rules:
        store.put(r)
    return bus, reg, Engine(reg, bus, store, retry_pause=0.01)


async def wet(bus, reg, engine):
    reg.inject("leak", "wet", True)
    reg.step_all()
    for e in [e for e in bus.history if e.kind == "signal" and e.data["signal"] == "leak"]:
        engine.on_signal(e)
    await engine.idle()


@pytest.mark.asyncio
async def test_reference_scenario_closes_valve_and_notifies():
    bus, reg, engine = make(leak_rule())
    await wet(bus, reg, engine)
    for _ in range(3):
        reg.step_all()
    assert reg.get("valve").state()["state"] == 0
    assert reg.get("valve").state()["flow_lpm"] == 0
    run = engine.runs[-1]
    assert run["status"] == "ok"
    assert [n["target"] for n in engine.notifications] == ["concierge"]


@pytest.mark.asyncio
async def test_trigger_fires_on_edge_only():
    bus, reg, engine = make(leak_rule(cooldown_s=0))
    await wet(bus, reg, engine)
    reg.step_all()  # протечка держится, фронта нет
    for e in list(bus.history)[-5:]:
        if e.kind == "signal":
            engine.on_signal(e)
    await engine.idle()
    assert len([r for r in engine.runs if r["status"] == "ok"]) == 1


@pytest.mark.asyncio
async def test_offline_device_retries_then_reports_error():
    bus, reg, engine = make(leak_rule())
    reg.set_online("valve", False)
    await wet(bus, reg, engine)
    run = engine.runs[-1]
    assert run["status"] == "partial"
    valve = run["actions"][0]
    assert valve["status"] == "error" and valve["attempts"] == 3
    assert run["actions"][1]["status"] == "ok"  # уведомление ушло, несмотря на сбой клапана
    note = engine.notifications[-1]
    assert "не выполнено" in note["message"] and note["level"] == "critical"
    retries = [e for e in bus.history if e.kind == "rule" and e.data.get("phase") == "retry"]
    assert len(retries) == 3


@pytest.mark.asyncio
async def test_device_back_online_during_retry():
    bus, reg, engine = make(leak_rule())
    reg.set_online("valve", False)

    async def revive():
        await asyncio.sleep(0.005)
        reg.set_online("valve", True)

    await asyncio.gather(wet(bus, reg, engine), revive())
    assert engine.runs[-1]["actions"][0]["status"] == "ok"


@pytest.mark.asyncio
async def test_condition_blocks_actions():
    rule = leak_rule(conditions=[Condition(device_id="light", signal="lamp", op="eq", value=1)])
    bus, reg, engine = make(rule)
    await wet(bus, reg, engine)
    assert engine.runs[-1]["status"] == "skipped"
    assert reg.get("valve").state()["valve"] == 1


@pytest.mark.asyncio
async def test_higher_priority_rule_wins_conflict():
    uk = leak_rule(id="uk", priority=100, actions=[SetSignal(device_id="light", signal="lamp", value=1)])
    resident = Rule(
        id="res", title="Житель", priority=50,
        trigger=Trigger(device_id="valve", signal="valve", op="eq", value=0),
        actions=[SetSignal(device_id="light", signal="lamp", value=0)],
    )
    bus, reg, engine = make(uk)
    await wet(bus, reg, engine)
    engine.store.put(resident)
    reg.command("valve", "valve", 0)
    for e in list(bus.history)[-3:]:
        if e.kind == "signal":
            engine.on_signal(e)
    await engine.idle()
    assert reg.get("light").state()["lamp"] == 1
    assert engine.runs[-1]["actions"][0]["status"] == "conflict"
    assert engine.runs[-1]["status"] == "error"


def test_export_to_ujin_autoscript():
    out = to_ujin_autoscript(leak_rule(), {"leak": "170", "valve": "171"})
    assert out["condition"] == "when:device-170:leak=1"
    assert out["set_signal"] == "device-171:valve:0"
    assert "action notify" in out["unsupported"]
