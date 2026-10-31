"""Память между перезапусками: что пишется сразу, а что снимком.

Сразу (каждое изменение): правила, заявки, подрядчики, политика УК, входящие mock-подрядчика.
Это то, что нельзя потерять даже при падении процесса.

Снимком раз в SNAPSHOT_EVERY секунд и при остановке: устройства (значения сигналов меняются
каждый тик, писать их на каждое изменение незачем), журналы запусков, уведомления, инциденты.
При аварийном падении теряется не больше последних нескольких секунд журнала.
"""
from __future__ import annotations

import asyncio

from .storage import Storage

SNAPSHOT_EVERY = 5.0
JOURNAL_KEEP = 300


class Persistence:
    def __init__(self, storage: Storage, registry, engine, dispatcher):
        self.storage = storage
        self.registry = registry
        self.engine = engine
        self.dispatcher = dispatcher
        self._journal_saved = -1

    def restore(self) -> bool:
        """Поднять сохранённое состояние. False, если база пустая (первый запуск, нужен seed)."""
        devices = self.storage.get("snapshot", "devices")
        if devices:
            self.registry.restore(devices)
        for name in ("runs", "notifications"):
            getattr(self.engine, name).extend(self.storage.get("snapshot", name, []))
        for inc in self.storage.get("snapshot", "incidents", []):
            self.dispatcher.incidents[inc["id"]] = inc
        policy = self.storage.get("settings", "policy")
        if policy:
            self.dispatcher.policy = type(self.dispatcher.policy).model_validate(policy)
        return devices is not None

    def save_policy(self) -> None:
        self.storage.put("settings", "policy", self.dispatcher.policy.model_dump(mode="json"))

    def snapshot(self) -> None:
        self.storage.put("snapshot", "devices", self.registry.snapshot())
        if self.engine.journal_version != self._journal_saved:
            self._journal_saved = self.engine.journal_version
            self.storage.put("snapshot", "runs", list(self.engine.runs))
            self.storage.put("snapshot", "notifications", list(self.engine.notifications))
            incidents = list(self.dispatcher.incidents.values())[-JOURNAL_KEEP:]
            self.storage.put("snapshot", "incidents", incidents)

    async def run(self) -> None:
        while True:
            await asyncio.sleep(SNAPSHOT_EVERY)
            self.snapshot()
