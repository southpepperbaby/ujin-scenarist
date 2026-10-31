import pytest

from app import ai, nl
from app.bus import EventBus
from app.dispatcher import Dispatcher
from app.emu import DeviceRegistry
from app.engine import Engine
from app.linter import lint, summary
from app.rules import NOW, Dispatch, Notify, Rule, RuleStore, SetSignal, Trigger
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


def fake_jev(category="plumbing", level="3", conf=0.95, false_alarm=0.05, calls=None):
    async def jev(state, questions):
        if calls is not None:
            calls.append(set(questions))
        probs = {str(i): 0.0 for i in range(4)}
        probs[level] = 1.0
        return {"category": {"choice": category, "confidence": conf},
                "severity": {"probabilities": probs}, "false_alarm": {"noul": false_alarm}}
    return jev


async def no_jev(state, questions):
    raise AssertionError("Jev не должен вызываться для известной неисправности")


@pytest.mark.asyncio
async def test_critical_leak_sends_ticket_immediately_by_table(monkeypatch):
    monkeypatch.setattr(ai, "jev", no_jev)
    _, _, tickets, engine, disp = dispatch_setup()
    inc = await disp.handle("leak", "leak", "Протечка воды", held_s=3)
    assert inc["decision"] == "auto" and inc["verdict"]["source"] == "rules"
    t = tickets.tickets[inc["ticket_id"]]
    assert t.status == "new" and t.contractor_id == "aquaservice" and t.sla_due
    assert {n["target"] for n in engine.notifications} == {"concierge", "resident"}


@pytest.mark.asyncio
async def test_unknown_problem_asks_jev_for_contractor(monkeypatch):
    calls = []
    monkeypatch.setattr(ai, "jev", fake_jev(category="electric", level="1", calls=calls))
    _, _, tickets, _, disp = dispatch_setup()
    inc = await disp.handle("light", "lamp", "Свет не включается")
    t = tickets.tickets[inc["ticket_id"]]
    assert calls == [{"category", "severity", "false_alarm"}]
    assert t.category == "electric" and inc["decision"] == "draft" and t.needs_confirmation == "resident"


@pytest.mark.asyncio
async def test_alarm_combination_asks_jev_for_severity_only(monkeypatch):
    calls = []
    monkeypatch.setattr(ai, "jev", fake_jev(level="3", calls=calls))
    _, reg, tickets, _, disp = dispatch_setup()
    reg.inject("leak", "wet", True)
    reg.step_all()
    inc = await disp.handle("valve", "jammed", "Заклинило привод клапана")
    assert calls == [{"severity", "false_alarm"}]           # категорию знает таблица
    assert inc["verdict"]["level"] == 3 and inc["decision"] == "auto"
    assert tickets.tickets[inc["ticket_id"]].category == "plumbing"


@pytest.mark.asyncio
async def test_low_confidence_only_logs(monkeypatch):
    monkeypatch.setattr(ai, "jev", fake_jev(conf=0.4))
    _, _, tickets, _, disp = dispatch_setup()
    inc = await disp.handle("light", "lamp", "Странное поведение света")
    assert inc["decision"] == "log" and not tickets.tickets


@pytest.mark.asyncio
async def test_offline_device_is_minor_without_ai(monkeypatch):
    monkeypatch.setattr(ai, "jev", no_jev)
    _, _, tickets, _, disp = dispatch_setup()
    inc = await disp.handle("leak", None, "Датчик протечки: нет связи")
    assert inc["verdict"]["level"] == 1 and inc["decision"] == "draft"


@pytest.mark.asyncio
async def test_duplicate_incident_does_not_create_second_ticket(monkeypatch):
    monkeypatch.setattr(ai, "jev", no_jev)
    _, _, tickets, _, disp = dispatch_setup()
    await disp.handle("leak", "leak", "Протечка воды")
    second = await disp.handle("leak", "leak", "Протечка воды")
    assert second["decision"] == "duplicate" and len(tickets.tickets) == 1


@pytest.mark.asyncio
async def test_related_fault_joins_open_ticket_of_same_contractor(monkeypatch):
    monkeypatch.setattr(ai, "jev", no_jev)
    _, _, tickets, _, disp = dispatch_setup()
    first = await disp.handle("leak", "leak", "Протечка воды")
    second = await disp.handle("valve", "jammed", "Заклинило привод клапана", forced_category="plumbing")
    t = tickets.tickets[first["ticket_id"]]
    assert second["decision"] == "merged" and second["ticket_id"] == t.id and len(tickets.tickets) == 1
    assert "Заклинило привод клапана" in t.description and t.related_devices == ["valve"] and t.level == 3


@pytest.mark.asyncio
async def test_critical_fault_sends_open_draft_of_same_contractor(monkeypatch):
    monkeypatch.setattr(ai, "jev", no_jev)
    _, _, tickets, engine, disp = dispatch_setup()
    draft = await disp.handle("valve", "jammed", "Заклинило привод клапана")
    assert draft["decision"] == "draft"
    leak = await disp.handle("leak", "leak", "Протечка воды")
    t = tickets.tickets[draft["ticket_id"]]
    assert leak["decision"] == "merged" and len(tickets.tickets) == 1
    assert t.status == "new" and t.level == 3 and t.needs_confirmation is None
    assert any(n["target"] == "concierge" and n["level"] == "critical" for n in engine.notifications)


@pytest.mark.asyncio
async def test_one_off_call_for_plumber_creates_draft_without_device(monkeypatch):
    monkeypatch.setattr(ai, "jev", no_jev)
    _, _, tickets, engine, disp = dispatch_setup()
    engine.dispatch_hook = disp.from_rule
    rule = Rule(title="Вызови сантехника", trigger=Trigger(device_id=NOW, signal=NOW, value=1),
                actions=[Dispatch(category="сантехник", note="Капает кран")])
    run = await engine.execute(rule, None)
    assert run["status"] == "ok", run
    t = next(iter(tickets.tickets.values()))
    assert t.status == "draft" and t.category == "plumbing" and t.device_id is None and t.title == "Капает кран"


@pytest.mark.asyncio
async def test_one_off_dispatch_takes_device_from_action(monkeypatch):
    monkeypatch.setattr(ai, "jev", no_jev)
    _, _, tickets, engine, disp = dispatch_setup()
    engine.dispatch_hook = disp.from_rule
    rule = Rule(title="Мастер к клапану", trigger=Trigger(device_id=NOW, signal=NOW, value=1),
                actions=[Dispatch(category="plumbing", device_id="valve")])
    await engine.execute(rule, None)
    assert next(iter(tickets.tickets.values())).device_id == "valve"


def test_device_reports_active_alarms():
    _, reg = house()
    reg.inject("leak", "wet", True)
    reg.step_all()
    assert reg.get("leak").to_dict()["alarms"] == ["Протечка воды"]
    assert reg.get("light").to_dict()["alarms"] == []


@pytest.mark.asyncio
async def test_fallback_without_ai(monkeypatch):
    async def down(*a, **k):
        raise ai.AIUnavailable("нет сети")
    monkeypatch.setattr(ai, "jev", down)
    _, _, tickets, _, disp = dispatch_setup()
    inc = await disp.handle("light", "lamp", "Свет не включается")
    assert inc["verdict"]["source"] == "rules" and inc["verdict"]["category"] == "electric"


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
        return {"intent": "rule", "title": "Протечка: закрыть воду",
                "trigger": {"device": "dev_1", "signal": "leak", "op": "eq", "value": 1},
                "actions": [{"type": "set_signal", "device": "dev_2", "signal": "valve", "value": 0},
                            {"type": "notify", "target": "resident", "level": "critical", "message": "Протечка"}],
                "explanation": "Ночью включает свет в спальне."}   # модель врёт о себе

    monkeypatch.setattr(ai, "jev", intent)
    monkeypatch.setattr(ai, "llm_json", llm)
    _, reg = house()
    out = await nl.compile_text("если протечка, перекрой воду и напиши мне", reg, [])
    r = out["rule"]
    assert r["trigger"]["device_id"] == "leak" and r["actions"][0]["device_id"] == "valve"
    assert out["lint"]["ok"] and r["enabled"] is False
    # Карточка «вот что я понял» строится из JSON: ложное объяснение модели на неё не попадает.
    assert "Ночью" not in out["explanation"] and "спальн" not in out["explanation"]
    assert out["explanation"].startswith("Когда протечка у «Датчик протечки» становится")
    assert "клапан → «закрыт»" in out["explanation"] and "«Протечка»" in out["explanation"]


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
    assert text.startswith("Когда протечка у «Датчик протечки» становится «протечка»")
    assert "клапан → «закрыт»" in text


def test_explain_covers_every_executed_field():
    from app.rules import Dispatch, TimeCondition
    _, reg = house()
    r = rule(actions=[SetSignal(device_id="light", signal="lamp", value=1, delay_s=5),
                      Notify(target="concierge", level="critical", message="Вода на кухне"),
                      Dispatch(category="plumbing", note="срочно")])
    r.conditions = [TimeCondition(start="22:00", end="07:00")]
    text = nl.explain(r, reg)
    for part in ("время с 22:00 до 07:00", "через 5 с", "сообщить консьержу (срочно): «Вода на кухне»",
                 "Сантехника", "с пометкой «срочно»"):
        assert part in text, part


@pytest.mark.asyncio
async def test_previous_prompt_is_merged_on_refine(monkeypatch):
    seen = []

    async def intent(state, questions):
        return {"intent": {"choice": "rule", "confidence": 0.9}}

    async def llm(system, user, **kw):
        seen.append(user)
        return {"title": "x", "trigger": {"device": "dev_1", "signal": "leak", "value": 1},
                "actions": [{"type": "notify", "target": "resident", "message": "m"}]}

    monkeypatch.setattr(ai, "jev", intent)
    monkeypatch.setattr(ai, "llm_json", llm)
    out = await nl.compile_text("и только ночью", house()[1], [], previous="при протечке напиши мне")
    assert "при протечке напиши мне\nУточнение: и только ночью" in seen[0]
    assert out["text"].endswith("и только ночью")


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


@pytest.mark.asyncio
async def test_major_problem_is_a_ready_draft_for_both_sides(monkeypatch):
    monkeypatch.setattr(ai, "jev", no_jev)
    _, _, tickets, engine, disp = dispatch_setup()
    inc = await disp.handle("valve", "jammed", "Заклинило привод клапана")
    t = tickets.tickets[inc["ticket_id"]]
    assert inc["decision"] == "draft" and t.status == "draft"
    assert {n["target"] for n in engine.notifications} == {"resident"}   # некритичное не уходит в УК
    await tickets.transition(t.id, "new", "житель")
    assert t.status == "new"


def test_resident_cannot_spam_uk_with_minor_notifications():
    r = rule(actions=[Notify(target="concierge", message="лампочка", level="info")], owner="resident")
    assert "uk_noise" in codes(r)
    critical = rule(actions=[Notify(target="concierge", message="потоп", level="critical")], owner="resident")
    assert "uk_noise" not in codes(critical)


def test_uk_sees_only_critical_apartment_tickets():
    from app.tickets import Ticket, visible_to
    minor = Ticket(category="electric", level=1, title="t", description="d", scope="apartment")
    crit = Ticket(category="plumbing", level=3, title="t", description="d", scope="apartment")
    gate = Ticket(category="access", level=1, title="t", description="d", scope="building")
    assert [visible_to(t, "uk") for t in (minor, crit, gate)] == [False, True, True]
    assert [visible_to(t, "resident") for t in (minor, crit, gate)] == [True, True, False]


@pytest.mark.asyncio
async def test_uk_can_enable_auto_send_for_building_minor(monkeypatch):
    monkeypatch.setattr(ai, "jev", no_jev)
    _, _, tickets, engine, disp = dispatch_setup()
    first = await disp.handle("barrier", "alarm", "Авария шлагбаума")
    assert first["decision"] == "draft"
    tickets.tickets.clear()
    disp.policy.auto_send_building = True
    second = await disp.handle("barrier", "alarm", "Авария шлагбаума")
    assert second["decision"] == "auto" and tickets.tickets[second["ticket_id"]].status == "new"
    disp.policy.auto_categories = ["lift"]
    tickets.tickets.clear()
    third = await disp.handle("barrier", "alarm", "Авария шлагбаума")
    assert third["decision"] == "draft"


def test_slow_subscriber_is_asked_to_reconnect():
    bus = EventBus()
    q = bus.subscribe(maxsize=2)
    for _ in range(5):
        bus.emit("tick")
    assert q.qsize() == 1 and q.get_nowait() is None


@pytest.mark.asyncio
async def test_rule_check_warns_only_when_failure_would_go_unnoticed():
    from app.rule_check import check_rule
    _, reg = house()
    told = rule(actions=[SetSignal(device_id="valve", signal="valve", value=0),
                         Notify(target="concierge", level="critical", message="Протечка")])
    out = await check_rule(told, reg, [])
    assert out["passed"] and [line["kind"] for line in out["lines"]] == ["ok"]
    assert "консьерж получил уведомление" in out["lines"][0]["text"]

    silent = rule(actions=[SetSignal(device_id="valve", signal="valve", value=0)])
    out = await check_rule(silent, reg, [])
    assert [line["kind"] for line in out["lines"]] == ["ok", "warn"] and "никто не узнает" in out["lines"][1]["text"]


@pytest.mark.asyncio
async def test_rule_check_fails_on_priority_conflict():
    from app.rule_check import check_rule
    bus, reg = house()
    uk = Rule(id="uk", title="Ночной режим", owner="uk", priority=100, trigger=Trigger(device_id="leak", signal="leak", value=1),
              actions=[SetSignal(device_id="light", signal="lamp", value=0)])
    mine = Rule(id="mine", title="Свет при протечке", trigger=Trigger(device_id="leak", signal="leak", value=1),
                actions=[SetSignal(device_id="light", signal="lamp", value=1)])
    out = await check_rule(mine, reg, [uk])
    assert not out["passed"] and out["lines"][0]["kind"] == "fail" and "Ночной режим" in out["lines"][0]["text"]


@pytest.mark.asyncio
async def test_barrier_that_does_not_close_becomes_a_draft_for_concierge(monkeypatch):
    monkeypatch.setattr(ai, "jev", no_jev)
    _, reg, tickets, _, disp = dispatch_setup()
    reg.inject("barrier", "jam", 1)
    for _ in range(4):
        reg.step_all()
    assert reg.get("barrier").state()["alarm"] == 1 and reg.get("barrier").alarms() == ["Авария шлагбаума"]
    inc = await disp.handle("barrier", "alarm", "Авария шлагбаума", held_s=3)
    t = tickets.tickets[inc["ticket_id"]]
    assert inc["decision"] == "draft" and t.needs_confirmation == "concierge" and t.category == "access"
    reg.inject("barrier", "jam", 0)
    reg.step_all()
    assert reg.get("barrier").state()["alarm"] == 0 and reg.get("barrier").state()["state"] == 0


@pytest.mark.asyncio
async def test_resident_report_on_building_device_goes_to_concierge_once(monkeypatch):
    monkeypatch.setattr(ai, "jev", no_jev)
    _, _, tickets, engine, disp = dispatch_setup()
    engine.dispatch_hook = disp.from_rule

    def report(text):
        return Rule(title="Шлагбаум не закрывается", owner="resident", description=f"Создано из текста: «{text}»",
                    trigger=Trigger(device_id=NOW, signal=NOW, value=1),
                    actions=[Dispatch(device_id="barrier", note="закрывается не до конца")])

    await engine.execute(report("шлагбаум не закрывается до конца"), None)
    t = next(iter(tickets.tickets.values()))
    assert t.scope == "building" and t.needs_confirmation == "concierge" and t.category == "access"
    assert t.device_id == "barrier" and t.status == "draft"
    assert {n["target"] for n in engine.notifications} == {"concierge", "resident"}

    await engine.execute(report("шлагбаум опять не закрылся"), None)
    assert len(tickets.tickets) == 1 and "ещё одно сообщение" in t.description
