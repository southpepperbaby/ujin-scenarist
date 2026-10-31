"""Шина событий: всё, что происходит с устройствами и правилами, проходит через неё.

Подписчики (WebSocket-клиенты, движок правил, тесты) получают события через asyncio.Queue.
История хранится в памяти для ленты событий при первом открытии страницы.
"""
from __future__ import annotations

import asyncio
import itertools
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Event:
    kind: str                     # signal | log | device | rule | incident
    device_id: str | None = None
    data: dict[str, Any] = field(default_factory=dict)
    ts: float = field(default_factory=time.time)
    seq: int = 0

    def to_dict(self) -> dict:
        return {"seq": self.seq, "ts": self.ts, "kind": self.kind,
                "device_id": self.device_id, **self.data}


class EventBus:
    def __init__(self, history: int = 1000):
        self._subs: set[asyncio.Queue] = set()
        self._seq = itertools.count(1)
        self.history: deque[Event] = deque(maxlen=history)

    def publish(self, event: Event) -> Event:
        event.seq = next(self._seq)
        self.history.append(event)
        for q in list(self._subs):
            q.put_nowait(event)
        return event

    def emit(self, kind: str, device_id: str | None = None, **data) -> Event:
        return self.publish(Event(kind=kind, device_id=device_id, data=data))

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subs.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subs.discard(q)

    def recent(self, limit: int = 100) -> list[dict]:
        return [e.to_dict() for e in list(self.history)[-limit:]]
