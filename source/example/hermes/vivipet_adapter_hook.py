#!/usr/bin/env python3
"""Hermes shell hook -> ViviPet Adapter.

Reads Hermes hook JSON from stdin, posts a normalized Adapter event to ViviPet,
and always prints `{}` so Hermes can continue. Uses only Python stdlib.

Recommended event flow:
  on_session_start     -> session:start  + thinking
  pre_llm_call         -> session:update + thinking
  pre_tool_call        -> tool:start     + reading/coding/terminal/testing/...
  post_tool_call(ok)   -> tool:success   + keep current pose
  post_tool_call(error)-> tool:error     + error moment
  post_llm_call        -> message        + speaking
  on_session_end       -> session:end    + success moment

The hook reports semantic task phases only. ViviPet decides expression, props,
speech bubbles, AI planning, motion fallback, and Live2D parameters internally.

Environment overrides:
  VIVIPET_ADAPTER_URL        default: http://127.0.0.1:18765/adapter
  VIVIPET_HOOK_AGENT         default: hermes
  VIVIPET_HOOK_SESSION_TTL   default: 45000
  VIVIPET_TTS_ON_SESSION_END default: 0
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


TOOL_KINDS = {
    "terminal": "terminal",
    "shell": "terminal",
    "bash": "terminal",
    "zsh": "terminal",
    "exec": "terminal",
    "exec_command": "terminal",
    "read_file": "reading",
    "read": "reading",
    "open": "reading",
    "cat": "reading",
    "search": "searching",
    "grep": "searching",
    "rg": "searching",
    "find": "searching",
    "write_file": "coding",
    "apply_patch": "coding",
    "edit": "coding",
    "patch": "coding",
    "test": "testing",
    "tests": "testing",
    "pytest": "testing",
    "vitest": "testing",
    "jest": "testing",
    "npm test": "testing",
}

ACTION_PRIORITIES = {
    "error": 100,
    "testing": 80,
    "terminal": 70,
    "coding": 60,
    "reading": 50,
    "searching": 45,
    "speaking": 40,
    "thinking": 30,
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


def normalize_tool_kind(tool_name: str | None) -> str | None:
    if not tool_name:
        return None
    normalized = tool_name.strip().lower().replace("-", "_")
    if normalized in TOOL_KINDS:
        return TOOL_KINDS[normalized]
    if "test" in normalized:
        return "testing"
    if any(part in normalized for part in ("bash", "shell", "terminal", "command", "exec")):
        return "terminal"
    if any(part in normalized for part in ("write", "edit", "patch", "save")):
        return "coding"
    if any(part in normalized for part in ("read", "open", "list")):
        return "reading"
    if any(part in normalized for part in ("search", "grep", "find", "rg")):
        return "searching"
    return normalized


def action_for_kind(kind: str | None) -> str:
    if kind in {"reading", "searching", "coding", "terminal", "testing"}:
        return kind
    return "coding"


def hook_has_error(hook: dict[str, Any]) -> bool:
    if hook.get("error"):
        return True
    status = hook.get("status") or hook.get("result")
    return isinstance(status, str) and status.lower() in {"error", "failed", "failure"}


def pick_text(event_name: str, hook: dict[str, Any], action: str | None) -> str | None:
    message = hook.get("message") or hook.get("text") or hook.get("summary")
    if isinstance(message, str) and message.strip():
        return message.strip()

    if event_name == "on_session_start":
        return "我开始处理这个任务。"
    if event_name in ("on_session_end", "on_session_finalize"):
        return "任务处理完成。"
    if event_name == "post_tool_call" and hook_has_error(hook):
        return "工具调用失败了，我看一下原因。"
    if event_name == "pre_tool_call":
        labels = {
            "reading": "我在读取上下文。",
            "searching": "我在查找相关信息。",
            "coding": "我在修改代码。",
            "terminal": "我在执行命令。",
            "testing": "我在运行测试。",
        }
        return labels.get(action or "")
    return None


def pick_tts(event_name: str) -> bool | dict[str, bool]:
    if event_name in ("on_session_end", "on_session_finalize"):
        if os.environ.get("VIVIPET_TTS_ON_SESSION_END") == "1":
            return {"enabled": True}
    return False


def session_ttl_ms(action: str | None) -> int:
    default = int(os.environ.get("VIVIPET_HOOK_SESSION_TTL", "45000"))
    if action == "terminal":
        return max(default, 60000)
    if action == "testing":
        return max(default, 90000)
    return default


def classify_event(event_name: str, hook: dict[str, Any], kind: str | None) -> tuple[str, str | None]:
    if event_name == "on_session_start":
        return "session:start", "thinking"
    if event_name in ("on_session_end", "on_session_finalize"):
        return "session:end", "success"
    if event_name == "pre_llm_call":
        return "session:update", "thinking"
    if event_name == "post_llm_call":
        return "message", "speaking"
    if event_name == "pre_tool_call":
        return "tool:start", action_for_kind(kind)
    if event_name == "post_tool_call":
        if hook_has_error(hook):
            return "tool:error", "error"
        return "tool:success", None
    return "session:update", "thinking"


def build_adapter_payload(hook: dict[str, Any]) -> dict[str, Any]:
    event_name = hook.get("hook_event_name")
    if not isinstance(event_name, str) or not event_name:
        event_name = "unknown"

    tool_name = pick_tool_name(hook)
    kind = normalize_tool_kind(tool_name)
    phase, action = classify_event(event_name, hook, kind)
    session_id = hook.get("session_id") or hook.get("sessionId")
    cwd = hook.get("cwd")
    ttl_ms = session_ttl_ms(action)

    payload: dict[str, Any] = {
        "agent": os.environ.get("VIVIPET_HOOK_AGENT", "hermes"),
        "phase": phase,
        "action": action,
        "kind": kind,
        "sessionId": session_id if isinstance(session_id, str) else None,
        "text": pick_text(event_name, hook, action),
        "ttlMs": ttl_ms if action and phase not in ("session:end", "tool:error") else None,
        "priority": ACTION_PRIORITIES.get(action or ""),
        "tts": pick_tts(event_name),
        "metadata": {
            "cwd": cwd if isinstance(cwd, str) else None,
            "hook_event_name": event_name,
            "tool_name": tool_name,
            "normalized_phase": phase,
            "normalized_action": action,
            "normalized_kind": kind,
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
