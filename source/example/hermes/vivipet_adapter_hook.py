#!/usr/bin/env python3
"""Hermes shell hook -> ViviPet Adapter.

Reads Hermes hook JSON from stdin, posts a normalized Adapter event to ViviPet,
and always prints `{}` so Hermes can continue. Uses only Python stdlib.

Environment overrides:
  VIVIPET_ADAPTER_URL        default: http://127.0.0.1:18765/adapter
  VIVIPET_HOOK_AGENT         default: hermes
  VIVIPET_TTS_ON_SESSION_END default: 0
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


TOOL_LABELS = {
    "terminal": "terminal",
    "shell": "terminal",
    "bash": "terminal",
    "zsh": "terminal",
    "read_file": "reading",
    "read": "reading",
    "search": "searching",
    "grep": "searching",
    "rg": "searching",
    "write_file": "coding",
    "edit": "coding",
}


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def read_hook_payload() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return as_dict(parsed)


def pick_tool_name(hook: dict[str, Any]) -> str | None:
    tool = hook.get("tool")
    if isinstance(tool, dict):
        name = tool.get("name")
        if isinstance(name, str) and name:
            return name

    for key in ("tool_name", "matcher"):
        value = hook.get(key)
        if isinstance(value, str) and value:
            return value

    return None


def pick_text(event_name: str, hook: dict[str, Any]) -> str | None:
    if event_name == "on_session_start":
        return "Hermes session started."
    if event_name in ("on_session_end", "on_session_finalize"):
        return "Hermes session finished."
    if event_name == "post_tool_call" and hook.get("error"):
        return "Tool call failed."
    return None


def pick_tts(event_name: str) -> bool | dict[str, bool]:
    if event_name in ("on_session_end", "on_session_finalize"):
        if os.environ.get("VIVIPET_TTS_ON_SESSION_END") == "1":
            return {"enabled": True}
    return False


def build_adapter_payload(hook: dict[str, Any]) -> dict[str, Any]:
    event_name = hook.get("hook_event_name")
    if not isinstance(event_name, str) or not event_name:
        event_name = "unknown"

    tool_name = pick_tool_name(hook)
    session_id = hook.get("session_id") or hook.get("sessionId")
    cwd = hook.get("cwd")

    payload: dict[str, Any] = {
        "agent": os.environ.get("VIVIPET_HOOK_AGENT", "hermes"),
        "phase": event_name,
        "kind": TOOL_LABELS.get(tool_name, tool_name) if tool_name else None,
        "sessionId": session_id if isinstance(session_id, str) else None,
        "text": pick_text(event_name, hook),
        "tts": pick_tts(event_name),
        "metadata": {
            "cwd": cwd if isinstance(cwd, str) else None,
            "hook_event_name": event_name,
            "tool_name": tool_name,
            "raw": hook,
        },
    }

    return {key: value for key, value in payload.items() if value is not None}


def post_to_vivipet(payload: dict[str, Any]) -> None:
    url = os.environ.get("VIVIPET_ADAPTER_URL", "http://127.0.0.1:18765/adapter")
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=2).close()
    except (OSError, urllib.error.URLError, urllib.error.HTTPError):
        # ViviPet should never block Hermes if it is closed or unavailable.
        return


def main() -> int:
    hook = read_hook_payload()
    post_to_vivipet(build_adapter_payload(hook))
    sys.stdout.write("{}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

