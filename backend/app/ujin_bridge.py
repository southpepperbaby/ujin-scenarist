"""Мост в Ujin OS: сигналы привязанных эмуляторов публикуются на стенд, правила уходят в autoscripts.

Используем клиент организаторов (`emulators/ujin_client.py`) без изменений: он уже знает мины стенда
(0 → 0.001, двухфазное создание словаря, класс модели в поле `c`, авторизация ust + apartment_id).
Публикация идёт пачками раз в PUBLISH_EVERY секунд с последним значением каждого сигнала, чтобы не
заваливать стенд запросом на каждый тик.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from . import config
from .bus import EventBus
from .emu import DeviceRegistry
from .rules import Rule, to_ujin_autoscript

from core import wire_value  # noqa: E402  (путь к эмуляторам добавляет app.emu)
from ujin_client import UjinClient  # noqa: E402

PUBLISH_EVERY = 3.0
CLS = "integrations_devices"


class UjinBridge:
    def __init__(self, bus: EventBus, registry: DeviceRegistry, secrets: dict):
        self.bus = bus
        self.registry = registry
        self.secrets = secrets
        self.live = config.UJIN_LIVE and bool(secrets)
        resident = (secrets.get("residents") or [{}])[0]
        self.ust = resident.get("ust", "")
        self.apartment_id = str(secrets.get("team_apartment") or resident.get("apartment_id") or "")
        self.base_url = (secrets.get("api_base") or config.UJIN_BASE_URL).removesuffix("/api")
        self._dirty: dict[str, set[str]] = {}
        self._dicts_path = config.DATA_DIR / "ujin_dicts.json"
        self._dicts: set[str] = set(json.loads(self._dicts_path.read_text())) if self._dicts_path.exists() else set()
        self.stats = {"published": 0, "batches": 0, "errors": 0, "last_ok": None, "last_error": None,
                      "last_response": None}

    def client(self, dry: bool | None = None) -> UjinClient:
        return UjinClient(self.base_url, dry_run=not self.live if dry is None else dry, cls=CLS,
                          signal_prefix=CLS + "_", ust=self.ust, apartment_id=self.apartment_id,
                          logger=lambda m: None)

    def status(self) -> dict:
        bound = [{"id": m.id, "title": m.title, "sn": m.ujin["sn"], "ext": m.ujin["ext"]}
                 for m in self.registry.devices.values() if m.ujin]
        return {"live": self.live, "configured": bool(self.secrets), "base_url": self.base_url,
                "apartment_id": self.apartment_id, "bound": bound, **self.stats}

    def set_live(self, live: bool) -> dict:
        self.live = live and bool(self.secrets)
        if self.live:
            for m in self.registry.devices.values():
                if m.ujin:
                    self._dirty[m.id] = {n for n, s in m.device.signals.items() if s.publishable}
        return self.status()

    # ---------- публикация ----------

    async def run(self) -> None:
        q = self.bus.subscribe()
        flusher = asyncio.create_task(self._flush_loop())
        try:
            while True:
                e = await q.get()
                if e.kind == "signal" and e.device_id in self.registry.devices:
                    m = self.registry.get(e.device_id)
                    if m.ujin and m.device.signals[e.data["signal"]].publishable:
                        self._dirty.setdefault(m.id, set()).add(e.data["signal"])
        finally:
            flusher.cancel()
            self.bus.unsubscribe(q)

    async def _flush_loop(self) -> None:
        while True:
            await asyncio.sleep(PUBLISH_EVERY)
            if self._dirty and self.live:
                batch, self._dirty = self._dirty, {}
                await asyncio.to_thread(self._publish, batch)

    def _publish(self, batch: dict[str, set[str]]) -> None:
        client = self.client()
        rows, new_short = [], []
        for device_id, names in batch.items():
            m = self.registry.devices.get(device_id)
            if not m or not m.ujin:
                continue
            for name in sorted(names):
                sig = m.device.signals[name]
                value = wire_value(sig)
                if not isinstance(value, (int, float)) or isinstance(value, bool):
                    continue
                key = f"{m.ujin['ext']}:{name}"
                if key not in self._dicts:
                    new_short.append({"sn": m.ujin["ext"], "s": name, "v": 0.001, "c": CLS})
                    self._dicts.add(key)
                rows.append({"sn": m.ujin["ext"], "s": f"{CLS}_{name}", "v": value, "c": CLS})
        if not rows:
            return
        try:
            resp = client.publish_group(rows, new_short=new_short)
            self.stats["batches"] += 1
            self.stats["last_response"] = _scrub(resp)
            if isinstance(resp, dict) and resp.get("error") not in (0, "0", None):
                raise RuntimeError(resp.get("message") or f"error={resp.get('error')}")
            self.stats["published"] += len(rows)
            self.stats["last_ok"] = time.time()
            if new_short:
                self._save_dicts()
            self.bus.emit("ujin", None, phase="published", count=len(rows),
                          message=f"Ujin: опубликовано сигналов {len(rows)}")
        except Exception as exc:  # noqa: BLE001 — сбой стенда не должен ронять приложение
            self.stats["errors"] += 1
            self.stats["last_error"] = f"{time.strftime('%H:%M:%S')} {exc}"
            for row in new_short:
                self._dicts.discard(f"{row['sn']}:{row['s']}")
            self.bus.emit("ujin", None, phase="error", message=f"Ujin: ошибка публикации, {exc}")

    def _save_dicts(self) -> None:
        self._dicts_path.parent.mkdir(parents=True, exist_ok=True)
        self._dicts_path.write_text(json.dumps(sorted(self._dicts)))

    # ---------- сценарии платформы ----------

    def export(self, rule: Rule) -> dict:
        """Правило в формате autoscripts платформы: серийники устройств стенда вместо наших id."""
        serials = {m.id: m.ujin["sn"] for m in self.registry.devices.values() if m.ujin}
        return to_ujin_autoscript(rule, serials, prefix=CLS + "_")

    def push_rule(self, rule: Rule) -> dict:
        """Отправить правило в autoscripts платформы и включить его.

        Платформа создаёт сценарий выключенным: без `autoscripts/activate` он лежит мёртвым грузом
        (SCENARIOS.md §1). Поэтому за `edit` всегда идёт `activate` по id из ответа.
        """
        payload = self.export(rule)
        if not self.ust:
            return {"ok": False, "payload": payload, "live": self.live,
                    "detail": "нет токена резидента (secrets/ujin.json): сценарии живут в кабинете жителя"}
        if not payload["set_signal"]:
            return {"ok": False, "payload": payload, "live": self.live,
                    "detail": "у правила нет команд устройствам стенда, отправлять нечего"}
        client = self.client()
        try:
            resp: Any = client.autoscripts_edit(self.ust, 0, "trigger", condition=payload["condition"],
                                                set_signal=payload["set_signal"], title=payload["title"])
        except Exception as exc:  # noqa: BLE001 — сбой стенда возвращаем ответом, а не 500
            return {"ok": False, "payload": payload, "live": self.live, "detail": f"стенд не ответил: {exc}"}
        ok = isinstance(resp, dict) and resp.get("error") in (0, "0", None)
        out = {"ok": ok, "payload": payload, "response": _scrub(resp), "live": self.live,
               "scenario_id": _scenario_id(resp), "activated": False}
        if not ok:
            out["detail"] = str(resp.get("message") if isinstance(resp, dict) else resp)[:300]
            return out
        if out["scenario_id"] is None:
            out["detail"] = ("сценарий создан, но платформа не вернула id — включите его в приложении жителя"
                             if self.live else "сухой прогон: включения не было, включите live и повторите")
            return out
        try:
            activated = client.autoscripts_activate(self.ust, out["scenario_id"])
            out["activated"] = isinstance(activated, dict) and activated.get("error") in (0, "0", None)
            out["activate_response"] = _scrub(activated)
        except Exception as exc:  # noqa: BLE001
            out["detail"] = f"сценарий создан, но включить не удалось: {exc}"
        return out

    def platform_scripts(self) -> dict:
        if not self.ust:
            return {"error": 1, "message": "нет токена резидента: список сценариев берётся его токеном"}
        try:
            return _scrub(self.client().autoscripts_list(self.ust))
        except Exception as exc:  # noqa: BLE001
            return {"error": 1, "message": f"стенд не ответил: {exc}"}


def _scenario_id(resp: Any) -> int | None:
    """id созданного сценария: платформа кладёт его то в корень ответа, то в `data`."""
    if not isinstance(resp, dict):
        return None
    for source in (resp, resp.get("data") if isinstance(resp.get("data"), dict) else {}):
        for key in ("id", "scenario_id", "scenarioId"):
            value = source.get(key)
            if isinstance(value, bool):
                continue
            if isinstance(value, int) and value > 0:
                return value
            if isinstance(value, str) and value.isdigit() and int(value) > 0:
                return int(value)
    return None


def _scrub(resp: Any) -> Any:
    """Платформа эхом возвращает токен жителя: наружу (в UI и логи) его не отдаём."""
    if isinstance(resp, dict):
        return {k: ("***" if k in ("token", "ust") else _scrub(v)) for k, v in resp.items()}
    if isinstance(resp, list):
        return [_scrub(v) for v in resp]
    return resp
