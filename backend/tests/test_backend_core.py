import pytest

from app import ai, nl
from app.bus import EventBus
from app.dispatcher import Dispatcher
from app.emu import DeviceRegistry
from app.engine import Engine
from app.linter import lint, summary
from app.rules import Notify, Rule, RuleStore, SetSignal, Trigger
from app.simulate import simulate
from app.tickets import TicketService


def house():
    bus = EventBus()
    reg = DeviceRegistry(bus)
    reg.create("leak", device_id="leak", room="Кухня")
    reg.create("valve", device_id="valve", room="Кухня")
    reg.create("light", device_id="light", room="Коридор")
    reg.create("barrier", device_id="barrier", room="Двор", scope="building")
    return bus, reg


def rule(rid="r", trigger=("leak", "leak", 1), actions=None, **kw):
    d, s, v = trigger
    return Rule(id=rid, title=kw.pop("title", rid), trigger=Trigger(device_id=d, signal=s, value=v),
                actions=actions or [SetSignal(device_id="valve", signal="valve", value=0)], **kw)


# ---------- линтер ----------

def codes(r, others=(), reg=None):
    reg = reg or house()[1]
    return {i["code"] for i in lint(r, list(others), reg)}


def test_lint_catches_read_only_and_bad_value():
    r = rule(actions=[SetSignal(device_id="valve", signal="flow_lpm", value=1),
                      SetSignal(device_id="valve", signal="valve", value=7)])
    assert {"read_only", "bad_value"} <= codes(r)


def test_lint_resident_cannot_control_building_device():
    r = rule(actions=[SetSignal(device_id="barrier", signal="open_cmd", value=1)], owner="resident")
    assert "permission" in codes(r)
    assert "permission" not in codes(r.model_copy(update={"owner": "uk"}))


def test_lint_finds_cycle_between_rules():
    a = rule("a", trigger=("light", "lamp", 1), actions=[SetSignal(device_id="valve", signal="valve", value=0)])
    b = rule("b", trigger=("valve", "valve", 0), actions=[SetSignal(device_id="light", signal="lamp", value=1)])
    assert "cycle" in codes(a, [b])


def test_lint_finds_conflict_and_names_winner():
    _, reg = house()
    mine = rule("mine", actions=[SetSignal(device_id="light", signal="lamp", value=1)], priority=50)
    other = rule("other", actions=[SetSignal(device_id="light", signal="lamp", value=0)], priority=100,
                 title="УК")
    issues = lint(mine, [other], reg)
    conflict = next(i for i in issues if i["code"] == "conflict")
    assert "Победит «УК»" in conflict["message"]


def test_lint_unreachable_condition():
    from app.rules import Condition
    r = rule()
    r.conditions = [Condition(device_id="leak", signal="leak", op="eq", value=0)]
    assert "unreachable" in codes(r)


def test_clean_rule_passes():
    r = rule(actions=[SetSignal(device_id="valve", signal="valve", value=0),
                      Notify(target="resident", message="x")])
    assert summary(lint(r, [], house()[1]))["ok"]


# ---------- прогон ----------

@pytest.mark.asyncio
async def test_simulation_runs_rule_without_touching_live_house():
    _, reg = house()
    report = await simulate(rule(), reg, [], ticks=6)
    assert report["passed"]
    assert report["final_state"]["valve"]["state"] == 0
    assert report["stimulus"]["input"] == "wet"
    assert reg.get("valve").state()["valve"] == 1        # живой клапан не тронут
    assert reg.get("leak").state()["leak"] == 0


@pytest.mark.asyncio
async def test_simulation_with_offline_device_reports_problem():
    _, reg = house()
    report = await simulate(rule(), reg, [], ticks=4, offline=["valve"])
    assert not report["passed"]
    assert "проблемами" in report["verdict"]


# ---------- автодиспетчер ----------

def dispatch_setup():
    bus, reg = house()
    tickets = TicketService(bus)
    tickets.network = False
    engine = Engine(reg, bus, RuleStore())
    disp = Dispatcher(bus, reg, tickets, notify=engine.notify)
    return bus, reg, tickets, engine, disp


def fake_jev(category="plumbing", level="3", conf=0.95, damage=0.9, false_alarm=0.05):
    async def jev(state, questions):
        probs = {str(i): 0.0 for i in range(4)}
        probs[level] = 1.0
        return {"category": {"choice": category, "confidence": conf},
                "severity": {"probabilities": probs},
                "damage": {"noul": damage}, "people": {"noul": 0.1}, "false_alarm": {"noul": false_alarm}}
    return jev


@pytest.mark.asyncio
async def test_critical_leak_sends_ticket_immediately(monkeypatch):
    monkeypatch.setattr(ai, "jev", fake_jev())
    _, _, tickets, engine, disp = dispatch_setup()
    inc = await disp.handle("leak", "leak", "Протечка воды", held_s=3)
    assert inc["decision"] == "auto"
    t = tickets.tickets[inc["ticket_id"]]
    assert t.status == "new" and t.contractor_id == "aquaservice" and t.sla_due
    assert {n["target"] for n in engine.notifications} == {"concierge", "resident"}


@pytest.mark.asyncio
async def test_minor_problem_waits_for_confirmation(monkeypatch):
    monkeypatch.setattr(ai, "jev", fake_jev(category="electric", level="1", damage=0.1))
    _, _, tickets, _, disp = dispatch_setup()
    inc = await disp.handle("light", None, "Свет не включается")
    t = tickets.tickets[inc["ticket_id"]]
    assert inc["decision"] == "draft" and t.status == "draft" and t.needs_confirmation == "resident"


@pytest.mark.asyncio
async def test_low_confidence_only_logs(monkeypatch):
    monkeypatch.setattr(ai, "jev", fake_jev(conf=0.4))
    _, _, tickets, _, disp = dispatch_setup()
    inc = await disp.handle("leak", "leak", "Протечка воды")
    assert inc["decision"] == "log" and not tickets.tickets


@pytest.mark.asyncio
async def test_duplicate_incident_does_not_create_second_ticket(monkeypatch):
    monkeypatch.setattr(ai, "jev", fake_jev())
    _, _, tickets, _, disp = dispatch_setup()
    await disp.handle("leak", "leak", "Протечка воды")
    second = await disp.handle("leak", "leak", "Протечка воды")
    assert second["decision"] == "duplicate" and len(tickets.tickets) == 1


@pytest.mark.asyncio
async def test_fallback_without_ai(monkeypatch):
    async def down(*a, **k):
        raise ai.AIUnavailable("нет сети")
    monkeypatch.setattr(ai, "jev", down)
    _, _, tickets, _, disp = dispatch_setup()
    inc = await disp.handle("leak", "leak", "Протечка воды")
    assert inc["verdict"]["source"] == "rules" and inc["decision"] == "auto"


@pytest.mark.asyncio
async def test_ticket_lifecycle_rejects_illegal_jump(monkeypatch):
    monkeypatch.setattr(ai, "jev", fake_jev())
    _, _, tickets, _, disp = dispatch_setup()
    inc = await disp.handle("leak", "leak", "Протечка воды")
    tid = inc["ticket_id"]
    with pytest.raises(ValueError):
        await tickets.transition(tid, "done", "подрядчик")
    for status in ("accepted", "in_progress", "done", "closed"):
        await tickets.transition(tid, status, "подрядчик")
    assert [h.status for h in tickets.tickets[tid].history][-1] == "closed"


@pytest.mark.asyncio
async def test_debounce_ignores_short_blip():
    bus, reg, tickets, _, disp = dispatch_setup()
    disp.debounce = 0.05
    reg.inject("leak", "wet", True)
    reg.step_all()
    for e in list(bus.history):
        disp.observe(e)
    reg.inject("leak", "wet", False)
    reg.step_all()
    for e in list(bus.history)[-3:]:
        disp.observe(e)
    import asyncio
    await asyncio.sleep(0.1)
    assert not disp.incidents
    assert any(e.kind == "incident" and e.data.get("phase") == "cleared" for e in bus.history)


# ---------- текст → правило ----------

@pytest.mark.asyncio
async def test_nl_compile_maps_aliases_back_and_lints(monkeypatch):
    async def intent(state, questions):
        return {"intent": {"choice": "rule", "confidence": 0.97}}

    async def llm(system, user, **kw):
        assert "leak" not in user.split("Просьба:")[0].split('"device":')[1][:8]   # id скрыт псевдонимом
        return {"title": "Протечка: закрыть воду",
                "trigger": {"device": "dev_1", "signal": "leak", "op": "eq", "value": 1},
                "actions": [{"type": "set_signal", "device": "dev_2", "signal": "valve", "value": 0},
                            {"type": "notify", "target": "resident", "level": "critical", "message": "Протечка"}],
                "explanation": "При протечке закрывает воду."}

    monkeypatch.setattr(ai, "jev", intent)
    monkeypatch.setattr(ai, "llm_json", llm)
    _, reg = house()
    out = await nl.compile_text("если протечка, перекрой воду и напиши мне", reg, [])
    r = out["rule"]
    assert r["trigger"]["device_id"] == "leak" and r["actions"][0]["device_id"] == "valve"
    assert out["lint"]["ok"] and r["enabled"] is False


@pytest.mark.asyncio
async def test_nl_retries_once_on_schema_error(monkeypatch):
    calls = []

    async def intent(state, questions):
        return {"intent": {"choice": "rule", "confidence": 0.9}}

    async def llm(system, user, **kw):
        calls.append(user)
        if len(calls) == 1:
            return {"title": "x", "trigger": {"device": "dev_1", "signal": "leak"}, "actions": []}
        return {"title": "x", "trigger": {"device": "dev_1", "signal": "leak", "value": 1},
                "actions": [{"type": "notify", "target": "resident", "message": "m"}]}

    monkeypatch.setattr(ai, "jev", intent)
    monkeypatch.setattr(ai, "llm_json", llm)
    out = await nl.compile_text("протечка → уведомление", house()[1], [])
    assert out["rule"] and len(calls) == 2 and "не прошёл проверку" in calls[1]


def test_explain_is_plain_language():
    _, reg = house()
    text = nl.explain(rule(), reg)
    assert text.startswith("Когда у «Датчик протечки» протечка становится протечка")
    assert "клапан → закрыт" in text


def test_parse_json_strips_think_and_fences():
    raw = '<think>hmm</think>```json\n{"a": 1}\n```'
    assert ai.parse_json(raw) == {"a": 1}


@pytest.mark.asyncio
async def test_night_rule_is_simulated_inside_its_window():
    from app.rules import TimeCondition
    _, reg = house()
    r = rule()
    r.conditions = [TimeCondition(start="22:00", end="07:00")]
    report = await simulate(r, reg, [], ticks=4)
    assert report["passed"] and report["sim_time"] == "22:00"
    day = await simulate(r, reg, [], ticks=4, at="13:00")
    assert not day["passed"] and "условие не выполнено" in day["verdict"]


def test_time_window_over_midnight():
    from app.rules import TimeCondition
    w = TimeCondition(start="22:00", end="07:00")
    assert w.contains("23:10") and w.contains("06:59") and not w.contains("12:00")
