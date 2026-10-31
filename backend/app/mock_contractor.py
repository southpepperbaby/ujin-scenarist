"""Эмулятор внешней системы подрядчика (его CRM): принимает наш webhook, отвечает статусами.

В проде на месте этого модуля чужой сервер: мы знаем только его URL и общий секрет подписи.
Для демо он живёт в нашем приложении, а кабинет подрядчика в интерфейсе работает поверх него:
кнопка «принять» шлёт подписанный webhook обратно к нам, ровно как сделала бы настоящая CRM.
"""
from __future__ import annotations

import json
import time
import uuid

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .tickets import sign, verify

router = APIRouter(prefix="/mock/contractors", tags=["эмулятор подрядчика"])
INBOX: dict[str, list[dict]] = {}


@router.post("/{contractor_id}/webhook")
async def receive(contractor_id: str, request: Request):
    body = await request.body()
    if not verify(body, request.headers.get("X-Scenarist-Signature")):
        raise HTTPException(401, "bad signature")
    data = json.loads(body)
    external_id = f"{contractor_id.upper()[:4]}-{uuid.uuid4().hex[:5]}"
    INBOX.setdefault(contractor_id, []).append({**data, "external_id": external_id, "received": time.time()})
    return {"accepted": True, "external_id": external_id, "eta_minutes": data.get("sla_minutes")}


@router.get("/{contractor_id}/inbox")
def inbox(contractor_id: str):
    return INBOX.get(contractor_id, [])


class Reply(BaseModel):
    ticket_id: str
    status: str
    note: str = ""


@router.post("/{contractor_id}/reply")
async def reply(contractor_id: str, body: Reply):
    """CRM подрядчика меняет статус и сообщает нам через callback_url из заявки."""
    item = next((i for i in INBOX.get(contractor_id, []) if i["ticket_id"] == body.ticket_id), None)
    if item is None:
        raise HTTPException(404, "в системе подрядчика нет такой заявки")
    payload = json.dumps({"event": "ticket.status", "ticket_id": body.ticket_id, "status": body.status,
                          "note": body.note, "external_id": item["external_id"]}, ensure_ascii=False).encode()
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.post(item["callback_url"], content=payload,
                              headers={"Content-Type": "application/json", "X-Scenarist-Signature": sign(payload)})
    if not r.is_success:
        raise HTTPException(r.status_code, r.text)
    return r.json()
