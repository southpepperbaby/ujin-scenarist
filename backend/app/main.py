"""HTTP и WebSocket API. Запуск: uv run uvicorn app.main:app --reload"""
from __future__ import annotations

import asyncio
import contextlib
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import config
from .bus import EventBus
from .emu import REGISTRY, DeviceRegistry, family_info
from .engine import Engine
from .rules import Rule, RuleStore, to_ujin_autoscript
from .seed import SEED_DEVICES, seed_rules

bus = EventBus()
registry = DeviceRegistry(bus, ujin_devices=config.UJIN.get("devices"))
store = RuleStore(config.DATA_DIR / "rules.json")
engine = Engine(registry, bus, store)


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    if not registry.devices:
        for device_id, family, title, room, scope, kwargs in SEED_DEVICES:
            registry.create(family, title=title, room=room, scope=scope, device_id=device_id, **kwargs)
    if not store.rules:
        for rule in seed_rules():
            store.put(rule)
    tasks = [asyncio.create_task(registry.run()), asyncio.create_task(engine.run())]
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(title="Сценарист API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


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
            "ujin_live": config.UJIN_LIVE}


@app.get("/api/families")
def families():
    return [family_info(f) for f in sorted(REGISTRY)]


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
    return store.put(rule).model_dump(mode="json")


@app.put("/api/rules/{rule_id}")
def update_rule(rule_id: str, rule: Rule):
    _rule(rule_id)
    rule.id = rule_id
    return store.put(rule).model_dump(mode="json")


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
    return to_ujin_autoscript(_rule(rule_id), serials)


@app.get("/api/runs")
def runs(limit: int = 50):
    return list(engine.runs)[-limit:]


@app.get("/api/notifications")
def notifications(target: str | None = None, limit: int = 50):
    rows = [n for n in engine.notifications if target in (None, n["target"])]
    return rows[-limit:]


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
