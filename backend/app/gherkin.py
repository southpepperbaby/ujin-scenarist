"""Gherkin на русском: правило → читаемый сценарий проверки → прогон шагов на эмуляторах.

Тот же формат, что у приёмки организаторов (`behave quality/features`): «Допустим → Когда → Тогда».
Сценарий генерируется из правила по шаблону (детерминированно, без LLM), человек может его править,
исполнитель разбирает шаги и прогоняет их в песочнице. Каждый шаг получает статус: пройден, упал
или не распознан. Правило без пройденного сценария можно считать непроверенным.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .emu import DeviceRegistry
from .rules import Notify, Rule, SetSignal, TimeCondition, Trigger
from .simulate import simulate

KEYWORDS = r"(Допустим|Дано|Пусть|Когда|Если|Тогда|То|И|Но|А также|К тому же)"


# ---------- генерация ----------

def to_feature(rule: Rule, registry: DeviceRegistry) -> str:
    g = _Namer(registry)
    lines = ["# language: ru", f"Функция: {rule.title}"]
    if rule.description:
        lines.append(f"  {rule.description}")
    lines.append("")
    lines += _scenario("Правило срабатывает", rule, g, offline=None)
    first_set = next((a for a in rule.actions if isinstance(a, SetSignal)), None)
    if first_set:
        lines.append("")
        lines += _scenario("Устройство без связи", rule, g, offline=first_set)
    return "\n".join(lines) + "\n"


def _scenario(name: str, rule: Rule, g: "_Namer", offline: SetSignal | None) -> list[str]:
    out = [f"  Сценарий: {name}"]
    givens = []
    for c in rule.conditions:
        if isinstance(c, TimeCondition):
            givens.append(f"сейчас {c.inside()}")
        elif c.op == "eq":
            givens.append(f"у «{g.dev(c.device_id)}» «{g.sig(c.device_id, c.signal)}» = «{g.val(c.device_id, c.signal, c.value)}»")
    if offline:
        givens.append(f"«{g.dev(offline.device_id)}» без связи")
    for i, step in enumerate(givens):
        out.append(f"    {'Допустим' if i == 0 else 'И'} {step}")
    t = rule.trigger
    out.append(f"    Когда у «{g.dev(t.device_id)}» «{g.sig(t.device_id, t.signal)}» становится «{g.val(t.device_id, t.signal, _fire_value(t))}»")
    out.append(f"    Тогда правило «{rule.title}» выполнено" + (" с ошибкой" if offline else ""))
    for a in rule.actions:
        if isinstance(a, SetSignal):
            if offline and a.device_id == offline.device_id:
                out.append(f"    И «{g.dev(a.device_id)}» не получил команду «{g.sig(a.device_id, a.signal)}»")
            else:
                out.append(f"    И «{g.dev(a.device_id)}» получил команду «{g.sig(a.device_id, a.signal)}» = "
                           f"«{g.val(a.device_id, a.signal, a.value)}»")
        elif isinstance(a, Notify):
            who = 'консьерж' if a.target == 'concierge' else 'житель'
            out.append(f"    И {who} получает уведомление" + (" о сбое" if offline else ""))
        else:
            out.append("    И подрядчику готовится заявка")
    return out


def _fire_value(t: Trigger):
    if t.op == "eq":
        return t.value
    if t.op in ("gt", "gte"):
        return (t.value or 0) + 1
    if t.op in ("lt", "lte"):
        return (t.value or 0) - 1
    return t.value


class _Namer:
    """Перевод id и значений в человеческие названия и обратно."""

    def __init__(self, registry: DeviceRegistry):
        self.registry = registry

    def dev(self, device_id: str) -> str:
        return self.registry.title(device_id)

    def sig(self, device_id: str, signal: str) -> str:
        s = self.registry.signal(device_id, signal)
        return s.title if s else signal

    def val(self, device_id: str, signal: str, value) -> str:
        return self.registry.label(device_id, signal, value)

    def find_device(self, title: str):
        title = title.strip().lower()
        return next((m for m in self.registry.devices.values() if m.title.lower() == title), None)

    def find_signal(self, m, title: str):
        title = title.strip().lower()
        return next((s for s in m.device.signals.values() if s.title.lower() == title or s.name == title), None)

    def parse_value(self, sig, text: str):
        if sig.layout:
            for k, label in sig.layout.items():
                if label.lower() == text.strip().lower() or str(k) == text.strip():
                    return int(k) if str(k).lstrip("-").isdigit() else k
        try:
            return float(text) if "." in text else int(text)
        except ValueError:
            return text


# ---------- разбор и прогон ----------

@dataclass
class Step:
    keyword: str
    text: str
    line: int
    kind: str = ""                 # given / when / then
    status: str = "undefined"      # passed / failed / undefined / skipped
    detail: str = ""
    data: dict = field(default_factory=dict)


@dataclass
class Scenario:
    name: str
    line: int
    steps: list[Step] = field(default_factory=list)


def parse(text: str) -> tuple[str, list[Scenario]]:
    feature, scenarios, current, last_kind = "", [], None, "given"
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("Функция:"):
            feature = line.split(":", 1)[1].strip()
            continue
        if line.startswith(("Сценарий:", "Пример:")):
            current = Scenario(line.split(":", 1)[1].strip(), n)
            scenarios.append(current)
            last_kind = "given"
            continue
        m = re.match(KEYWORDS + r"\s+(.*)", line)
        if m and current is not None:
            kw, body = m.group(1), m.group(2)
            kind = {"Допустим": "given", "Дано": "given", "Пусть": "given", "Когда": "when", "Если": "when",
                    "Тогда": "then", "То": "then"}.get(kw, last_kind)
            last_kind = kind
            current.steps.append(Step(kw, body, n, kind))
    return feature, scenarios


Q = r"«([^»]+)»"


async def run_feature(text: str, rule: Rule, registry: DeviceRegistry, rules: list[Rule]) -> dict:
    g = _Namer(registry)
    feature, scenarios = parse(text)
    results = []
    for sc in scenarios:
        results.append(await _run_scenario(sc, rule, registry, rules, g))
    passed = all(r["passed"] for r in results) and bool(results)
    return {"feature": feature, "passed": passed, "scenarios": results,
            "summary": f"сценариев {sum(r['passed'] for r in results)}/{len(results)} пройдено"}


async def _run_scenario(sc: Scenario, rule: Rule, registry, rules, g: _Namer) -> dict:
    at, offline, preset, event = None, [], [], None
    for st in sc.steps:
        if st.kind == "given":
            _bind_given(st, g, registry)
            if st.status == "passed":
                at = st.data.get("at", at)
                offline += st.data.get("offline", [])
                preset += st.data.get("preset", [])
        elif st.kind == "when":
            _bind_when(st, g)
            if st.status == "passed":
                event = st.data["event"]
    if event is None:
        for st in sc.steps:
            if st.kind == "then":
                st.status, st.detail = "skipped", "нет шага «Когда», нечего проверять"
        return _scenario_result(sc)

    report = await simulate(rule, registry, rules, ticks=12, offline=offline, at=at, event=event, preset=preset)
    for st in sc.steps:
        if st.kind == "then":
            _check_then(st, g, rule, report)
    out = _scenario_result(sc)
    out["verdict"] = report["verdict"]
    return out


def _bind_given(st: Step, g: _Namer, registry) -> None:
    if m := re.fullmatch(r"сейчас (\d{2}:\d{2})", st.text):
        st.status, st.data = "passed", {"at": m.group(1)}
        return
    if m := re.fullmatch(Q + r" без связи", st.text):
        d = g.find_device(m.group(1))
        if d:
            st.status, st.data = "passed", {"offline": [d.id]}
            return
        st.status, st.detail = "failed", f"нет устройства «{m.group(1)}»"
        return
    if m := re.fullmatch(r"у " + Q + r" " + Q + r" = " + Q, st.text):
        d = g.find_device(m.group(1))
        s = g.find_signal(d, m.group(2)) if d else None
        if d and s:
            st.status, st.data = "passed", {"preset": [(d.id, s.name, g.parse_value(s, m.group(3)))]}
            return
        st.status, st.detail = "failed", "устройство или сигнал не найдены"
        return
    st.detail = "шаг не распознан"


def _bind_when(st: Step, g: _Namer) -> None:
    if m := re.fullmatch(r"у " + Q + r" " + Q + r" становится " + Q, st.text):
        d = g.find_device(m.group(1))
        s = g.find_signal(d, m.group(2)) if d else None
        if d and s:
            st.status = "passed"
            st.data = {"event": Trigger(device_id=d.id, signal=s.name, op="eq", value=g.parse_value(s, m.group(3)))}
            return
        st.status, st.detail = "failed", "устройство или сигнал не найдены"
        return
    st.detail = "шаг не распознан"


def _check_then(st: Step, g: _Namer, rule: Rule, report: dict) -> None:
    runs = [r for r in report["runs"] if r["rule_id"] == rule.id]
    if m := re.fullmatch(r"правило " + Q + r" выполнено( с ошибкой)?", st.text):
        if not runs:
            st.status, st.detail = "failed", "правило не сработало"
            return
        want_error = bool(m.group(2))
        status = runs[-1]["status"]
        ok = status in ("partial", "error") if want_error else status == "ok"
        st.status, st.detail = ("passed" if ok else "failed"), f"статус прогона: {status}"
        return
    if m := re.fullmatch(r"у " + Q + r" " + Q + r" (?:= " + Q + r"|не изменилось)", st.text):
        d = g.find_device(m.group(1))
        s = g.find_signal(d, m.group(2)) if d else None
        if not (d and s):
            st.status, st.detail = "failed", "устройство или сигнал не найдены"
            return
        actual = report["state"][d.id].get(s.name)
        if m.group(3) is None:
            before = report["initial"][d.id].get(s.name)
            ok = actual == before
            st.detail = f"было {g.val(d.id, s.name, before)}, стало {g.val(d.id, s.name, actual)}"
        else:
            want = g.parse_value(s, m.group(3))
            ok = str(actual) == str(want)
            st.detail = f"фактически {g.val(d.id, s.name, actual)}"
        st.status = "passed" if ok else "failed"
        return
    if m := re.fullmatch(Q + r" (не )?получил команду " + Q + r"(?: = " + Q + r")?", st.text):
        d = g.find_device(m.group(1))
        s = g.find_signal(d, m.group(3)) if d else None
        if not (d and s):
            st.status, st.detail = "failed", "устройство или сигнал не найдены"
            return
        sent = [a for r in runs for a in r["actions"]
                if a["type"] == "set_signal" and a["device_id"] == d.id and a["signal"] == s.name]
        delivered = [a for a in sent if a["status"] == "ok"]
        if m.group(2):
            ok = not delivered
            st.detail = sent[-1].get("detail", "") if sent else "команда не отправлялась"
        else:
            want = g.parse_value(s, m.group(4)) if m.group(4) else None
            ok = any(want is None or str(a["value"]) == str(want) for a in delivered)
            st.detail = (f"доставлено с попытки {delivered[-1].get('attempts', 1)}" if delivered
                         else (sent[-1].get("detail", "не доставлено") if sent else "команды не было"))
        st.status = "passed" if ok else "failed"
        return
    if m := re.fullmatch(r"(консьерж|житель) получает уведомление( о сбое)?", st.text):
        target = "concierge" if m.group(1) == "консьерж" else "resident"
        hit = [n for n in report["notifications"] if n["target"] == target
               and (not m.group(2) or "не выполнено" in n["message"])]
        st.status = "passed" if hit else "failed"
        st.detail = hit[-1]["message"] if hit else "уведомлений нет"
        return
    if st.text == "подрядчику готовится заявка":
        ok = any(a["type"] == "dispatch" and a["status"] == "ok" for r in runs for a in r["actions"])
        st.status, st.detail = ("passed" if ok else "failed"), ("автодиспетчер получил запрос" if ok else "заявки нет")
        return
    st.detail = "шаг не распознан"


def _scenario_result(sc: Scenario) -> dict:
    steps = [{"keyword": s.keyword, "text": s.text, "line": s.line, "status": s.status, "detail": s.detail}
             for s in sc.steps]
    passed = all(s["status"] == "passed" for s in steps) and bool(steps)
    return {"name": sc.name, "passed": passed, "steps": steps}
