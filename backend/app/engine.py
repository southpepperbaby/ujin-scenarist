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
from datetime import datetime

from .rules import Dispatch, Notify, Rule, RuleStore, SetSignal, TimeCondition, compare

RETRIES = 3
RETRY_PAUSE = 1.0
CONFLICT_WINDOW = 10.0
MAX_FIRES_PER_MIN = 20

DispatchHook = Callable[[Rule, Dispatch, dict], Awaitable[dict]]


class Engine:
    def __init__(self, registry: DeviceRegistry, bus: EventBus, store: RuleStore,
                 dispatch_hook: DispatchHook | None = None, retry_pause: float = RETRY_PAUSE,
                 time_scale: float = 1.0):
        self.registry = registry
        self.bus = bus
        self.store = store
        self.dispatch_hook = dispatch_hook
        self.retry_pause = retry_pause
        self.time_scale = time_scale          # прогон в песочнице ускоряет задержки действий
        self.clock = lambda: datetime.now().strftime("%H:%M")   # прогон подменяет «который час»
        self.runs: deque[dict] = deque(maxlen=300)
        self.notifications: deque[dict] = deque(maxlen=300)
        self.journal_version = 0               # растёт при каждой записи: снимок пишется только если есть новое
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
        # Важное правило первым: оно занимает сигнал, а менее важное получает конфликт и видит его в отчёте,
        # вместо того чтобы молча выполниться и тут же быть перезаписанным.
        for rule in sorted(self.store.enabled(), key=lambda r: -r.priority):
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
            task = asyncio.create_task(self.execute(rule, event), name=f"rule:{rule.id}")
            self._tasks.add(task)
            task.add_done_callback(self._forget)
            started.append(task)
        return started

    def _forget(self, task: asyncio.Task) -> None:
        """Снять задачу с учёта и забрать исключение: иначе сбой правила теряется в логе asyncio."""
        self._tasks.discard(task)
        if task.cancelled():
            return
        exc = task.exception()
        if exc is not None:
            self.bus.emit("rule", None, phase="error", message=f"Исполнение правила прервалось: {exc}")

    async def idle(self) -> None:
        """Дождаться всех запущенных исполнений (тесты и прогон в песочнице)."""
        while self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)

    # ---------- исполнение правила ----------

    async def execute(self, rule: Rule, event: Event | None) -> dict:
        run = self._record(rule, event, status="running")
        for cond in rule.conditions:
            ok, detail = self._check(cond)
            run["conditions"].append({**cond.model_dump(mode="json"), "ok": ok, "detail": detail})
            if not ok:
                return self._finish(run, "skipped", f"условие не выполнено: {detail}")
        for action in rule.actions:
            if action.delay_s:
                await asyncio.sleep(action.delay_s / self.time_scale)
            failed = [a for a in run["actions"] if a["status"] in ("error", "conflict")]
            if failed and isinstance(action, Notify):
                # Уведомление не должно утверждать то, что не произошло: дописываем, что сорвалось.
                lost = "; ".join(f"{self.registry.title(a['device_id'])}: {a.get('detail', a['status'])}"
                                 for a in failed if a.get("device_id"))
                action = action.model_copy(update={
                    "level": "critical",
                    "message": f"{action.message} ВНИМАНИЕ: не выполнено автоматически ({lost}), нужна проверка."})
            result = await self._perform(rule, action, run)
            run["actions"].append(result)
        # Конфликт приоритетов тоже провал: действие не выполнено, хоть и по уважительной причине.
        failed = [a for a in run["actions"] if a["status"] in ("error", "conflict")]
        status = "partial" if failed and len(failed) < len(run["actions"]) else ("error" if failed else "ok")
        return self._finish(run, status)

    def _check(self, cond) -> tuple[bool, str]:
        if isinstance(cond, TimeCondition):
            now = self.clock()
            return cond.contains(now), f"сейчас {now}, окно {cond.start}-{cond.end}"
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
        try:
            return await self._perform_one(rule, action, run)
        except Exception as exc:  # noqa: BLE001 — сбой одного действия не отменяет остальные
            self.bus.emit("rule", getattr(action, "device_id", None), rule_id=rule.id, phase="error",
                          message=f"«{rule.title}»: действие {getattr(action, 'type', '?')} сорвалось, {exc}")
            return {"type": getattr(action, "type", "?"), "status": "error",
                    "device_id": getattr(action, "device_id", None), "detail": str(exc) or exc.__class__.__name__}

    async def _perform_one(self, rule: Rule, action, run: dict) -> dict:
        if isinstance(action, SetSignal):
            return await self._set_signal(rule, action)
        if isinstance(action, Notify):
            return self.notify(action.target, action.message, action.level, rule=rule)
        if isinstance(action, Dispatch):
            if self.dispatch_hook is None:
                return {"type": "dispatch", "status": "error", "detail": "автодиспетчер не подключён"}
            out = await self.dispatch_hook(rule, action, run)
            return {"type": "dispatch", "status": "ok", **out}
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
                if attempt < RETRIES:          # после последней попытки ждать уже нечего
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
        self.journal_version += 1
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
        self.journal_version += 1
        self.bus.emit("rule", rule.trigger.device_id, rule_id=rule.id, phase=status,
                      run_id=run["id"], message=_run_message(run))
        return run

    def _finish(self, run: dict, status: str, reason: str = "") -> dict:
        run["status"] = status
        run["reason"] = reason
        run["duration_ms"] = int((time.time() - run["ts"]) * 1000)
        self.journal_version += 1
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

