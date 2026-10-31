"""Правила из текста: Jev определяет намерение, LLM собирает правило по схеме, линтер проверяет.

Цепочка «LLM пишет, Jev судит»:
1. Jev: это постоянное правило, разовая команда или вопрос о доме? Известная ошибка LLM в умном доме:
   «выключи свет» превращается в вечное правило. Разделяем это до генерации.
2. LLM получает обезличенный каталог устройств (dev_1, dev_2…) и возвращает JSON строго по схеме.
3. Ответ разворачивается обратно в реальные id и валидируется Pydantic-схемой правила. При ошибке
   схемы LLM получает текст ошибки и одну попытку исправиться.
4. Готовое правило проходит линтер и только потом показывается человеку как черновик.
"""
from __future__ import annotations

import json

from pydantic import ValidationError

from . import ai
from .emu import DeviceRegistry
from .linter import lint, summary
from .rules import OP_TITLES, Rule, SetSignal

INTENTS = {
    "rule": "Постоянное правило автоматизации: «когда случится X, делай Y», «если ночью…», «каждый раз когда…»",
    "command": "Разовая команда прямо сейчас: «выключи свет», «открой шлагбаум», «поставь 22 градуса»",
    "question": "Вопрос о состоянии дома: «есть ли протечка?», «какая температура в спальне?»",
}

SYSTEM = """Ты компилятор сценариев умного дома. Переводишь просьбу человека в JSON по схеме.
Используй ТОЛЬКО устройства и сигналы из каталога. Значения бери из layout или диапазона сигнала.
Для trigger и conditions подходят любые сигналы, для действий set_signal только сигналы с management rw или w.
Операторы op: eq, ne, gt, gte, lt, lte, changed.

Схема ответа (один JSON-объект, без пояснений вокруг):
{
  "title": "короткое название правила по-русски",
  "trigger": {"device": "dev_N", "signal": "имя", "op": "eq", "value": 1},
  "conditions": [{"device": "dev_N", "signal": "имя", "op": "eq", "value": 1},
                 {"type": "time", "start": "22:00", "end": "07:00"}],
  "actions": [
    {"type": "set_signal", "device": "dev_N", "signal": "имя", "value": 0, "delay_s": 0},
    {"type": "notify", "target": "resident" | "concierge", "level": "info" | "warning" | "critical", "message": "текст"},
    {"type": "dispatch", "category": null, "note": "что передать подрядчику"}
  ],
  "explanation": "одно предложение простым языком, что делает правило"
}
Для разовой команды верни тот же формат, но trigger: null, только actions.
Время суток задавай условием type=time (ночь 22:00-07:00, утро 07:00-10:00, день 10:00-18:00, вечер 18:00-22:00).
dispatch означает заявку подрядчику (сантехник, электрик и т.п.), используй его, если человек просит вызвать мастера.
Если просьбу нельзя выполнить имеющимися устройствами, верни {"error": "почему"}."""


def catalog(registry: DeviceRegistry, alias, role: str) -> list[dict]:
    """Каталог для LLM: псевдонимы вместо id, без серийников и привязок к стенду."""
    out = []
    for m in registry.devices.values():
        if role == "resident" and m.scope == "building":
            continue
        signals = []
        for s in m.device.signals.values():
            if s.kind == "system":
                continue
            row = {"name": s.name, "title": s.title, "management": s.management}
            if s.layout:
                row["layout"] = s.layout
            if s.minimum is not None:
                row["range"] = [s.minimum, s.maximum]
            if s.measure:
                row["measure"] = s.measure
            signals.append(row)
        out.append({"device": alias(m.id), "type": m.device.title, "title": m.title, "room": m.room,
                    "scope": "дом" if m.scope == "building" else "квартира", "signals": signals})
    return out


async def classify_intent(text: str) -> dict:
    try:
        a = await ai.jev({"сообщение жителя": text}, {
            "intent": {"type": "choice", "instructions": "Что хочет человек?", "criteria": INTENTS}})
        return {"intent": a["intent"]["choice"], "confidence": a["intent"]["confidence"], "source": "jev"}
    except ai.AIUnavailable:
        low = text.lower()
        intent = "rule" if any(w in low for w in ("если", "когда", "каждый", "всегда")) else "command"
        return {"intent": intent, "confidence": 0.5, "source": "keywords"}


async def compile_text(text: str, registry: DeviceRegistry, rules: list[Rule], role: str = "resident") -> dict:
    intent = await classify_intent(text)
    if intent["intent"] == "question":
        return {"intent": intent, "answer": answer_question(text, registry), "rule": None}

    p = ai.Pseudonymizer()
    cat = catalog(registry, p.alias, role)
    user = f"Каталог устройств:\n{json.dumps(cat, ensure_ascii=False)}\n\nПросьба: {text}"
    if intent["intent"] == "command":
        user += "\n\nЭто разовая команда: trigger = null."

    last_error = ""
    for attempt in range(2):
        prompt = user if not last_error else f"{user}\n\nПрошлый ответ не прошёл проверку: {last_error}. Исправь."
        raw = await ai.llm_json(SYSTEM, prompt)
        if "error" in raw and not raw.get("actions"):
            return {"intent": intent, "rule": None, "error": raw["error"]}
        try:
            rule = _to_rule(raw, p, role, intent["intent"], text)
        except (ValidationError, KeyError, TypeError, ValueError) as exc:
            last_error = str(exc)[:500]
            continue
        check = summary(lint(rule, rules, registry)) if rule.trigger.device_id != "__now__" else {"ok": True,
                                                                                                    "issues": []}
        return {"intent": intent, "rule": rule.model_dump(mode="json"), "lint": check,
                "explanation": raw.get("explanation") or explain(rule, registry), "attempts": attempt + 1}
    return {"intent": intent, "rule": None, "error": f"модель не смогла собрать правило по схеме: {last_error}"}


def _to_rule(raw: dict, p: ai.Pseudonymizer, role: str, intent: str, text: str) -> Rule:
    def ref(d: dict) -> dict:
        return {"device_id": p.real(d["device"]), "signal": d["signal"], "op": d.get("op", "eq"),
                "value": d.get("value")}

    actions = []
    for a in raw.get("actions") or []:
        a = dict(a)
        if "device" in a:
            a["device_id"] = p.real(a.pop("device"))
        actions.append(a)
    trig = raw.get("trigger")
    if intent == "command" or not trig:
        trigger = {"device_id": "__now__", "signal": "__now__", "op": "eq", "value": 1}
    else:
        trigger = ref(trig)
    return Rule.model_validate({
        "title": raw.get("title") or text[:60],
        "description": f"Создано из текста: «{text}»",
        "owner": "uk" if role == "uk" else "resident",
        "scope": "building" if role == "uk" else "apartment",
        "priority": 100 if role == "uk" else 50,
        "enabled": False, "status": "draft",
        "trigger": trigger,
        "conditions": [c if c.get("type") == "time" else ref(c) for c in raw.get("conditions") or []],
        "actions": actions,
    })


def explain(rule: Rule, registry: DeviceRegistry) -> str:
    """Объяснение правила простым языком без LLM: детерминированно и бесплатно."""
    def dev(i):
        m = registry.devices.get(i)
        return m.title if m else i

    def sig_title(i, s):
        m = registry.devices.get(i)
        sig = m.device.signals.get(s) if m else None
        return sig.title.lower() if sig else s

    def val(i, s, v):
        m = registry.devices.get(i)
        sig = m.device.signals.get(s) if m else None
        if sig and sig.layout:
            return sig.layout.get(v, sig.layout.get(str(v), str(v)))
        return f"{v}{' ' + sig.measure if sig and sig.measure else ''}"

    t = rule.trigger
    if t.device_id == "__now__":
        head = "Сейчас"
    elif t.op == "changed":
        head = f"Когда у «{dev(t.device_id)}» меняется {sig_title(t.device_id, t.signal)}"
    else:
        head = (f"Когда у «{dev(t.device_id)}» {sig_title(t.device_id, t.signal)} "
                f"{'становится' if t.op == 'eq' else OP_TITLES[t.op]} {val(t.device_id, t.signal, t.value)}")
    conds = [f"время с {c.start} до {c.end}" if c.type == "time" else
             f"{sig_title(c.device_id, c.signal)} у «{dev(c.device_id)}» {OP_TITLES[c.op]} "
             f"{val(c.device_id, c.signal, c.value)}" for c in rule.conditions]
    acts = []
    for a in rule.actions:
        if isinstance(a, SetSignal):
            acts.append(f"«{dev(a.device_id)}»: {sig_title(a.device_id, a.signal)} → {val(a.device_id, a.signal, a.value)}")
        elif a.type == "notify":
            acts.append("сообщить консьержу" if a.target == "concierge" else "уведомить жителя")
        else:
            acts.append("вызвать подрядчика через автодиспетчер")
    text = head + (", и при этом " + ", ".join(conds) if conds else "")
    return f"{text}: {', '.join(acts)}."


def answer_question(text: str, registry: DeviceRegistry) -> str:
    """Короткая сводка состояния дома: на вопрос отвечаем данными, а не фантазией модели."""
    from .dispatcher import FAULTS
    alarms = [title for m in registry.devices.values()
              for s, bad, title in FAULTS.get(m.family, []) if m.state().get(s) == bad]
    offline = [m.title for m in registry.devices.values() if not m.online]
    parts = ["Аварий нет." if not alarms else "Сейчас: " + ", ".join(alarms) + "."]
    if offline:
        parts.append("Без связи: " + ", ".join(offline) + ".")
    for m in registry.devices.values():
        if m.family == "thermostat":
            parts.append(f"{m.room}: {m.state().get('temperature')} °C.")
    return " ".join(parts)


async def execute_now(rule: Rule, engine) -> dict:
    """Разовая команда: выполняем действия сразу через движок (с повторами и журналом)."""
    return await engine.execute(rule, None)
