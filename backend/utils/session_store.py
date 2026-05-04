import time
from typing import Any


class TTLDict:
    """In-memory dict that auto-purges entries older than ttl_seconds.

    Prevents unbounded growth from sessions that are started but never submitted.
    """

    def __init__(self, ttl_seconds: int = 14400):
        self._ttl = ttl_seconds
        self._store: dict[str, tuple[Any, float]] = {}

    def set(self, key: str, value: Any) -> None:
        self._purge()
        self._store[key] = (value, time.monotonic())

    def get(self, key: str, default: Any = None) -> Any:
        entry = self._store.get(key)
        if entry is None:
            return default
        value, ts = entry
        if time.monotonic() - ts > self._ttl:
            del self._store[key]
            return default
        return value

    def pop(self, key: str, default: Any = None) -> Any:
        entry = self._store.pop(key, None)
        if entry is None:
            return default
        value, ts = entry
        if time.monotonic() - ts > self._ttl:
            return default
        return value

    def _purge(self) -> None:
        now = time.monotonic()
        expired = [k for k, (_, ts) in self._store.items() if now - ts > self._ttl]
        for k in expired:
            del self._store[k]
