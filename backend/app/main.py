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

bus = EventBus()
registry = DeviceRegistry(bus, ujin_devices=config.UJIN.get("devices"))

# Демо-квартира и общедомовое: пять устройств стенда плюс пожарный датчик и лифт.
SEED = [
    ("leak", "Датчик протечки", "Кухня", "apartment", {}),
    ("counter", "Счётчик холодной воды", "Кухня", "apartment", {"resource": "cold"}),
    ("thermostat", "Термостат", "Спальня", "apartment", {}),
    ("light", "Свет", "Коридор", "apartment", {}),
    ("fire", "Пожарный датчик", "Кухня", "apartment", {}),
    ("barrier", "Шлагбаум", "Двор", "building", {}),
    ("elevator", "Лифт", "Подъезд 1", "building", {"floors": 9}),
]


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    if not registry.devices:
        for family, title, room, scope, kwargs in SEED:
            registry.create(family, title=title, room=room, scope=scope, **kwargs)
    task = asyncio.create_task(registry.run())
    yield
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


def _managed(device_id: str):
    try:
        return registry.get(device_id)
    except KeyError:
        raise HTTPException(404, f"device not found: {device_id}")
