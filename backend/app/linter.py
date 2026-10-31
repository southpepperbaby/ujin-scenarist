"""Линтер правил: находит ошибки до включения, как проверка орфографии.

Проверки на одно правило (ссылки, диапазоны, права роли, недостижимые условия) и на набор правил
(циклы «А запускает Б, Б запускает А», конфликты за один сигнал).
"""
from __future__ import annotations

from typing import Any

from .emu import DeviceRegistry
from .rules import Rule, SetSignal, compare

ERROR, WARNING, INFO = "error", "warning", "info"
CRITICAL_SIGNALS = {("leak", "leak"), ("fire", "alarm"), ("elevator", "emergency")}


def issue(level: str, code: str, message: str, where: str = "") -> dict:
    return {"level": level, "code": code, "message": message, "where": where}


def lint(rule: Rule, rules: list[Rule], registry: DeviceRegistry) -> list[dict]:
    out: list[dict] = []
    out += _check_refs(rule, registry)
    if any(i["level"] == ERROR for i in out):
        return out                       # дальше нет смысла: правило ссылается на несуществующее
    out += _check_logic(rule, registry)
    others = [r for r in rules if r.id != rule.id and r.enabled]
    out += _check_cycles(rule, others)
    out += _check_conflicts(rule, others)
    return out


def summary(issues: list[dict]) -> dict:
    return {
        "ok": not any(i["level"] == ERROR for i in issues),
        "errors": sum(i["level"] == ERROR for i in issues),
        "warnings": sum(i["level"] == WARNING for i in issues),
        "issues": issues,
    }


# ---------- ссылки и значения ----------

def _signal(registry: DeviceRegistry, device_id: str, signal: str):
    managed = registry.devices.get(device_id)
    if managed is None:
        return None, None
    return managed, managed.device.signals.get(signal)


def _check_value(sig, value: Any, where: str) -> list[dict]:
    if sig.layout and str(value) not in {str(k) for k in sig.layout}:
        allowed = ", ".join(f"{k} ({v})" for k, v in sig.layout.items())
        return [issue(ERROR, "bad_value", f"«{sig.title}» не принимает {value}. Допустимо: {allowed}.", where)]
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if sig.minimum is not None and value < sig.minimum or sig.maximum is not None and value > sig.maximum:
            return [issue(ERROR, "out_of_range",
                          f"«{sig.title}»: {value} вне диапазона {sig.minimum}…{sig.maximum}.", where)]
    return []


def _check_refs(rule: Rule, registry: DeviceRegistry) -> list[dict]:
    out = []
    refs = [("когда", rule.trigger)] + [(f"если #{i + 1}", c) for i, c in enumerate(rule.conditions)
                                       if c.type == "signal"]
    for where, ref in refs:
        managed, sig = _signal(registry, ref.device_id, ref.signal)
        if managed is None:
            out.append(issue(ERROR, "unknown_device", f"Устройство {ref.device_id} не найдено.", where))
            continue
        if sig is None:
            out.append(issue(ERROR, "unknown_signal", f"У «{managed.title}» нет сигнала {ref.signal}.", where))
            continue
        if ref.op != "changed":
            out += _check_value(sig, ref.value, where)
        if sig.layout and ref.op in ("gt", "gte", "lt", "lte"):
            out.append(issue(WARNING, "order_on_list",
                             f"«{sig.title}» это список состояний, сравнение «больше/меньше» здесь странное.", where))
    for i, a in enumerate(rule.actions):
        if a.type == "notify" and a.target == "concierge" and rule.owner == "resident" and a.level != "critical":
            out.append(issue(ERROR, "uk_noise",
                             "Житель отправляет в УК только критичные сигналы. Сделайте уведомление "
                             "критичным или адресуйте его себе.", f"то #{i + 1}"))
        if not isinstance(a, SetSignal):
            continue
        where = f"то #{i + 1}"
        managed, sig = _signal(registry, a.device_id, a.signal)
        if managed is None:
            out.append(issue(ERROR, "unknown_device", f"Устройство {a.device_id} не найдено.", where))
            continue
        if sig is None:
            out.append(issue(ERROR, "unknown_signal", f"У «{managed.title}» нет сигнала {a.signal}.", where))
            continue
        if not sig.writable:
            out.append(issue(ERROR, "read_only",
                             f"«{sig.title}» у «{managed.title}» только измеряется, командой его не изменить.", where))
        out += _check_value(sig, a.value, where)
        if rule.owner == "resident" and managed.scope == "building":
            out.append(issue(ERROR, "permission",
                             f"Житель не может управлять общедомовым устройством «{managed.title}». "
                             f"Такое правило создаёт УК.", where))
        if not managed.online:
            out.append(issue(WARNING, "offline", f"«{managed.title}» сейчас без связи, команда будет повторяться.",
                             where))
    return out


# ---------- логика одного правила ----------

def _check_logic(rule: Rule, registry: DeviceRegistry) -> list[dict]:
    out = []
    t = rule.trigger
    for i, c in enumerate(rule.conditions):
        if c.type != "signal":
            if c.start == c.end:
                out.append(issue(ERROR, "empty_window", "Окно времени пустое: начало совпадает с концом.",
                                 f"если #{i + 1}"))
            continue
        if (c.device_id, c.signal) == (t.device_id, t.signal) and t.op == "eq" and c.op != "changed":
            if not compare(c.op, t.value, c.value):
                out.append(issue(ERROR, "unreachable",
                                 "Условие противоречит событию: в момент срабатывания этот сигнал "
                                 f"равен {t.value}, условие никогда не выполнится.", f"если #{i + 1}"))
    for i, a in enumerate(rule.actions):
        if isinstance(a, SetSignal) and (a.device_id, a.signal) == (t.device_id, t.signal):
            out.append(issue(WARNING, "self_loop", "Действие меняет тот же сигнал, что запускает правило.",
                             f"то #{i + 1}"))
    managed = registry.devices.get(t.device_id)
    if managed and (managed.family, t.signal) in CRITICAL_SIGNALS:
        kinds = {a.type for a in rule.actions}
        if "notify" not in kinds:
            out.append(issue(INFO, "no_notify", "Авария без уведомления: стоит сообщить жителю или консьержу."))
        if "dispatch" not in kinds:
            out.append(issue(INFO, "no_dispatch",
                             "Можно добавить заявку подрядчику: автодиспетчер сам выберет, кого вызвать."))
    if not rule.actions:
        out.append(issue(ERROR, "no_actions", "У правила нет действий."))
    return out


# ---------- набор правил ----------

def _writes(rule: Rule) -> set[tuple[str, str]]:
    return {(a.device_id, a.signal) for a in rule.actions if isinstance(a, SetSignal)}


def _check_cycles(rule: Rule, others: list[Rule]) -> list[dict]:
    """Граф: правило → правила, чей триггер оно задевает своими действиями. Ищем путь обратно к себе."""
    graph = {r.id: r for r in others + [rule]}

    def next_rules(r: Rule) -> list[Rule]:
        w = _writes(r)
        return [x for x in graph.values() if (x.trigger.device_id, x.trigger.signal) in w]

    stack = [(rule, [rule.title])]
    seen = set()
    while stack:
        cur, path = stack.pop()
        for nxt in next_rules(cur):
            if nxt.id == rule.id:
                chain = " → ".join(path + [rule.title])
                return [issue(ERROR if len(path) > 1 else WARNING, "cycle", f"Цикл правил: {chain}.")]
            if nxt.id not in seen:
                seen.add(nxt.id)
                stack.append((nxt, path + [nxt.title]))
    return []


def _check_conflicts(rule: Rule, others: list[Rule]) -> list[dict]:
    out = []
    mine = {(a.device_id, a.signal): a.value for a in rule.actions if isinstance(a, SetSignal)}
    for other in others:
        same_moment = (other.trigger.device_id, other.trigger.signal) == (rule.trigger.device_id, rule.trigger.signal)
        for a in other.actions:
            if not isinstance(a, SetSignal):
                continue
            key = (a.device_id, a.signal)
            if key in mine and str(mine[key]) != str(a.value):
                winner = rule if rule.priority > other.priority else other
                tie = rule.priority == other.priority
                when = "срабатывают на одно событие и " if same_moment else ""
                msg = (f"Конфликт с «{other.title}»: правила {when}выставляют {a.signal} = {mine[key]} и {a.value}. "
                       + ("Приоритеты равны, победит последнее, задайте приоритет."
                          if tie else f"Победит «{winner.title}» (приоритет {winner.priority})."))
                out.append(issue(WARNING if not tie else ERROR, "conflict", msg))
    return out
