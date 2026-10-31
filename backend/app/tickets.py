"""Заявки подрядчикам: справочник подрядчиков по договорам УК, жизненный цикл заявки, каналы доставки.

Как в жизни: заявка создаётся в системе УК, назначается подрядчику по категории работ, доставляется
в его канал (кабинет подрядчика, Telegram, webhook), дальше подрядчик двигает статусы, а житель и
консьерж видят их. Срок реакции считается по SLA договора.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import time
import uuid
from typing import Literal

import httpx
from pydantic import BaseModel, Field

from . import config
from .dictionaries import CATEGORY_TITLES  # noqa: F401  отдаётся дальше как tickets.CATEGORY_TITLES
from .bus import EventBus

Category = Literal["plumbing", "electric", "access", "lift", "fire", "heating", "general"]

Status = Literal["draft", "new", "accepted", "in_progress", "done", "closed", "cancelled"]

STATUS_TITLES = {
    "draft": "ждёт подтверждения",
    "new": "отправлена подрядчику",
    "accepted": "принята",
    "in_progress": "в работе",
    "done": "выполнена",
    "closed": "закрыта",
    "cancelled": "отменена",
}

# Разрешённые переходы: кто что может сделать с заявкой.
TRANSITIONS: dict[str, set[str]] = {
    "draft": {"new", "cancelled"},
    "new": {"accepted", "cancelled"},
    "accepted": {"in_progress", "cancelled"},
    "in_progress": {"done"},
    "done": {"closed", "in_progress"},
    "closed": set(),
    "cancelled": set(),
}


class Contractor(BaseModel):
    id: str
    name: str
    category: Category
    phone: str
    sla_minutes: int                       # срок реакции по договору
    hours: str = "24/7"                    # "24/7" или "09-18"
    channel: Literal["portal", "telegram", "webhook"] = "webhook"
    telegram_chat_id: str | None = None
    webhook_url: str | None = None
    call_out_price: int = 0                # стоимость выезда, руб.


class HistoryItem(BaseModel):
    ts: float = Field(default_factory=time.time)
    status: Status
    actor: str
    note: str = ""


class Ticket(BaseModel):
    id: str = Field(default_factory=lambda: "T-" + uuid.uuid4().hex[:6].upper())
    created: float = Field(default_factory=time.time)
    status: Status = "draft"
    category: Category
    level: int                              # 0 инфо, 1 минор, 2 мажор, 3 критично
    title: str
    description: str
    address: str = "ЖК «Северный», корп. 1, кв. 2806"
    device_id: str | None = None
    related_devices: list[str] = []         # другие устройства, чьи неисправности вошли в эту заявку
    scope: Literal["apartment", "building"] = "apartment"
    incident_id: str | None = None
    rule_id: str | None = None
    contractor_id: str | None = None
    contractor_name: str | None = None
    sla_due: float | None = None
    needs_confirmation: Literal["resident", "concierge"] | None = None
    reasoning: list[str] = []               # почему автодиспетчер так решил, простым языком
    delivery: list[dict] = []
    history: list[HistoryItem] = []


def sign(body: bytes) -> str:
    return "sha256=" + hmac.new(config.WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()


def verify(body: bytes, signature: str | None) -> bool:
    return bool(signature) and hmac.compare_digest(sign(body), signature)


def webhook_payload(t: "Ticket", c: "Contractor") -> dict:
    """Что уходит подрядчику: заявка без данных жителя кроме адреса, плюс адрес для ответных статусов."""
    return {
        "event": "ticket.created", "ticket_id": t.id, "level": t.level, "category": t.category,
        "title": t.title, "description": t.description, "address": t.address,
        "sla_minutes": c.sla_minutes, "created": t.created,
        "callback_url": f"{config.PUBLIC_BASE_URL}/api/webhooks/contractors/{c.id}",
    }


SEED_CONTRACTORS = [
    Contractor(id="aquaservice", name="ООО «АкваСервис»", category="plumbing", phone="+7 900 100-10-10",
               sla_minutes=30, call_out_price=1500),
    Contractor(id="volt", name="ИП Волков, электромонтаж", category="electric", phone="+7 900 200-20-20",
               sla_minutes=120, hours="09-21", call_out_price=1200),
    Contractor(id="vorota", name="«Ворота Профи»", category="access", phone="+7 900 300-30-30",
               sla_minutes=60, call_out_price=2000),
    Contractor(id="liftmontazh", name="АО «ЛифтМонтаж»", category="lift", phone="+7 900 400-40-40",
               sla_minutes=30, call_out_price=0),
    Contractor(id="pozhzashchita", name="«ПожЗащита»", category="fire", phone="+7 900 500-50-50",
               sla_minutes=15, call_out_price=0),
    Contractor(id="teplo", name="«ТеплоКлимат»", category="heating", phone="+7 900 600-60-60",
               sla_minutes=240, hours="09-18", call_out_price=1800),
    Contractor(id="uk-master", name="Мастер УК (дежурный)", category="general", phone="+7 900 700-70-70",
               sla_minutes=180, call_out_price=0),
]


def visible_to_role(scope: str, level: int, role: str) -> bool:
    """Житель видит свою квартиру. УК видит общедомовое и только критичное из квартир."""
    if role == "resident":
        return scope == "apartment"
    if role == "uk":
        return scope == "building" or level >= 3
    return True


def visible_to(t: "Ticket", role: str) -> bool:
    return visible_to_role(t.scope, t.level, role)


class TicketService:
    def __init__(self, bus: EventBus, contractors: list[Contractor] | None = None, storage=None):
        self.bus = bus
        self.storage = storage
        self.contractors: dict[str, Contractor] = {c.id: c for c in (contractors or SEED_CONTRACTORS)}
        self.tickets: dict[str, Ticket] = {}
        self.network = True                     # тесты выключают внешние вызовы
        if storage:
            for raw in storage.all("contractors"):
                c = Contractor.model_validate(raw)
                self.contractors[c.id] = c
            for raw in storage.all("tickets"):
                t = Ticket.model_validate(raw)
                self.tickets[t.id] = t

    # ---------- подрядчики ----------

    def contractor_for(self, category: str) -> Contractor:
        for c in self.contractors.values():
            if c.category == category:
                return c
        return self.contractors.get("uk-master") or next(iter(self.contractors.values()))

    def upsert_contractor(self, c: Contractor) -> Contractor:
        self.contractors[c.id] = c
        if self.storage:
            self.storage.put("contractors", c.id, c.model_dump(mode="json"))
        return c

    # ---------- заявки ----------

    def open_for_device(self, device_id: str) -> Ticket | None:
        for t in self.tickets.values():
            if t.device_id == device_id and t.status not in ("done", "closed", "cancelled"):
                return t
        return None

    def open_for_contractor(self, contractor_id: str, scope: str) -> Ticket | None:
        """Открытая заявка тому же подрядчику на тот же адрес: вторая бригада на одну аварию не нужна."""
        for t in self.tickets.values():
            if t.contractor_id == contractor_id and t.scope == scope and t.status in ("draft", "new", "accepted"):
                return t
        return None

    async def attach(self, t: Ticket, title: str, device_id: str | None, level: int, send: bool) -> Ticket:
        """Связанная неисправность дописывается в открытую заявку. Критичное отправляет черновик сразу."""
        t.description += f" Также: {title}."
        t.related_devices.append(device_id or "")
        t.level = max(t.level, level)
        if send and t.status == "draft":
            t.needs_confirmation = None
            return await self.transition(t.id, "new", "автодиспетчер", note=f"срочно из-за: {title}")
        t.history.append(HistoryItem(status=t.status, actor="автодиспетчер", note=f"добавлено: {title}"))
        self._emit(t, "status")
        return t

    def count_today(self, device_id: str) -> int:
        day = time.time() - 86400
        return sum(1 for t in self.tickets.values() if t.device_id == device_id and t.created > day)

    async def create(self, ticket: Ticket, actor: str = "автодиспетчер") -> Ticket:
        contractor = self.contractors.get(ticket.contractor_id or "") or self.contractor_for(ticket.category)
        ticket.contractor_id = contractor.id
        ticket.contractor_name = contractor.name
        ticket.history.append(HistoryItem(status=ticket.status, actor=actor, note="заявка сформирована"))
        self.tickets[ticket.id] = ticket
        self._emit(ticket, "created")
        if ticket.status == "new":
            await self._deliver(ticket)
            self._save(ticket)
        return ticket

    async def transition(self, ticket_id: str, status: Status, actor: str, note: str = "") -> Ticket:
        t = self.tickets[ticket_id]
        if status not in TRANSITIONS[t.status]:
            raise ValueError(f"нельзя перевести заявку из «{STATUS_TITLES[t.status]}» в «{STATUS_TITLES[status]}»")
        t.status = status
        t.history.append(HistoryItem(status=status, actor=actor, note=note))
        if status == "new":
            await self._deliver(t)
        self._emit(t, "status")
        return t

    def _save(self, t: Ticket) -> None:
        if self.storage:
            self.storage.put("tickets", t.id, t.model_dump(mode="json"))

    def _emit(self, t: Ticket, action: str) -> None:
        self._save(t)
        self.bus.emit("ticket", t.device_id, action=action, ticket_id=t.id, status=t.status,
                      level=t.level, message=f"Заявка {t.id} ({t.contractor_name}): {STATUS_TITLES[t.status]}",
                      ticket=t.model_dump(mode="json"))

    # ---------- доставка ----------

    async def _deliver(self, t: Ticket) -> None:
        c = self.contractors[t.contractor_id]
        t.sla_due = time.time() + c.sla_minutes * 60
        results = []
        if c.channel == "webhook" and self.network:
            results.append(await self._webhook(t, c))
        if self.network and (c.channel == "telegram" or (config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID)):
            results.append(await self._telegram(t, c))
        if c.channel == "portal" or not any(r["ok"] for r in results):
            results.append({"channel": "portal", "ok": True, "detail": "заявка в кабинете подрядчика"})
        t.delivery = results

    async def _telegram(self, t: Ticket, c: Contractor) -> dict:
        chat = c.telegram_chat_id or config.TELEGRAM_CHAT_ID
        if not (config.TELEGRAM_BOT_TOKEN and chat):
            return {"channel": "telegram", "ok": False, "detail": "бот не настроен"}
        level = ["инфо", "минор", "мажор", "КРИТИЧНО"][t.level]
        text = (f"<b>Заявка {t.id}</b> · {level}\n{t.title}\n{t.address}\n\n{t.description}\n\n"
                f"Срок реакции по договору: {c.sla_minutes} мин.")
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage",
                                      json={"chat_id": chat, "text": text, "parse_mode": "HTML"})
            return {"channel": "telegram", "ok": r.status_code == 200, "detail": f"HTTP {r.status_code}"}
        except httpx.HTTPError as exc:
            return {"channel": "telegram", "ok": False, "detail": str(exc)}

    async def _webhook(self, t: Ticket, c: Contractor, attempts: int = 3) -> dict:
        """POST заявки в систему подрядчика с подписью HMAC-SHA256 и повторами при сбое."""
        url = c.webhook_url or f"{config.PUBLIC_BASE_URL}/mock/contractors/{c.id}/webhook"
        body = json.dumps(webhook_payload(t, c), ensure_ascii=False).encode()
        headers = {"Content-Type": "application/json", "X-Scenarist-Event": "ticket.created",
                   "X-Scenarist-Signature": sign(body)}
        last = ""
        for attempt in range(1, attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    r = await client.post(url, content=body, headers=headers)
                if r.is_success:
                    ack = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
                    return {"channel": "webhook", "ok": True, "attempts": attempt, "url": url,
                            "detail": f"HTTP {r.status_code}", "external_id": ack.get("external_id")}
                last = f"HTTP {r.status_code}"
            except httpx.HTTPError as exc:
                last = str(exc) or exc.__class__.__name__
            await asyncio.sleep(0.5 * attempt)
        return {"channel": "webhook", "ok": False, "attempts": attempts, "url": url, "detail": last}
