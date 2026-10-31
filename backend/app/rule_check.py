"""Проверка правила для человека: прогон на копии дома, итог в две-три строки простым языком.

Запускается сама при «Да, подтвердить». Реальные устройства не трогаются: прогон идёт на клоне реестра
(simulate), заявки в нём не отправляются. Два сценария:
1. Обычный: срабатывает триггер, правило выполняет действия. Не прошёл: правило остаётся черновиком.
2. Первое управляемое устройство без связи: что узнает человек о сбое. Это предупреждение, а не провал:
   устройство может отвалиться в жизни, важно, чтобы об этом сказали.
"""
from __future__ import annotations

from .emu import DeviceRegistry
from .rules import Rule, SetSignal
from .simulate import simulate

WHO = {"concierge": "консьерж", "resident": "вы"}


async def check_rule(rule: Rule, registry: DeviceRegistry, rules: list[Rule]) -> dict:
    report = await simulate(rule, registry, rules)
    lines = [_main_line(rule, report, registry)]
    first = next((a for a in rule.actions if isinstance(a, SetSignal)), None)
    if report["passed"] and first and first.device_id != rule.trigger.device_id:
        offline = await simulate(rule, registry, rules, offline=[first.device_id])
        lines.append(_offline_line(rule, offline, registry, first.device_id))
    return {"passed": report["passed"], "lines": lines}


def _main_line(rule: Rule, report: dict, registry: DeviceRegistry) -> dict:
    target = [r for r in report["runs"] if r["rule_id"] == rule.id]
    t = rule.trigger
    sig = registry.signal(t.device_id, t.signal)
    cause = f"«{registry.title(t.device_id)}»: {sig.title.lower() if sig else t.signal}"
    if not target:
        return {"kind": "fail", "text": f"Не сработает: на событие {cause} правило не запустилось."}
    run = target[-1]
    if run["status"] == "skipped":
        return {"kind": "fail", "text": f"Не сработает: {run['reason']}."}
    bad = [a for a in run["actions"] if a["status"] != "ok"]
    if bad:
        why = "; ".join(_action_problem(a, registry) for a in bad)
        return {"kind": "fail", "text": f"Не сработает: {why}. Правило осталось черновиком."}
    steps = " → ".join(_action_done(a, registry) for a in run["actions"])
    return {"kind": "ok", "text": f"Проверили на копии вашего дома: {cause} → {steps}."}


def _offline_line(rule: Rule, report: dict, registry: DeviceRegistry, device_id: str) -> dict:
    title = registry.title(device_id)
    run = next((r for r in reversed(report["runs"]) if r["rule_id"] == rule.id), None)
    targets = {a.get("target") for a in (run or {}).get("actions", []) if a["type"] == "notify" and a["status"] == "ok"}
    told = [WHO[t] for t in ("concierge", "resident") if t in targets]
    if told:
        who = " и ".join(told)
        verb = "узнает" if told == ["консьерж"] else "узнаете"
        return {"kind": "warn", "text": f"Если «{title}» будет без связи: команда не пройдёт, но {who} {verb} о сбое."}
    return {"kind": "warn", "text": f"Если «{title}» будет без связи: команда не пройдёт, и никто не узнает. "
                                    f"Стоит добавить уведомление."}


def _action_done(a: dict, registry: DeviceRegistry) -> str:
    if a["type"] == "set_signal":
        sig = registry.signal(a["device_id"], a["signal"])
        name = sig.title.lower() if sig else a["signal"]
        return f"«{registry.title(a['device_id'])}»: {name} {registry.label(a['device_id'], a['signal'], a['value'])}"
    if a["type"] == "notify":
        return "вы получили уведомление" if a.get("target") == "resident" else "консьерж получил уведомление"
    return "заявка мастеру готова"


def _action_problem(a: dict, registry: DeviceRegistry) -> str:
    where = f"«{registry.title(a['device_id'])}»" if a.get("device_id") else "действие"
    if a["status"] == "conflict":
        return f"{where} уже занят: {a.get('detail', 'другое правило важнее')}"
    return f"{where}: {a.get('detail') or 'ошибка'}"
