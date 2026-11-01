"""Прогон правила до включения: копия дома в песочнице, ускоренное время, отчёт по шагам.

Живые устройства не трогаем. Создаём новый реестр с теми же устройствами и текущими значениями,
подаём «физическое» воздействие, которое вызывает триггер, и тикаем N раз без реального ожидания.
Можно выключить связь с устройствами, чтобы проверить поведение при сбое.
"""
from __future__ import annotations

import time

from .bus import EventBus
from .emu import INPUTS, DeviceRegistry
from .engine import Engine
from .rules import Rule, RuleStore, Trigger

class NoStimulus(ValueError):
    """Правило нечем запустить: устройства или сигнала из блока «когда» в доме нет."""


# Как физически вызвать триггер: (семейство, сигнал) → (вход, значение).
STIMULI = {
    ("leak", "leak"): ("wet", True),
    ("fire", "alarm"): ("smoke", 95),
    ("fire", "smoke"): ("smoke", 95),
    ("barrier", "obstacle"): ("obstacle", True),
    ("thermostat", "fault"): ("fault", True),
    ("valve", "jammed"): ("jam", True),
}


def clone_registry(live: DeviceRegistry) -> tuple[EventBus, DeviceRegistry]:
    bus = EventBus(history=5000)
    reg = DeviceRegistry(bus)
    for m in live.devices.values():
        copy = reg.create(m.family, title=m.title, room=m.room, scope=m.scope, device_id=m.id, **m.params)
        for name, sig in m.device.signals.items():
            copy.device.signals[name].value = sig.value
        copy.online = m.online
    bus.history.clear()
    return bus, reg


async def simulate(rule: Rule, live: DeviceRegistry, rules: list[Rule], ticks: int = 15,
                   offline: list[str] | None = None, with_others: bool = True, at: str | None = None,
                   event: Trigger | None = None, preset: list[tuple[str, str, object]] | None = None) -> dict:
    bus, reg = clone_registry(live)
    store = RuleStore()
    store.put(rule.model_copy(update={"enabled": True}))
    if with_others:
        for r in rules:
            if r.enabled and r.id != rule.id:
                store.put(r)

    async def fake_dispatch(r, action, run):
        return {"detail": "в прогоне заявка не отправляется: автодиспетчер выбрал бы подрядчика по категории "
                          + (action.category or "из вердикта ИИ")}

    engine = Engine(reg, bus, store, dispatch_hook=fake_dispatch, retry_pause=0, time_scale=1000)
    windows = [c for c in rule.conditions if c.type == "time"]
    sim_time = at or (windows[0].inside() if windows else None)
    if sim_time:
        engine.clock = lambda: sim_time
    for device_id, signal, value in preset or []:
        if device_id in reg.devices:
            reg.get(device_id).device.signals[signal].value = value
    for device_id in offline or []:
        if device_id in reg.devices:
            reg.set_online(device_id, False)
    initial = {d: m.state() for d, m in reg.devices.items()}

    started = time.time()
    stimulus = _stimulate(event or rule.trigger, reg)
    timeline: list[dict] = []
    cursor = 0
    for tick in range(ticks + 1):
        if tick:
            reg.step_all(1)
        # Разбираем события, пока движок порождает новые: цепочки правил отрабатывают в пределах тика.
        while cursor < len(bus.history):
            batch = list(bus.history)[cursor:]
            cursor += len(batch)
            for e in batch:
                if e.kind == "signal":
                    engine.on_signal(e)
                if _interesting(e):
                    timeline.append({"t": tick, **e.to_dict()})
            await engine.idle()

    runs = [r for r in engine.runs if r["status"] != "running"]
    target = [r for r in runs if r["rule_id"] == rule.id]
    touched = {a.device_id for a in rule.actions if getattr(a, "device_id", None)}
    final = {d: {k: v for k, v in reg.get(d).state().items() if k != "fw"} for d in touched if d in reg.devices}
    passed = bool(target) and all(r["status"] == "ok" for r in target)
    return {
        "rule_id": rule.id,
        "stimulus": stimulus,
        "ticks": ticks,
        "offline": offline or [],
        "sim_time": sim_time,
        "passed": passed,
        "verdict": _verdict(target, stimulus),
        "runs": runs,
        "notifications": list(engine.notifications),
        "final_state": final,
        "initial": initial,
        "state": {d: m.state() for d, m in reg.devices.items()},
        "timeline": timeline,
        "elapsed_ms": int((time.time() - started) * 1000),
    }


def _stimulate(t: Trigger, reg: DeviceRegistry) -> dict:
    if t.device_id not in reg.devices:
        # Разовая команда (device_id == NOW) и правило по удалённому устройству: прогонять нечего.
        raise NoStimulus(f"прогон невозможен: в блоке «когда» нет устройства {t.device_id}")
    managed = reg.get(t.device_id)
    if t.signal not in managed.device.signals:
        raise NoStimulus(f"прогон невозможен: у «{managed.title}» нет сигнала {t.signal}")
    hit = STIMULI.get((managed.family, t.signal))
    if hit and hit[0] in INPUTS.get(managed.family, {}):
        reg.inject(t.device_id, hit[0], hit[1])
        return {"kind": "inject", "device_id": t.device_id, "input": hit[0], "value": hit[1],
                "title": f"{managed.title}: физическое воздействие «{hit[0]}»"}
    value = t.value
    if t.op in ("gt", "gte"):
        value = (t.value or 0) + 1
    elif t.op in ("lt", "lte"):
        value = (t.value or 0) - 1
    elif t.op in ("ne", "changed"):
        current = managed.state().get(t.signal)
        value = (current or 0) + 1 if isinstance(current, (int, float)) else "x"
    reg.set_signal(t.device_id, t.signal, value)
    return {"kind": "signal", "device_id": t.device_id, "signal": t.signal, "value": value,
            "title": f"{managed.title}: сигнал {t.signal} = {value}"}


def _interesting(e) -> bool:
    if e.kind in ("rule", "notify", "device"):
        return True
    if e.kind == "signal":
        return e.data.get("signal") not in {"battery", "energy_kwh", "total", "kvh_t1", "kvh_t2", "humidity",
                                            "power_w", "cycles"}
    return False


def _verdict(target: list[dict], stimulus: dict) -> str:
    if not target:
        return f"Правило не сработало на воздействие «{stimulus['title']}». Проверьте событие в блоке «Когда»."
    last = target[-1]
    if last["status"] == "ok":
        return f"Правило сработало, все действия выполнены ({len(last['actions'])})."
    if last["status"] == "skipped":
        return f"Правило сработало, но пропущено: {last['reason']}."
    bad = [a for a in last["actions"] if a["status"] != "ok"]
    return "Правило сработало с проблемами: " + "; ".join(
        f"{a.get('device_id', a['type'])}: {a.get('detail', a['status'])}" for a in bad) + "."
