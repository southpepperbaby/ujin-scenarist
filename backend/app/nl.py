"""Правила из текста: один вызов LLM определяет намерение и собирает правило, линтер проверяет.

Цепочка:
1. LLM отвечает, что это: постоянное правило, разовая команда или вопрос о доме. Известная ошибка
   в умном доме, когда «выключи свет» превращается в вечное правило, ловится карточкой пересказа:
   там видно «Сейчас один раз» или «Когда…». Отдельный вызов классификатора для этого не нужен.
2. LLM получает обезличенный каталог устройств (dev_1, dev_2…) и возвращает JSON строго по схеме.
3. Ответ разворачивается обратно в реальные id и валидируется Pydantic-схемой правила. При ошибке
   схемы LLM получает текст ошибки и одну попытку исправиться.
4. Готовое правило проходит линтер, показывается пересказом из JSON и ждёт «да, подтвердить».
5. На вопрос о доме отвечают данные (answer_question), а не модель.
"""
from __future__ import annotations

import json

from pydantic import ValidationError

from . import ai
from .dictionaries import CATEGORY_TITLES
from .emu import DeviceRegistry
from .linter import lint, summary
from .rules import NOW, OP_TITLES, Rule, SetSignal

SYSTEM = """Ты компилятор сценариев умного дома. Переводишь просьбу человека в JSON по схеме.
Используй ТОЛЬКО устройства и сигналы из каталога. Значения бери из layout или диапазона сигнала.
Для trigger и conditions подходят любые сигналы, для действий set_signal только сигналы с management rw или w.
Операторы op: eq, ne, gt, gte, lt, lte, changed.

Сначала определи intent:
- "rule": постоянное правило («когда случится X, делай Y», «если ночью…», «каждый раз когда…»);
- "command": разовая команда прямо сейчас («выключи свет», «открой шлагбаум»);
- "question": вопрос о состоянии дома («есть ли протечка?»). Для вопроса верни только {"intent": "question"}.

Схема ответа (один JSON-объект, без пояснений вокруг):
{
  "intent": "rule" | "command",
  "title": "короткое название правила по-русски",
  "trigger": {"device": "dev_N", "signal": "имя", "op": "eq", "value": 1},
  "conditions": [{"device": "dev_N", "signal": "имя", "op": "eq", "value": 1},
                 {"type": "time", "start": "22:00", "end": "07:00"}],
  "actions": [
    {"type": "set_signal", "device": "dev_N", "signal": "имя", "value": 0, "delay_s": 0},
    {"type": "notify", "target": "resident" | "concierge", "level": "info" | "warning" | "critical", "message": "текст"},
    {"type": "dispatch", "category": null, "device": "dev_N или null", "note": "что передать подрядчику"}
  ]
}
Для разовой команды верни тот же формат с intent "command" и trigger: null.
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


async def compile_text(text: str, registry: DeviceRegistry, rules: list[Rule], role: str = "resident",
                       previous: str | None = None) -> dict:
    """previous: прошлая просьба, если человек нажал «нет, дополнить» и дописал уточнение."""
    if previous:
        text = f"{previous}\nУточнение: {text}"
    p = ai.Pseudonymizer()
    cat = catalog(registry, p.alias, role)
    user = f"Каталог устройств:\n{json.dumps(cat, ensure_ascii=False)}\n\nПросьба: {text}"

    last_error = ""
    for attempt in range(2):
        prompt = user if not last_error else f"{user}\n\nПрошлый ответ не прошёл проверку: {last_error}. Исправь."
        raw = await ai.llm_json(SYSTEM, prompt)
        kind = raw.get("intent") if raw.get("intent") in ("rule", "command", "question") else (
            "rule" if raw.get("trigger") else "command")
        intent = {"intent": kind, "source": "llm"}
        if kind == "question":
            return {"intent": intent, "answer": answer_question(text, registry), "rule": None}
        if "error" in raw and not raw.get("actions"):
            return {"intent": intent, "rule": None, "error": raw["error"]}
        try:
            rule = _to_rule(raw, p, role, kind, text)
        except (ValidationError, KeyError, TypeError, ValueError) as exc:
            last_error = str(exc)[:500]
            continue
        check = summary(lint(rule, rules, registry)) if rule.trigger.device_id != NOW else {"ok": True,
                                                                                                    "issues": []}
        # Пересказ строится только из собранного правила: человек подтверждает то, что будет исполнено,
        # а не то, что модель думает о своём ответе. Объяснение от LLM не используется намеренно.
        return {"intent": intent, "text": text, "rule": rule.model_dump(mode="json"), "lint": check,
                "explanation": explain(rule, registry), "attempts": attempt + 1}
    return {"intent": {"intent": "rule", "source": "llm"}, "rule": None, "error": f"модель не смогла собрать правило по схеме: {last_error}"}


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
        trigger = {"device_id": NOW, "signal": NOW, "op": "eq", "value": 1}
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


LEVEL_WORDS = {"info": "", "warning": " (важно)", "critical": " (срочно)"}
TARGET_WORDS = {"resident": "уведомить жителя", "concierge": "сообщить консьержу"}


def explain(rule: Rule, registry: DeviceRegistry) -> str:
    """Пересказ правила простым языком без LLM: детерминированно, бесплатно и ровно то, что исполнит движок.

    Каждое поле правила, влияющее на исполнение, попадает в текст: триггер, все условия, все действия
    со значениями, задержки, текст уведомлений, категория заявки. Если чего-то нет в пересказе,
    этого нет и в правиле.
    """
    def dev(i):
        return registry.title(i, f"неизвестное устройство {i}")

    def sig_title(i, s):
        x = registry.signal(i, s)
        return x.title.lower() if x else s

    def val(i, s, v):
        x = registry.signal(i, s)
        if x and x.layout:
            return f"«{registry.label(i, s, v)}»"
        return f"{v}{' ' + x.measure if x and x.measure else ''}"

    def compare(ref, verb="становится") -> str:
        if ref.op == "changed":
            return f"{sig_title(ref.device_id, ref.signal)} у «{dev(ref.device_id)}» меняется"
        op = verb if ref.op == "eq" else OP_TITLES[ref.op]
        return f"{sig_title(ref.device_id, ref.signal)} у «{dev(ref.device_id)}» {op} " \
               f"{val(ref.device_id, ref.signal, ref.value)}"

    t = rule.trigger
    head = "Сейчас один раз" if t.device_id == NOW else f"Когда {compare(t)}"
    conds = [f"время с {c.start} до {c.end}" if c.type == "time" else compare(c, "равно") for c in rule.conditions]
    acts = []
    for a in rule.actions:
        if isinstance(a, SetSignal):
            act = f"«{dev(a.device_id)}»: {sig_title(a.device_id, a.signal)} → {val(a.device_id, a.signal, a.value)}"
        elif a.type == "notify":
            act = f"{TARGET_WORDS.get(a.target, a.target)}{LEVEL_WORDS.get(a.level, '')}: «{a.message}»"
        else:
            who = f"подрядчика «{CATEGORY_TITLES.get(a.category, a.category)}»" if a.category else "подходящего подрядчика"
            act = f"вызвать {who} через автодиспетчер" + (f" с пометкой «{a.note}»" if a.note else "")
        if a.delay_s:
            act = f"через {a.delay_s:g} с {act}"
        acts.append(act)
    text = head + (" и при этом " + ", ".join(conds) if conds else "")
    return f"{text}: {'; '.join(acts) or 'ничего не делать'}."


def answer_question(text: str, registry: DeviceRegistry) -> str:
    """Короткая сводка состояния дома: на вопрос отвечаем данными, а не фантазией модели."""
    alarms = [title for m in registry.devices.values() for title in m.alarms()]
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
