"""A3b/D8 — light structured logs + in-process counters for the AI brain."""

from __future__ import annotations

import json
import time
from typing import Any

_counters: dict[str, int] = {
    "diagnose_total": 0,
    "diagnose_errors": 0,
    "ungrounded": 0,  # ragWeak
}


def log_json(level: str, msg: str, **fields: Any) -> None:
    line = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "level": level,
        "msg": msg,
        "service": "loglens-ai",
        **fields,
    }
    print(json.dumps(line, default=str), flush=True)


def observe_diagnose(*, ok: bool, rag_weak: bool, latency_ms: int, request_id: str | None) -> None:
    _counters["diagnose_total"] += 1
    if not ok:
        _counters["diagnose_errors"] += 1
    if rag_weak:
        _counters["ungrounded"] += 1
    log_json(
        "info" if ok else "error",
        "diagnose",
        requestId=request_id,
        ok=ok,
        ragWeak=rag_weak,
        latencyMs=latency_ms,
        # never log logText
    )


def metrics_snapshot() -> dict[str, Any]:
    total = _counters["diagnose_total"] or 0
    ungrounded = _counters["ungrounded"]
    return {
        "service": "loglens-ai",
        "diagnose": {
            "total": _counters["diagnose_total"],
            "errors": _counters["diagnose_errors"],
            "ungrounded": ungrounded,
            "ungroundedRate": 0 if total == 0 else ungrounded / total,
        },
    }
