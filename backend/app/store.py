import re
import time
from pathlib import Path

import aiosqlite

_SCHEMA = """
CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'New chat',
    agent TEXT NOT NULL DEFAULT 'general',
    preview TEXT NOT NULL DEFAULT '',
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_owner ON threads(owner, updated_at DESC);
"""

_COLUMNS = "id, title, agent, preview, message_count, created_at, updated_at"


_MARKDOWN = re.compile(r"```.*?```|`|\*\*|__|[#>*_~]|\[([^\]]*)\]\([^)]*\)", re.S)


def plain_text(text: str) -> str:
    return _MARKDOWN.sub(lambda m: m.group(1) or " ", text)


def make_title(text: str, limit: int = 48) -> str:
    words = " ".join(text.split())
    if len(words) <= limit:
        return words or "New chat"
    cut = words[:limit].rsplit(" ", 1)[0]
    return f"{cut}…"


class ThreadStore:
    def __init__(self, path: Path):
        self.path = path
        self._db: aiosqlite.Connection | None = None

    async def open(self) -> None:
        self._db = await aiosqlite.connect(self.path)
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.executescript(_SCHEMA)
        await self._db.commit()

    async def close(self) -> None:
        if self._db:
            await self._db.close()

    @property
    def db(self) -> aiosqlite.Connection:
        assert self._db is not None
        return self._db

    async def list(self, owner: str, limit: int = 100) -> list[dict]:
        cursor = await self.db.execute(
            f"SELECT {_COLUMNS} FROM threads WHERE owner = ? ORDER BY updated_at DESC LIMIT ?",
            (owner, limit),
        )
        return [dict(row) for row in await cursor.fetchall()]

    async def get(self, thread_id: str) -> dict | None:
        cursor = await self.db.execute(
            f"SELECT owner, {_COLUMNS} FROM threads WHERE id = ?", (thread_id,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

    async def ensure(self, thread_id: str, owner: str, title: str, agent: str) -> dict:
        now = int(time.time())
        await self.db.execute(
            "INSERT OR IGNORE INTO threads (id, owner, title, agent, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (thread_id, owner, title, agent, now, now),
        )
        await self.db.commit()
        return await self.get(thread_id)

    async def touch(self, thread_id: str, *, preview: str | None = None, agent: str | None = None,
                    added_messages: int = 0) -> None:
        await self.db.execute(
            "UPDATE threads SET updated_at = ?, preview = COALESCE(?, preview), "
            "agent = COALESCE(?, agent), message_count = message_count + ? WHERE id = ?",
            (int(time.time()), preview, agent, added_messages, thread_id),
        )
        await self.db.commit()

    async def rename(self, thread_id: str, title: str) -> None:
        await self.db.execute(
            "UPDATE threads SET title = ?, updated_at = ? WHERE id = ?",
            (title, int(time.time()), thread_id),
        )
        await self.db.commit()

    async def delete(self, thread_id: str) -> None:
        await self.db.execute("DELETE FROM threads WHERE id = ?", (thread_id,))
        await self.db.commit()
