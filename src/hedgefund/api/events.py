from __future__ import annotations

import asyncio
import uuid

_queues: dict[uuid.UUID, asyncio.Queue] = {}


def create_queue(run_id: uuid.UUID) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue()
    _queues[run_id] = q
    return q


def get_queue(run_id: uuid.UUID) -> asyncio.Queue | None:
    return _queues.get(run_id)


def remove_queue(run_id: uuid.UUID) -> None:
    _queues.pop(run_id, None)
