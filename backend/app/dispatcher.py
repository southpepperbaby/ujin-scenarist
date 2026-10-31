"""Автодиспетчер: аварийный сигнал → инцидент → вердикт → политика → заявка подрядчику.

Вердикт по умолчанию даёт таблица известных неисправностей: мгновенно, бесплатно, одинаково каждый
раз и объяснимо одной строкой. Jev подключается только там, где таблица не знает ответа:
1. неисправность, которой нет в таблице (тип из конструктора устройств, заявка из правила по
   обычному сигналу, сообщение о проблеме без датчика): нужно выбрать подрядчика;
2. в доме уже есть другая активная тревога: сочетание меняет серьёзность (клапан заклинило во время
   протечки значит, что воду никто не перекроет).
Jev отвечает на три вопроса: категория (только если неизвестна), серьёзность, ложное срабатывание.

Quality gates по порядку:
1. подтверждение сигнала: тревога должна продержаться DEBOUNCE секунд (дребезг датчика не вызывает наряд);
2. дедупликация: на устройство одна открытая заявка;
3. лимит заявок на устройство в сутки;
4. уверенность (у таблицы всегда высокая): ниже LOW только журнал, между LOW и HIGH решает человек, выше HIGH автоматически;
5. уровень: 0 журнал, 1-2 готовый черновик «отправить / отменить» у жителя и УК, 3 заявка сразу;
6. стоимость выезда и рабочие часы подрядчика понижают автономность для некритичных случаев.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime
from typing import Any

from . import ai
from .bus import Event, EventBus
from .emu import DeviceRegistry
from pydantic import BaseModel

from .tickets import CATEGORY_TITLES, Ticket, TicketService

DEBOUNCE = 3.0
OFFLINE_DEBOUNCE = 10.0
LOW, HIGH = 0.6, 0.85
DAILY_LIMIT = 3
EXPENSIVE = 1500

LEVEL_TITLES = ["информация", "минор", "мажор", "критично"]

# Какие значения сигналов считаются неисправностью: семейство → [(сигнал, значение, название)].
FAULTS: dict[str, list[tuple[str, Any, str]]] = {
    "leak": [("leak", 1, "Протечка воды"), ("tamper", 1, "Вскрыт корпус датчика протечки")],
    "fire": [("alarm", 1, "Пожарная тревога"), ("fault", 1, "Неисправность пожарного датчика"),
             ("tamper", 1, "Вскрыт корпус пожарного датчика")],
    "valve": [("jammed", 1, "Заклинило привод клапана")],
    "barrier": [("alarm", 1, "Авария шлагбаума")],
    "thermostat": [("fault", 1, "Авария датчика температуры")],
    "elevator": [("emergency", 1, "Лифт остановлен аварийно")],
}

# Известные неисправности: (семейство, сигнал) → (категория, уровень). Здесь решает таблица, без ИИ.
KNOWN: dict[tuple[str, str], tuple[str, int]] = {
    ("leak", "leak"): ("plumbing", 3), ("leak", "tamper"): ("plumbing", 1),
    ("fire", "alarm"): ("fire", 3), ("fire", "fault"): ("fire", 2), ("fire", "tamper"): ("fire", 1),
    ("valve", "jammed"): ("plumbing", 2), ("barrier", "alarm"): ("access", 2),
    ("thermostat", "fault"): ("heating", 1), ("elevator", "emergency"): ("lift", 3),
}
TABLE_CONFIDENCE = 0.95

# Категория по семейству: потеря связи (уровень 1) и запасной путь, когда ИИ недоступен.
FALLBACK = {
    "leak": ("plumbing", 3), "valve": ("plumbing", 2), "fire": ("fire", 3), "barrier": ("access", 2),
    "thermostat": ("heating", 1), "elevator": ("lift", 2), "light": ("electric", 1), "counter": ("general", 1),
}

CATEGORY_CRITERIA = {
    "plumbing": "Сантехника: протечки, трубы, краны, клапаны воды, водоснабжение и канализация",
    "electric": "Электрика: свет, розетки, автоматы, электропитание устройств",
    "access": "Въезд и доступ: шлагбаумы, ворота, домофоны, замки, СКУД",
    "lift": "Лифты: остановка, застревание, неисправность кабины или дверей",
    "fire": "Пожарная безопасность: дым, пожарные датчики, сигнализация, оповещение",
    "heating": "Отопление, вентиляция, кондиционирование, термостаты",
    "general": "Всё остальное, что не подходит под категории выше: осмотр дежурным мастером",
}


class Policy(BaseModel):
    """Настройки УК для автодиспетчера."""
    auto_send_building: bool = False          # некритичные общедомовые заявки уходят без подтверждения
    auto_categories: list[str] = list(CATEGORY_TITLES)   # для каких категорий работает автоотправка
    daily_limit: int = DAILY_LIMIT


class Dispatcher:
    def __init__(self, bus: EventBus, registry: DeviceRegistry, tickets: TicketService, notify):
        self.bus = bus
        self.registry = registry
        self.tickets = tickets
        self.notify = notify                      # Engine.notify(target, message, level, extra=)
        self.incidents: dict[str, dict] = {}
        self.policy = Policy()
        self._pending: dict[tuple[str, str], asyncio.Task] = {}
        self.debounce = DEBOUNCE
        self.offline_debounce = OFFLINE_DEBOUNCE

    # ---------- обнаружение ----------

    async def run(self) -> None:
        q = self.bus.subscribe()
        try:
            while True:
                self.observe(await q.get())
        finally:
            self.bus.unsubscribe(q)

    def observe(self, e: Event) -> None:
        if e.kind == "signal" and e.device_id in self.registry.devices:
            managed = self.registry.get(e.device_id)
            for signal, bad, title in FAULTS.get(managed.family, []):
                if e.data.get("signal") != signal:
                    continue
                key = (e.device_id, signal)
                if e.data.get("value") == bad and e.data.get("prev") != bad:
                    self._schedule(key, self.debounce, e.device_id, signal, bad, title)
                elif e.data.get("value") != bad and key in self._pending:
                    self._pending.pop(key).cancel()
                    self._log_cleared(e.device_id, title)
        if e.kind == "device" and e.device_id in self.registry.devices:
            key = (e.device_id, "__offline__")
            if e.data.get("action") == "offline":
                title = f"{self.registry.get(e.device_id).title}: нет связи"
                self._schedule(key, self.offline_debounce, e.device_id, None, None, title)
            elif e.data.get("action") == "online" and key in self._pending:
                self._pending.pop(key).cancel()

    def _schedule(self, key, delay, device_id, signal, bad, title) -> None:
        if key in self._pending:
            return

        async def confirm():
            await asyncio.sleep(delay)
            self._pending.pop(key, None)
            managed = self.registry.devices.get(device_id)
            if managed is None:
                return
            still = (not managed.online) if signal is None else managed.state().get(signal) == bad
            if still:
                await self.handle(device_id, signal, title, held_s=delay)

        self._pending[key] = asyncio.create_task(confirm())

    def _log_cleared(self, device_id: str, title: str) -> None:
        self.bus.emit("incident", device_id, phase="cleared",
                      message=f"{title}: сигнал пропал до подтверждения, похоже на дребезг. Наряд не вызываем.")

    # ---------- обработка инцидента ----------

    async def handle(self, device_id: str, signal: str | None, title: str, held_s: float = 0,
                     rule=None, forced_category: str | None = None, note: str = "") -> dict:
        managed = self.registry.get(device_id)
        inc = {
            "id": "I-" + uuid.uuid4().hex[:6].upper(), "ts": time.time(), "device_id": device_id,
            "device_title": managed.title, "room": managed.room, "scope": managed.scope,
            "signal": signal, "title": title, "status": "confirmed", "reasoning": [],
            "verdict": None, "decision": None, "ticket_id": None, "rule_id": rule.id if rule else None,
        }
        self.incidents[inc["id"]] = inc
        why = inc["reasoning"]
        if held_s:
            why.append(f"Сигнал держится {held_s:g} с, это не дребезг.")
        if rule:
            why.append(f"Заявку запросило правило «{rule.title}».")
        self._emit(inc)

        open_ticket = self.tickets.open_for_device(device_id)
        if open_ticket:
            why.append(f"По этому устройству уже открыта заявка {open_ticket.id}, новую не создаём.")
            return self._decide(inc, "duplicate", ticket=open_ticket)
        if self.tickets.count_today(device_id) >= self.policy.daily_limit:
            why.append(f"Лимит {self.policy.daily_limit} заявки в сутки на устройство исчерпан, нужен взгляд человека.")
            who = "resident" if managed.scope == "apartment" else "concierge"
            self.notify(who, f"{title}: лимит автозаявок исчерпан, проверьте вручную.", "warning",
                        extra={"incident_id": inc["id"]})
            return self._decide(inc, "limit")

        verdict = await self.classify(managed, signal, title, held_s, forced_category)
        inc["verdict"] = verdict
        why.extend(verdict["reasons"])
        level, conf = verdict["level"], verdict["confidence"]
        contractor = self.tickets.contractor_for(verdict["category"])

        if conf < LOW:
            who = "resident" if managed.scope == "apartment" else "concierge"
            why.append(f"Уверенность {conf:.0%} ниже порога {LOW:.0%}: только журнал и вопрос ответственному.")
            self.notify(who, f"{title}: не удалось уверенно определить проблему, проверьте устройство.",
                        "warning", extra={"incident_id": inc["id"]})
            return self._decide(inc, "log")
        if level == 0:
            why.append("Уровень «информация»: подрядчика не вызываем, пишем в журнал.")
            return self._decide(inc, "log")

        ticket = Ticket(category=verdict["category"], level=level, title=title,
                        description=self._description(managed, title, verdict, note),
                        device_id=device_id, scope=managed.scope, incident_id=inc["id"], rule_id=inc["rule_id"],
                        contractor_id=contractor.id, reasoning=why)
        # Некритичное в квартире остаётся у жителя, общедомовое решает УК.
        confirm_by = "resident" if managed.scope == "apartment" else "concierge"

        if conf < HIGH:
            why.append(f"Уверенность {conf:.0%} между {LOW:.0%} и {HIGH:.0%}: готовый черновик, решает человек.")
            ticket.needs_confirmation = confirm_by
            decision = "draft"
        elif level < 3 and managed.scope == "building" and self.policy.auto_send_building \
                and verdict["category"] in self.policy.auto_categories:
            ticket.status = "new"
            why.append(f"{LEVEL_TITLES[level].capitalize()}, общедомовое: УК включила автоотправку для "
                       f"«{CATEGORY_TITLES[verdict['category']]}», заявка ушла без подтверждения.")
            decision = "auto"
        elif level < 3:
            why.append(f"{LEVEL_TITLES[level].capitalize()}: заявка готова, отправит житель или УК одной кнопкой.")
            ticket.needs_confirmation = confirm_by
            decision = "draft"
        else:
            ticket.status = "new"
            why.append("Критично: заявка ушла подрядчику без ожидания, консьерж оповещён.")
            decision = "auto"

        if decision == "draft" and contractor.call_out_price > EXPENSIVE:
            why.append(f"Выезд стоит {contractor.call_out_price} ₽, выше лимита {EXPENSIVE} ₽ для автозаявки.")
        if level < 3 and not _in_hours(contractor.hours):
            why.append(f"Подрядчик работает {contractor.hours}, заявку возьмут в рабочее время.")

        related = self.tickets.open_for_contractor(contractor.id, managed.scope)
        if related:
            why.append(f"У «{contractor.name}» уже открыта заявка {related.id} по этому адресу: "
                       f"дописываем туда, второй выезд не нужен.")
            was_draft = related.status == "draft"
            await self.tickets.attach(related, title, device_id, level, send=decision == "auto")
            if was_draft and related.status == "new":
                self._notify_people(managed, related, "auto")
            return self._decide(inc, "merged", ticket=related)

        await self.tickets.create(ticket)
        self._notify_people(managed, ticket, decision)
        return self._decide(inc, decision, ticket=ticket)

    async def classify(self, managed, signal, title, held_s, forced_category=None) -> dict:
        """Таблица для известных случаев, Jev только для неизвестных неисправностей и сочетаний тревог."""
        others = self._other_alarms(managed)
        known = KNOWN.get((managed.family, signal)) if signal else (FALLBACK.get(managed.family, ("general", 1))[0], 1)
        if known and not others:
            category, level = known
            category = forced_category or category
            what = "потеря связи" if not signal else "известная неисправность"
            return {"source": "rules", "category": category, "level": level, "confidence": TABLE_CONFIDENCE,
                    "false_alarm": None,
                    "reasons": [f"{what.capitalize()}: по таблице «{CATEGORY_TITLES[category]}», "
                                f"уровень «{LEVEL_TITLES[level]}». ИИ не нужен."]}

        ask_category = not (forced_category or known)
        questions = {}
        if ask_category:
            questions["category"] = {"type": "choice", "criteria": CATEGORY_CRITERIA,
                                     "instructions": "Какой подрядчик по договору должен устранять проблему?"}
        questions["severity"] = {
            "type": "score", "instructions": "Насколько серьёзна ситуация для жителей и дома прямо сейчас?",
            "criteria": ["Информация: ничего не сломано, просто событие",
                         "Минор: неудобство, риска для имущества и людей нет",
                         "Мажор: функция дома не работает, нужен ремонт в течение часов",
                         "Критично: идёт ущерб имуществу (вода, огонь) или есть угроза людям"]}
        questions["false_alarm"] = {"type": "noul", "instructions": "Похоже ли это на ложное срабатывание датчика?"}
        why = "сочетание тревог: " + ", ".join(others) if others else "неисправности нет в таблице"
        try:
            a = await ai.jev(self._state(managed, signal, title, held_s, others), questions)
        except ai.AIUnavailable as exc:
            category, level = known or FALLBACK.get(managed.family, ("general", 1))
            category = forced_category or category
            return {"source": "rules", "category": category, "level": level, "confidence": 0.9,
                    "false_alarm": None,
                    "reasons": [f"ИИ недоступен ({exc}), решение по таблице: "
                                f"{CATEGORY_TITLES[category]}, {LEVEL_TITLES[level]}."]}
        probs = a["severity"]["probabilities"]          # {"0": p, "1": p, ...}
        level = int(max(probs, key=probs.get))
        if ask_category:
            category, confidence = a["category"]["choice"], a["category"]["confidence"]
        else:
            category, confidence = forced_category or known[0], max(probs.values())
        false_alarm = a["false_alarm"]["noul"]
        reasons = [f"Jev ({why}): подрядчик «{CATEGORY_TITLES[category]}», уровень «{LEVEL_TITLES[level]}», "
                   f"уверенность {confidence:.0%}, ложное срабатывание {false_alarm:.0%}."]
        if false_alarm > 0.6 and level > 0:
            level = max(0, level - 1)
            reasons.append("Вероятно ложное срабатывание: понижаем уровень на одну ступень.")
        return {"source": "jev", "category": category, "level": level, "confidence": confidence,
                "false_alarm": false_alarm, "reasons": reasons}

    def _other_alarms(self, managed) -> list[str]:
        return [title for m in self.registry.devices.values() if m.id != managed.id
                for s, b, title in FAULTS.get(m.family, []) if m.state().get(s) == b]

    def _state(self, managed, signal, title, held_s, others) -> dict:
        """Состояние для Jev без персональных данных: тип устройства, помещение, сигналы, соседние тревоги."""
        signals = {s.title: s.value for s in managed.device.signals.values() if s.kind != "system"}
        return {
            "событие": title, "устройство": managed.device.title, "помещение": managed.room,
            "уровень": "общедомовое" if managed.scope == "building" else "квартира",
            "связь": "есть" if managed.online else "нет", "сигнал держится, с": held_s,
            "показания": signals, "другие активные тревоги": others,
            "время суток": datetime.now().strftime("%H:%M"),
        }

    def _description(self, managed, title, verdict, note) -> str:
        parts = [f"{title}. Устройство: {managed.title}, помещение: {managed.room}."]
        state = {s.title: s.value for s in managed.device.signals.values() if s.kind != "system"}
        parts.append("Показания: " + ", ".join(f"{k} = {v}" for k, v in list(state.items())[:6]) + ".")
        if note:
            parts.append(note)
        if verdict["level"] >= 3:
            parts.append("Критично: идёт ущерб или есть угроза людям, нужен приоритетный выезд.")
        return " ".join(parts)

    def _notify_people(self, managed, ticket: Ticket, decision: str) -> None:
        extra = {"ticket_id": ticket.id}
        if decision == "draft":
            # Некритичное не уходит в УК: черновик видит тот, кто отвечает за устройство.
            ask = f"{ticket.title}. Заявка для «{ticket.contractor_name}» готова: отправить или отменить?"
            self.notify(ticket.needs_confirmation or "concierge", ask, "warning", extra=extra)
            return
        self.notify("concierge", f"{ticket.title}: заявка {ticket.id} отправлена «{ticket.contractor_name}».",
                    "critical" if ticket.level == 3 else "warning", extra=extra)
        if managed.scope == "apartment":
            self.notify("resident", f"Мы вызвали «{ticket.contractor_name}», заявка {ticket.id}. "
                                    f"Статус увидите в приложении.", "warning", extra=extra)

    def _decide(self, inc: dict, decision: str, ticket: Ticket | None = None) -> dict:
        inc["decision"] = decision
        inc["status"] = "dispatched" if ticket and decision not in ("duplicate", "merged") else "logged"
        inc["ticket_id"] = ticket.id if ticket else None
        self._emit(inc)
        return inc

    def _emit(self, inc: dict) -> None:
        self.bus.emit("incident", inc["device_id"], phase=inc["status"], incident_id=inc["id"],
                      decision=inc["decision"], message=f"{inc['title']}: {_decision_title(inc)}",
                      incident=inc)

    # ---------- действие правила ----------

    async def from_rule(self, rule, action, run: dict) -> dict:
        trig = rule.trigger
        managed = self.registry.get(trig.device_id)
        title = next((t for s, b, t in FAULTS.get(managed.family, []) if s == trig.signal),
                     f"{managed.title}: {trig.signal}")
        inc = await self.handle(trig.device_id, trig.signal, title, rule=rule,
                                forced_category=action.category, note=action.note)
        return {"incident_id": inc["id"], "decision": inc["decision"], "ticket_id": inc["ticket_id"]}


def _decision_title(inc: dict) -> str:
    return {
        None: "обрабатываем", "duplicate": "заявка уже открыта",
        "merged": "добавлено в открытую заявку", "limit": "лимит автозаявок",
        "log": "записано в журнал", "draft": "черновик заявки ждёт подтверждения",
        "auto": "заявка отправлена",
    }.get(inc["decision"], inc["decision"])


def _in_hours(hours: str) -> bool:
    if hours == "24/7":
        return True
    try:
        start, end = (int(x) for x in hours.split("-"))
    except ValueError:
        return True
    return start <= datetime.now().hour < end
