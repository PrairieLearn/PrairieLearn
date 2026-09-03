#!/usr/bin/env python3
"""Minimal stdio MCP bridge for the approval-gated push_sync tool."""

from __future__ import annotations

import json
import pathlib
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


def _validate_course() -> dict[str, Any]:
    result = subprocess.run(
        ["validate-course", "."], text=True, capture_output=True, check=False
    )
    output = f"{result.stdout}\n{result.stderr}".strip()
    if result.returncode != 0:
        raise RuntimeError(output)
    return {"ok": True, "output": output}


def _render_question_variant(qid: str) -> dict[str, Any]:
    _validate_course()
    root = pathlib.Path.cwd().resolve()
    question = (root / "questions" / qid).resolve()
    if root not in question.parents or not question.is_dir():
        raise RuntimeError("Question not found")
    if not (question / "question.html").is_file():
        raise RuntimeError("question.html is missing")
    script = """
import importlib.util, json, pathlib, sys
path = pathlib.Path(sys.argv[1])
data = {"params": {}, "correct_answers": {}, "options": {}, "variant_seed": 1}
server = path / "server.py"
if server.exists():
    spec = importlib.util.spec_from_file_location("course_agent_question", server)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if hasattr(module, "generate"):
        module.generate(data)
print(json.dumps({"params": data["params"], "correct_answers": data["correct_answers"]}, default=str))
"""
    result = subprocess.run(
        ["python3", "-c", script, str(question)],
        text=True,
        capture_output=True,
        check=False,
        cwd=question,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return {"ok": True, "qid": qid, "variant": json.loads(result.stdout)}


def _push_sync() -> dict[str, Any]:
    _validate_course()
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
    subprocess.run(
        ["git", "merge-base", "--is-ancestor", base_sha, proposed_sha], check=True
    )
    payload = {
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
                        "name": "validate_course",
                        "description": "Run static validation across the current PrairieLearn course checkout.",
                        "inputSchema": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {},
                        },
                    },
                    {
                        "name": "render_question_variant",
                        "description": "Smoke-test generation of one question variant after validating the course.",
                        "inputSchema": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["qid"],
                            "properties": {"qid": {"type": "string"}},
                        },
                    },
                    {
                        "name": "push_sync",
                        "description": "Submit the current committed diff for instructor approval, then wait for PrairieLearn to push and sync it.",
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
            arguments = params.get("arguments", {})
            if name == "validate_course":
                value = _validate_course()
            elif name == "render_question_variant":
                value = _render_question_variant(arguments.get("qid", ""))
            elif name == "push_sync":
                value = _push_sync()
            else:
                raise RuntimeError(f"Unknown tool: {name}")
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
