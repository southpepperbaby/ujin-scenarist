"""HTTP и WebSocket API. Запуск: uv run uvicorn app.main:app --reload"""
from __future__ import annotations

import asyncio
import contextlib
from typing import Any

import json

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from . import ai, config, gherkin, nl
from .bus import EventBus
from .device_types import GROUP_TITLES, DeviceType, DeviceTypes
from .dispatcher import FAULTS, Dispatcher, Policy
from .emu import REGISTRY, DeviceRegistry, family_info
from .engine import Engine
from .linter import lint, summary
from .rules import Rule, RuleStore, to_ujin_autoscript
from .seed import SEED_DEVICES, seed_rules
from .simulate import simulate
from . import mock_contractor
from .mock_contractor import router as mock_contractor_router
from .persistence import Persistence
from .storage import Storage
from .tickets import CATEGORY_TITLES, STATUS_TITLES, Contractor, TicketService, verify, visible_to
from .ujin_bridge import UjinBridge

bus = EventBus()
registry = DeviceRegistry(bus, ujin_devices=config.UJIN.get("devices"))
storage = Storage(config.DATA_DIR / "scenarist.db")
store = RuleStore(storage, legacy_path=config.DATA_DIR / "rules.json")
tickets = TicketService(bus, storage=storage)
engine = Engine(registry, bus, store)
dispatcher = Dispatcher(bus, registry, tickets, notify=engine.notify)
persistence = Persistence(storage, registry, engine, dispatcher)
device_types = DeviceTypes(storage, faults=FAULTS)          # до restore: устройства своих типов поднимаются из базы
mock_contractor.load(storage)
engine.dispatch_hook = dispatcher.from_rule
ujin = UjinBridge(bus, registry, config.UJIN)


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    if not persistence.restore() and not registry.devices:
        for device_id, family, title, room, scope, kwargs in SEED_DEVICES:
            registry.create(family, title=title, room=room, scope=scope, device_id=device_id, **kwargs)
    if not store.rules:
        for rule in seed_rules():
            store.put(rule)
    tasks = [asyncio.create_task(c) for c in (
        registry.run(), engine.run(), dispatcher.run(), ujin.run(), persistence.run())]
    yield
    for task in tasks:
        task.cancel()
    persistence.snapshot()


app = FastAPI(title="Сценарист API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(mock_contractor_router)


# ---------- схемы запросов ----------

class DeviceCreate(BaseModel):
    family: str
    title: str | None = None
    room: str = ""
    scope: str = "apartment"
    id: str | None = None
    params: dict[str, Any] = {}


class SignalWrite(BaseModel):
    signal: str
    value: Any


class InputWrite(BaseModel):
    input: str
    value: Any


class DevicePatch(BaseModel):
    title: str | None = None
    room: str | None = None
    scope: str | None = None
    online: bool | None = None


class SimUpdate(BaseModel):
    running: bool | None = None
    speed: float | None = None


# ---------- устройства ----------

@app.get("/api/health")
def health():
    return {"ok": True, "tick": registry.tick_count, "devices": len(registry.devices),
            "rules": len(store.rules), "ujin_live": ujin.live, "ai": ai.enabled(),
            "llm_model": config.LLM_MODEL}


@app.get("/api/families")
def families():
    return [{**family_info(f), "custom": f in device_types.types,
             "spec": device_types.types[f].model_dump(mode="json") if f in device_types.types else None,
             "behavior": device_types.types[f].describe() if f in device_types.types else []}
            for f in sorted(REGISTRY)]


@app.get("/api/device-types/groups")
def device_type_groups():
    return GROUP_TITLES


@app.post("/api/device-types", status_code=201)
def create_device_type(spec: DeviceType):
    """Конструктор: новый тип устройства из декларации сигналов, без Python и генератора из консоли."""
    if spec.family in REGISTRY:
        raise HTTPException(409, f"тип «{spec.family}» уже есть")
    device_types.put(spec)
    return family_info(spec.family)


@app.put("/api/device-types/{family}")
def update_device_type(family: str, spec: DeviceType):
    """Правка типа: устройства этого типа пересоздаются с теми же id, названием, комнатой и связью."""
    if family not in device_types.types:
        raise HTTPException(404, "свой тип не найден")
    spec.family = family
    device_types.put(spec)
    for m in [m for m in registry.devices.values() if m.family == family]:
        online = m.online
        registry.remove(m.id)
        registry.create(family, title=m.title, room=m.room, scope=m.scope, device_id=m.id,
                        binding=m.ujin, serial=m.device.serial)
        registry.set_online(m.id, online)
    return family_info(family)


@app.delete("/api/device-types/{family}", status_code=204)
def delete_device_type(family: str):
    if family not in device_types.types:
        raise HTTPException(404, "свой тип не найден")
    used = [m.title for m in registry.devices.values() if m.family == family]
    if used:
        raise HTTPException(409, f"сначала удалите устройства этого типа: {', '.join(used)}")
    device_types.delete(family)


@app.get("/api/devices")
def devices():
    return [m.to_dict() for m in registry.devices.values()]


@app.post("/api/devices", status_code=201)
def create_device(body: DeviceCreate):
    try:
        managed = registry.create(body.family, title=body.title, room=body.room,
                                  scope=body.scope, device_id=body.id, **body.params)
    except KeyError as exc:
        raise HTTPException(404, str(exc))
    except (ValueError, TypeError) as exc:
        raise HTTPException(400, str(exc))
    return managed.to_dict()


@app.get("/api/devices/{device_id}")
def get_device(device_id: str):
    return _managed(device_id).to_dict()


@app.patch("/api/devices/{device_id}")
def patch_device(device_id: str, body: DevicePatch):
    _managed(device_id)
    if body.online is not None:
        registry.set_online(device_id, body.online)
    return registry.update_meta(device_id, body.title, body.room, body.scope).to_dict()


@app.delete("/api/devices/{device_id}", status_code=204)
def delete_device(device_id: str):
    _managed(device_id)
    registry.remove(device_id)


@app.post("/api/devices/{device_id}/command")
def command(device_id: str, body: SignalWrite):
    _managed(device_id)
    try:
        changed = registry.command(device_id, body.signal, body.value)
    except KeyError as exc:
        raise HTTPException(404, str(exc))
    except PermissionError as exc:
        raise HTTPException(403, str(exc))
    return {"changed": changed}


@app.post("/api/devices/{device_id}/inject")
def inject(device_id: str, body: InputWrite):
    _managed(device_id)
    try:
        changed = registry.inject(device_id, body.input, body.value)
    except KeyError as exc:
        raise HTTPException(404, str(exc))
    return {"changed": changed}


@app.post("/api/devices/{device_id}/signal")
def set_signal(device_id: str, body: SignalWrite):
    _managed(device_id)
    try:
        changed = registry.set_signal(device_id, body.signal, body.value)
    except KeyError as exc:
        raise HTTPException(404, str(exc))
    return {"changed": changed}


# ---------- правила ----------

@app.get("/api/rules")
def rules():
    return [r.model_dump(mode="json") for r in store.all()]


@app.post("/api/rules", status_code=201)
def create_rule(rule: Rule):
    if rule.id in store.rules:
        raise HTTPException(409, f"rule exists: {rule.id}")
    _gate(rule)
    return store.put(rule).model_dump(mode="json")


@app.put("/api/rules/{rule_id}")
def update_rule(rule_id: str, rule: Rule):
    _rule(rule_id)
    rule.id = rule_id
    _gate(rule)
    return store.put(rule).model_dump(mode="json")


def _gate(rule: Rule) -> None:
    """Quality gate: включить правило с ошибками линтера нельзя, сохранить черновик можно."""
    if not rule.enabled:
        return
    report = summary(lint(rule, store.all(), registry))
    if not report["ok"]:
        first = next(i for i in report["issues"] if i["level"] == "error")
        raise HTTPException(422, f"Правило нельзя включить: {first['message']}")


@app.post("/api/lint")
def lint_rule(rule: Rule):
    return summary(lint(rule, store.all(), registry))


class SimRequest(BaseModel):
    rule: Rule
    ticks: int = 15
    offline: list[str] = []
    with_others: bool = True
    at: str | None = None


@app.post("/api/simulate")
async def simulate_rule(body: SimRequest):
    report = await simulate(body.rule, registry, store.all(), ticks=max(1, min(body.ticks, 120)),
                            offline=body.offline, with_others=body.with_others, at=body.at)
    report["lint"] = summary(lint(body.rule, store.all(), registry))
    stored = store.rules.get(body.rule.id)
    if stored and report["passed"] and report["lint"]["ok"] and stored.status in ("draft", "checked"):
        stored.status = "tested"
        store.put(stored)
    return report


@app.get("/api/rules/{rule_id}/feature", response_class=PlainTextResponse)
def rule_feature(rule_id: str):
    """Сценарий проверки правила на Gherkin (русский)."""
    return gherkin.to_feature(_rule(rule_id), registry)


class FeatureRun(BaseModel):
    rule: Rule
    feature: str | None = None


@app.post("/api/gherkin/run")
async def run_feature(body: FeatureRun):
    text = body.feature or gherkin.to_feature(body.rule, registry)
    report = await gherkin.run_feature(text, body.rule, registry, store.all())
    report["text"] = text
    return report


@app.get("/api/rules/{rule_id}/explain")
def explain_rule(rule_id: str):
    return {"text": nl.explain(_rule(rule_id), registry)}


class NLRequest(BaseModel):
    text: str
    role: str = "resident"
    previous: str | None = None          # прошлая просьба, когда человек нажал «нет, дополнить»


class NLConfirm(BaseModel):
    rule: Rule
    role: str = "resident"


@app.post("/api/nl/compile")
async def nl_compile(body: NLRequest):
    try:
        return await nl.compile_text(body.text, registry, store.all(), role=body.role, previous=body.previous)
    except ai.AIUnavailable as exc:
        raise HTTPException(503, f"ИИ недоступен: {exc}")


@app.post("/api/nl/confirm")
async def nl_confirm(body: NLConfirm):
    """«Да, подтвердить» на карточке пересказа. Одинаково для жителя и УК.

    Разовая команда выполняется сразу. Правило сохраняется и включается, если линтер не нашёл ошибок;
    с ошибками остаётся черновиком, и человек видит почему.
    """
    rule = body.rule
    explanation = nl.explain(rule, registry)
    if rule.trigger.device_id == "__now__":
        return {"kind": "command", "explanation": explanation, "run": await nl.execute_now(rule, engine)}
    report = summary(lint(rule, store.all(), registry))
    rule.enabled = report["ok"]
    rule.status = "active" if report["ok"] else "draft"
    store.put(rule)
    return {"kind": "rule", "explanation": explanation, "rule": rule.model_dump(mode="json"), "lint": report}


@app.post("/api/nl/execute")
async def nl_execute(rule: Rule):
    return await nl.execute_now(rule, engine)


@app.delete("/api/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: str):
    _rule(rule_id)
    store.delete(rule_id)


@app.post("/api/rules/{rule_id}/run")
async def run_rule(rule_id: str):
    """Ручной запуск действий правила (кнопка «выполнить сейчас»): условия проверяются, триггер нет."""
    return await engine.execute(_rule(rule_id), None)


@app.get("/api/rules/{rule_id}/ujin")
def export_rule(rule_id: str):
    serials = {m.id: m.ujin["sn"] for m in registry.devices.values() if m.ujin}
    return to_ujin_autoscript(_rule(rule_id), serials, prefix="integrations_devices_")


@app.get("/api/runs")
def runs(limit: int = 50):
    return list(engine.runs)[-limit:]


@app.get("/api/notifications")
def notifications(target: str | None = None, limit: int = 50):
    rows = [n for n in engine.notifications if target in (None, n["target"])]
    return rows[-limit:]


# ---------- инциденты, заявки, подрядчики ----------

@app.get("/api/incidents")
def incidents(limit: int = 50, role: str | None = None):
    rows = sorted(dispatcher.incidents.values(), key=lambda i: i["ts"])
    if role == "resident":
        rows = [i for i in rows if i["scope"] == "apartment"]
    elif role == "uk":
        rows = [i for i in rows if i["scope"] == "building" or (i.get("verdict") or {}).get("level", 0) >= 3]
    return rows[-limit:]


@app.get("/api/tickets")
def list_tickets(role: str | None = None):
    rows = sorted(tickets.tickets.values(), key=lambda t: t.created)
    return [t.model_dump(mode="json") for t in rows if role is None or visible_to(t, role)]


class TicketMove(BaseModel):
    status: str
    actor: str = "консьерж"
    note: str = ""


@app.post("/api/tickets/{ticket_id}/transition")
async def move_ticket(ticket_id: str, body: TicketMove):
    if ticket_id not in tickets.tickets:
        raise HTTPException(404, f"ticket not found: {ticket_id}")
    try:
        t = await tickets.transition(ticket_id, body.status, body.actor, body.note)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    return t.model_dump(mode="json")


@app.post("/api/webhooks/contractors/{contractor_id}")
async def contractor_webhook(contractor_id: str, request: Request):
    """Входящий webhook: подрядчик сообщает статус заявки. Подпись обязательна."""
    body = await request.body()
    if not verify(body, request.headers.get("X-Scenarist-Signature")):
        raise HTTPException(401, "bad signature")
    data = json.loads(body)
    t = tickets.tickets.get(data.get("ticket_id"))
    if t is None or t.contractor_id != contractor_id:
        raise HTTPException(404, "ticket not found for this contractor")
    try:
        t = await tickets.transition(t.id, data["status"], f"подрядчик «{t.contractor_name}»", data.get("note", ""))
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    return {"ok": True, "status": t.status}


@app.get("/api/contractors")
def contractors():
    return [c.model_dump() for c in tickets.contractors.values()]


@app.put("/api/contractors/{contractor_id}")
def put_contractor(contractor_id: str, c: Contractor):
    c.id = contractor_id
    return tickets.upsert_contractor(c).model_dump()


@app.get("/api/policy")
def get_policy():
    return dispatcher.policy


@app.put("/api/policy")
def put_policy(policy: Policy):
    dispatcher.policy = policy
    persistence.save_policy()
    return policy


@app.get("/api/dictionaries")
def dictionaries():
    return {"categories": CATEGORY_TITLES, "statuses": STATUS_TITLES}


# ---------- Ujin OS ----------

class LiveToggle(BaseModel):
    live: bool


@app.get("/api/ujin/status")
def ujin_status():
    return ujin.status()


@app.post("/api/ujin/live")
def ujin_live(body: LiveToggle):
    return ujin.set_live(body.live)


@app.post("/api/ujin/rules/{rule_id}/push")
async def ujin_push(rule_id: str):
    return await asyncio.to_thread(ujin.push_rule, _rule(rule_id))


@app.get("/api/ujin/scripts")
async def ujin_scripts():
    return await asyncio.to_thread(ujin.platform_scripts)


# ---------- симуляция и события ----------

@app.get("/api/sim")
def sim_state():
    return {"running": registry.running, "speed": registry.speed, "tick": registry.tick_count}


@app.post("/api/sim")
def sim_update(body: SimUpdate):
    if body.running is not None:
        registry.running = body.running
    if body.speed is not None:
        registry.speed = max(0.1, min(body.speed, 50.0))
    return sim_state()


@app.post("/api/sim/step")
def sim_step(n: int = 1):
    for _ in range(max(1, min(n, 1000))):
        registry.step_all(1)
    return sim_state()


@app.get("/api/events")
def events(limit: int = 100):
    return bus.recent(limit)


@app.websocket("/ws")
async def ws_events(ws: WebSocket):
    await ws.accept()
    q = bus.subscribe()
    try:
        while True:
            event = await q.get()
            await ws.send_json(event.to_dict())
    except WebSocketDisconnect:
        pass
    finally:
        bus.unsubscribe(q)


def _rule(rule_id: str) -> Rule:
    try:
        return store.get(rule_id)
    except KeyError:
        raise HTTPException(404, f"rule not found: {rule_id}")


def _managed(device_id: str):
    try:
        return registry.get(device_id)
    except KeyError:
        raise HTTPException(404, f"device not found: {device_id}")
