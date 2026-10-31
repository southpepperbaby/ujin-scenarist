"""Проверка правила для человека: прогон на копии дома, итог в две-три строки простым языком.

Запускается сама при «Да, подтвердить». Реальные устройства не трогаются: прогон идёт на клоне реестра
(simulate), заявки в нём не отправляются. Срабатывает триггер, правило выполняет действия; не прошло,
значит остаётся черновиком.

Отдельно предупреждаем, если о сбое устройства никто не узнает: в правиле есть команды, но нет
уведомления. «Команда не пройдёт без связи» верно для любого правила, поэтому эту строку не пишем, если
уведомление есть: движок сам допишет в него, что команда сорвалась.
"""
from __future__ import annotations

from .emu import DeviceRegistry
from .rules import Notify, Rule, SetSignal
from .simulate import simulate


async def check_rule(rule: Rule, registry: DeviceRegistry, rules: list[Rule]) -> dict:
    report = await simulate(rule, registry, rules)
    lines = [_main_line(rule, report, registry)]
    controlled = [a.device_id for a in rule.actions if isinstance(a, SetSignal)]
    if report["passed"] and controlled and not any(isinstance(a, Notify) for a in rule.actions):
        lines.append(_silent_failure_line(controlled, registry))
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


def _silent_failure_line(device_ids: list[str], registry: DeviceRegistry) -> dict:
    names = ", ".join(f"«{registry.title(d)}»" for d in dict.fromkeys(device_ids))
    return {"kind": "warn", "text": f"Если {names} не ответит, об этом никто не узнает: в правиле нет уведомления. "
                                    f"Допишите, например, «и сообщи мне»."}


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
