"""Постоянное хранилище: SQLite в папке данных, документы JSON по коллекциям.

Почему так: все сущности уже описаны Pydantic-моделями и сериализуются в JSON. Хранилище документов
на SQLite не требует миграций схемы на каждое новое поле, переживает перезапуск и работает без
отдельного сервера БД. Когда понадобится Postgres, меняется только этот модуль: интерфейс тот же.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any


class Storage:
    def __init__(self, path: Path | str | None):
        self.path = str(path) if path else ":memory:"
        if path:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.execute("""CREATE TABLE IF NOT EXISTS docs (
            coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, ts REAL NOT NULL,
            PRIMARY KEY (coll, id))""")
        self._db.execute("CREATE INDEX IF NOT EXISTS docs_coll_ts ON docs (coll, ts)")

    def put(self, coll: str, doc_id: str, data: Any) -> None:
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO docs VALUES (?, ?, ?, ?)",
                             (coll, doc_id, json.dumps(data, ensure_ascii=False, default=str), time.time()))

    def put_many(self, coll: str, items: dict[str, Any]) -> None:
        now = time.time()
        rows = [(coll, k, json.dumps(v, ensure_ascii=False, default=str), now) for k, v in items.items()]
        with self._lock:
            self._db.execute("BEGIN")
            self._db.executemany("INSERT OR REPLACE INTO docs VALUES (?, ?, ?, ?)", rows)
            self._db.execute("COMMIT")

    def get(self, coll: str, doc_id: str, default: Any = None) -> Any:
        row = self._db.execute("SELECT data FROM docs WHERE coll=? AND id=?", (coll, doc_id)).fetchone()
        return json.loads(row[0]) if row else default

    def all(self, coll: str, limit: int | None = None) -> list[Any]:
        """Документы коллекции в порядке записи; limit берёт последние."""
        sql = "SELECT data FROM docs WHERE coll=? ORDER BY ts"
        rows = self._db.execute(sql, (coll,)).fetchall()
        if limit is not None:
            rows = rows[-limit:]
        return [json.loads(r[0]) for r in rows]

    def delete(self, coll: str, doc_id: str) -> None:
        with self._lock:
            self._db.execute("DELETE FROM docs WHERE coll=? AND id=?", (coll, doc_id))

    def trim(self, coll: str, keep: int) -> None:
        """Журналы (уведомления, запуски) не растут бесконечно."""
        with self._lock:
            self._db.execute("""DELETE FROM docs WHERE coll=? AND id NOT IN (
                SELECT id FROM docs WHERE coll=? ORDER BY ts DESC LIMIT ?)""", (coll, coll, keep))

    def count(self, coll: str) -> int:
        return self._db.execute("SELECT COUNT(*) FROM docs WHERE coll=?", (coll,)).fetchone()[0]

    def close(self) -> None:
        self._db.close()
