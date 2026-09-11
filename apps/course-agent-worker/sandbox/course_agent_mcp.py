#!/usr/bin/env python3
"""Minimal stdio MCP bridge for the approval-gated push_sync tool."""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.error
import urllib.request
from typing import Any


def _git_raw(*args: str) -> str:
    result = subprocess.run(["git", *args], text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} failed:\n{result.stdout}\n{result.stderr}".strip()
        )
    return result.stdout


def _git(*args: str) -> str:
    return _git_raw(*args).strip()


def _proposal() -> dict[str, Any]:
    if _git("status", "--porcelain"):
        raise RuntimeError("Commit all intended changes before calling push_sync")
    if "Co-authored-by: PrairieLearn Agent (Codex)" not in _git_raw(
        "log", "-1", "--pretty=%B"
    ):
        raise RuntimeError(
            "The commit must include the PrairieLearn Agent (Codex) co-author trailer"
        )
    branch = _git("branch", "--show-current")
    proposed_sha = _git("rev-parse", "HEAD")
    base_sha = _git("rev-parse", f"origin/{branch}")
    commit_message = _git_raw("log", "-1", "--pretty=%B").strip()
    fast_forward = subprocess.run(
        ["git", "merge-base", "--is-ancestor", base_sha, proposed_sha],
        text=True,
        capture_output=True,
        check=False,
    )
    if fast_forward.returncode != 0:
        detail = f"{fast_forward.stdout}\n{fast_forward.stderr}".strip()
        raise RuntimeError(
            "The proposed commit cannot be fast-forwarded from the workspace's "
            f"remote base {base_sha}. Fetch and reconcile the branch, then call "
            f"push_sync again.{f' Git reported: {detail}' if detail else ''}"
        )
    return {
        "branch": branch,
        "baseSha": base_sha,
        "proposedSha": proposed_sha,
        "commitMessage": commit_message,
        "treeSha": _git("rev-parse", "HEAD^{tree}"),
        "diffSummary": _git("diff", "--stat", f"{base_sha}..{proposed_sha}"),
        "diff": _git_raw(
            "diff", "--binary", "--no-ext-diff", f"{base_sha}..{proposed_sha}"
        ),
    }


def _push_sync() -> dict[str, Any]:
    payload = _proposal()
    request = urllib.request.Request(
        "http://course-agent.internal/push-sync",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    result: dict[str, Any]
    details: dict[str, Any]
    try:
        with urllib.request.urlopen(request) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        body = error.read().decode()
        error.close()
        try:
            details = json.loads(body)
        except json.JSONDecodeError:
            details = {"error": body}
        result = {
            "ok": False,
            **(details.get("details") or {}),
            "error": f"Push/sync failed ({error.code}): {details.get('error', body)}",
        }
    if result.get("ok") or result.get("published"):
        sha = result.get("commitSha")
        if sha:
            try:
                _git("fetch", "origin", payload["branch"])
                _git("merge", "--no-edit", sha)
            except RuntimeError as error:
                result["checkoutWarning"] = (
                    f"Publication already occurred, but the workspace needs reconciliation: {error}. "
                    "Preserve local work and resolve this before making further edits."
                )
    return result


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
                        "description": "Validate the committed course changes using PrairieLearn, request instructor approval, then push and sync. A denial is not approval; fix reported errors before submitting a new proposal.",
                        "inputSchema": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {},
                        },
                    },
                ]
            },
        )
    if method == "tools/call":
        try:
            params = message.get("params", {})
            name = params.get("name")
            if name == "push_sync":
                value = _push_sync()
            else:
                raise RuntimeError(f"Unknown tool: {name}")
            result = {
                "content": [{"type": "text", "text": json.dumps(value)}],
                "structuredContent": value,
                "isError": bool(value.get("error")),
            }
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


if __name__ == "__main__":
    if sys.argv[1:] == ["--propose"]:
        print(json.dumps(_proposal()))
        sys.exit(0)
    for line in sys.stdin:
        message = json.loads(line)
        result = _handle(message)
        if result is not None:
            print(json.dumps(result, separators=(",", ":")), flush=True)
