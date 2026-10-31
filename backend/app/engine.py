"""Движок исполнения: слушает шину, ловит фронт триггера, проверяет условия, выполняет действия.

Устойчивость (подзадача 4 ТЗ):
- недоступное устройство: действие повторяется с паузой, после исчерпания попыток — ошибка в журнале,
  остальные действия правила выполняются;
- защита от дребезга и циклов: cooldown правила и лимит срабатываний в минуту;
- конфликт за сигнал: правило с меньшим приоритетом не перетирает значение, выставленное
  более приоритетным правилом за последние CONFLICT_WINDOW секунд.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from collections import deque
from typing import Awaitable, Callable

from .bus import Event, EventBus
from .emu import DeviceRegistry, DeviceUnavailable
from .rules import Dispatch, Notify, Rule, RuleStore, SetSignal, compare

RETRIES = 3
RETRY_PAUSE = 1.0
CONFLICT_WINDOW = 10.0
MAX_FIRES_PER_MIN = 20

DispatchHook = Callable[[Rule, Dispatch, dict], Awaitable[dict]]


class Engine:
    def __init__(self, registry: DeviceRegistry, bus: EventBus, store: RuleStore,
                 dispatch_hook: DispatchHook | None = None, retry_pause: float = RETRY_PAUSE):
        self.registry = registry
        self.bus = bus
        self.store = store
        self.dispatch_hook = dispatch_hook
        self.retry_pause = retry_pause
        self.runs: deque[dict] = deque(maxlen=300)
        self.notifications: deque[dict] = deque(maxlen=300)
        self._last_fire: dict[str, float] = {}
        self._fires: dict[str, deque[float]] = {}
        self._writes: dict[tuple[str, str], tuple[str, int, float]] = {}
        self._tasks: set[asyncio.Task] = set()

    # ---------- цикл ----------

    async def run(self) -> None:
        q = self.bus.subscribe()
        try:
            while True:
                event = await q.get()
                if event.kind == "signal":
                    self.on_signal(event)
        finally:
            self.bus.unsubscribe(q)

    def on_signal(self, event: Event) -> list[asyncio.Task]:
        started = []
        for rule in self.store.enabled():
            t = rule.trigger
            if t.device_id != event.device_id or t.signal != event.data.get("signal"):
                continue
            now_ok = compare(t.op, event.data.get("value"), t.value, event.data.get("prev"))
            was_ok = t.op != "changed" and compare(t.op, event.data.get("prev"), t.value)
            if not now_ok or was_ok:
                continue
            reason = self._throttled(rule)
            if reason:
                self._record(rule, event, status="skipped", reason=reason)
                continue
            task = asyncio.create_task(self.execute(rule, event))
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
            started.append(task)
        return started

    async def idle(self) -> None:
        """Дождаться всех запущенных исполнений (тесты и прогон в песочнице)."""
        while self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)

    # ---------- исполнение правила ----------

    async def execute(self, rule: Rule, event: Event | None) -> dict:
        run = self._record(rule, event, status="running")
        for cond in rule.conditions:
            ok, detail = self._check(cond)
            run["conditions"].append({"device_id": cond.device_id, "signal": cond.signal,
                                      "op": cond.op, "value": cond.value, "ok": ok, "detail": detail})
            if not ok:
                return self._finish(run, "skipped", f"условие не выполнено: {detail}")
        for action in rule.actions:
            if action.delay_s:
                await asyncio.sleep(action.delay_s)
            result = await self._perform(rule, action, run)
            run["actions"].append(result)
        failed = [a for a in run["actions"] if a["status"] == "error"]
        status = "partial" if failed and len(failed) < len(run["actions"]) else ("error" if failed else "ok")
        return self._finish(run, status)

    def _check(self, cond) -> tuple[bool, str]:
        try:
            managed = self.registry.get(cond.device_id)
        except KeyError:
            return False, f"устройство {cond.device_id} не найдено"
        if not managed.online:
            return False, f"{managed.title} недоступно"
        sig = managed.device.signals.get(cond.signal)
        if sig is None:
            return False, f"нет сигнала {cond.signal}"
        return compare(cond.op, sig.value, cond.value), f"{sig.title} = {sig.value}"

    async def _perform(self, rule: Rule, action, run: dict) -> dict:
        if isinstance(action, SetSignal):
            return await self._set_signal(rule, action)
        if isinstance(action, Notify):
            return self.notify(action.target, action.message, action.level, rule=rule)
        if isinstance(action, Dispatch):
            if self.dispatch_hook is None:
                return {"type": "dispatch", "status": "error", "detail": "автодиспетчер не подключён"}
            try:
                out = await self.dispatch_hook(rule, action, run)
                return {"type": "dispatch", "status": "ok", **out}
            except Exception as exc:  # noqa: BLE001 — ошибка подрядчика не должна ронять правило
                return {"type": "dispatch", "status": "error", "detail": str(exc)}
        return {"type": getattr(action, "type", "?"), "status": "error", "detail": "unknown action"}

    async def _set_signal(self, rule: Rule, a: SetSignal) -> dict:
        base = {"type": "set_signal", "device_id": a.device_id, "signal": a.signal, "value": a.value}
        key = (a.device_id, a.signal)
        held = self._writes.get(key)
        if held and held[0] != rule.id and held[1] > rule.priority \
                and time.time() - held[2] < CONFLICT_WINDOW:
            owner = self.store.rules.get(held[0])
            return {**base, "status": "conflict",
                    "detail": f"приоритет у правила «{owner.title if owner else held[0]}»"}
        last_error = ""
        for attempt in range(1, RETRIES + 1):
            try:
                self.registry.command(a.device_id, a.signal, a.value)
                self._writes[key] = (rule.id, rule.priority, time.time())
                return {**base, "status": "ok", "attempts": attempt}
            except DeviceUnavailable as exc:
                last_error = str(exc)
                self.bus.emit("rule", a.device_id, rule_id=rule.id, phase="retry",
                              message=f"«{rule.title}»: {exc}, попытка {attempt}/{RETRIES}")
                await asyncio.sleep(self.retry_pause * attempt)
            except (KeyError, PermissionError) as exc:
                return {**base, "status": "error", "detail": str(exc), "attempts": attempt}
        return {**base, "status": "error", "detail": last_error, "attempts": RETRIES}

    # ---------- уведомления ----------

    def notify(self, target: str, message: str, level: str = "info", rule: Rule | None = None,
               extra: dict | None = None) -> dict:
        note = {"id": uuid.uuid4().hex[:8], "ts": time.time(), "target": target, "level": level,
                "message": message, "rule_id": rule.id if rule else None,
                "rule_title": rule.title if rule else None, **(extra or {})}
        self.notifications.append(note)
        self.bus.emit("notify", None, **note)
        return {"type": "notify", "status": "ok", "target": target, "message": message}

    # ---------- служебное ----------

    def _throttled(self, rule: Rule) -> str:
        now = time.time()
        last = self._last_fire.get(rule.id, 0)
        if now - last < rule.cooldown_s:
            return f"cooldown {rule.cooldown_s:g} с"
        window = self._fires.setdefault(rule.id, deque())
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= MAX_FIRES_PER_MIN:
            return "лимит срабатываний в минуту, похоже на цикл"
        window.append(now)
        self._last_fire[rule.id] = now
        return ""

    def _record(self, rule: Rule, event: Event | None, status: str, reason: str = "") -> dict:
        run = {"id": uuid.uuid4().hex[:8], "rule_id": rule.id, "rule_title": rule.title,
               "ts": time.time(), "status": status, "reason": reason,
               "trigger": event.to_dict() if event else None, "conditions": [], "actions": []}
        self.runs.append(run)
        self.bus.emit("rule", rule.trigger.device_id, rule_id=rule.id, phase=status,
                      run_id=run["id"], message=_run_message(run))
        return run

    def _finish(self, run: dict, status: str, reason: str = "") -> dict:
        run["status"] = status
        run["reason"] = reason
        run["duration_ms"] = int((time.time() - run["ts"]) * 1000)
        self.bus.emit("rule", None, rule_id=run["rule_id"], phase=status, run_id=run["id"],
                      message=_run_message(run), actions=run["actions"])
        return run


def _run_message(run: dict) -> str:
    title = f"«{run['rule_title']}»"
    s = run["status"]
    if s == "running":
        return f"{title}: сработало"
    if s == "skipped":
        return f"{title}: пропущено ({run['reason']})"
    done = sum(1 for a in run["actions"] if a["status"] == "ok")
    total = len(run["actions"])
    word = {"ok": "выполнено", "partial": "выполнено частично", "error": "ошибка"}.get(s, s)
    return f"{title}: {word}, действий {done}/{total}"

