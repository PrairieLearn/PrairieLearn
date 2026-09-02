#!/usr/bin/env python3
"""Minimal stdio MCP bridge for the approval-gated push_sync tool."""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
from typing import Any


def _git_raw(*args: str) -> str:
    return subprocess.run(
        ["git", *args], check=True, text=True, capture_output=True
    ).stdout


def _git(*args: str) -> str:
    return _git_raw(*args).strip()


def _push_sync() -> dict[str, Any]:
    if _git("status", "--porcelain"):
        raise RuntimeError("Commit all intended changes before calling push_sync")
    branch = _git("branch", "--show-current")
    proposed_sha = _git("rev-parse", "HEAD")
    base_sha = _git("rev-parse", f"origin/{branch}")
    subprocess.run(
        ["git", "merge-base", "--is-ancestor", base_sha, proposed_sha], check=True
    )
    payload = {
        "branch": branch,
        "baseSha": base_sha,
        "proposedSha": proposed_sha,
        "diffSummary": _git("diff", "--stat", f"{base_sha}..{proposed_sha}"),
        "diff": _git_raw(
            "diff", "--binary", "--no-ext-diff", f"{base_sha}..{proposed_sha}"
        ),
    }
    request = urllib.request.Request(
        "http://course-agent.internal/push-sync",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        return json.load(response)


def _rpc_result(request_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _handle(message: dict[str, Any]) -> dict[str, Any] | None:
    method = message.get("method")
    request_id = message.get("id")
    if method == "initialize":
        return _rpc_result(
            request_id,
            {
                "protocolVersion": message.get("params", {}).get(
                    "protocolVersion", "2024-11-05"
                ),
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "prairielearn-course-agent", "version": "1"},
            },
        )
    if method in {"notifications/initialized", "notifications/cancelled"}:
        return None
    if method == "tools/list":
        return _rpc_result(
            request_id,
            {
                "tools": [
                    {
                        "name": "push_sync",
                        "description": "Submit the current committed diff for instructor approval, then wait for PrairieLearn to push and sync it.",
                        "inputSchema": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {},
                        },
                    }
                ]
            },
        )
    if method == "tools/call":
        try:
            value = _push_sync()
            result = {"content": [{"type": "text", "text": json.dumps(value)}]}
        except Exception as error:
            result = {
                "isError": True,
                "content": [{"type": "text", "text": str(error)}],
            }
        return _rpc_result(request_id, result)
    if request_id is not None:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        }
    return None


for line in sys.stdin:
    message = json.loads(line)
    result = _handle(message)
    if result is not None:
        print(json.dumps(result, separators=(",", ":")), flush=True)
