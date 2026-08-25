#!/usr/bin/env python3
"""Minimal stdio MCP bridge for structured PrairieLearn course data."""

from __future__ import annotations

import json
import sys
from typing import Any

from prairielearn_data import (
    CourseDataError,
    describe_resource,
    list_resources,
    materialize_query,
    result_directory,
)

RESOURCE_NAMES = [
    "course_instances",
    "students",
    "assessments",
    "assessment_attempts",
]

FILTER_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["field", "op", "value"],
    "properties": {
        "field": {"type": "string"},
        "op": {
            "enum": ["eq", "ne", "lt", "lte", "gt", "gte", "in", "contains", "is_null"]
        },
        "value": {},
    },
}

QUERY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["resource"],
    "properties": {
        "resource": {"enum": RESOURCE_NAMES},
        "select": {"type": "array", "items": {"type": "string"}, "maxItems": 30},
        "where": {"type": "array", "items": FILTER_SCHEMA, "maxItems": 30},
        "groupBy": {"type": "array", "items": {"type": "string"}, "maxItems": 10},
        "metrics": {
            "type": "array",
            "maxItems": 10,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["op", "as"],
                "properties": {
                    "op": {
                        "enum": ["count", "count_distinct", "sum", "min", "max", "avg"]
                    },
                    "field": {"type": "string"},
                    "as": {"type": "string"},
                },
            },
        },
        "orderBy": {
            "type": "array",
            "maxItems": 10,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["field", "direction"],
                "properties": {
                    "field": {"type": "string"},
                    "direction": {"enum": ["asc", "desc"]},
                },
            },
        },
        "limit": {"type": "integer", "minimum": 1, "maximum": 50000},
    },
}

TOOLS = [
    {
        "name": "list_course_data_resources",
        "description": "List the course-scoped PrairieLearn data resources available for structured querying.",
        "inputSchema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {},
        },
    },
    {
        "name": "describe_course_data_resource",
        "description": "Describe one resource's fields, types, filter operators, and aggregate support.",
        "inputSchema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["resource"],
            "properties": {"resource": {"enum": RESOURCE_NAMES}},
        },
    },
    {
        "name": "query_course_data",
        "description": (
            "Run a structured read-only query scoped to the current course. Returns a small preview "
            "and writes the complete bounded result to /workspace/data/<query-id>/result.json. "
            "No SQL, caller-defined joins, or course ID are accepted."
        ),
        "inputSchema": QUERY_SCHEMA,
    },
    {
        "name": "get_course_data_result",
        "description": "Reopen a previously materialized course-data result by query ID.",
        "inputSchema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["queryId"],
            "properties": {"queryId": {"type": "string"}},
        },
    },
]


def text_result(value: Any, *, is_error: bool = False) -> dict[str, Any]:
    """Encode a JSON-compatible value as MCP text content."""
    result: dict[str, Any] = {
        "content": [{"type": "text", "text": json.dumps(value, indent=2, default=str)}]
    }
    if is_error:
        result["isError"] = True
    return result


def call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Dispatch one allowlisted course-data MCP tool."""
    if name == "list_course_data_resources":
        return text_result({"resources": list_resources()})
    if name == "describe_course_data_resource":
        return text_result(describe_resource(arguments["resource"]))
    if name == "query_course_data":
        query = {
            "resource": arguments["resource"],
            "select": arguments.get("select", []),
            "where": arguments.get("where", []),
            "groupBy": arguments.get("groupBy", []),
            "metrics": arguments.get("metrics", []),
            "orderBy": arguments.get("orderBy", []),
            "limit": arguments.get("limit", 1000),
        }
        response, artifact_path = materialize_query(query)
        return text_result({
            "queryId": response["queryId"],
            "resource": response["resource"],
            "columns": response["columns"],
            "rowCount": response["rowCount"],
            "truncated": response["truncated"],
            "preview": response["rows"][:20],
            "artifactPath": str(artifact_path),
        })
    if name == "get_course_data_result":
        query_id = arguments["queryId"]
        directory = result_directory(query_id)
        schema = json.loads((directory / "schema.json").read_text())
        artifact_path = directory / "result.json"
        preview = json.loads(artifact_path.read_text())[:20]
        return text_result({
            **schema,
            "preview": preview,
            "artifactPath": str(artifact_path),
        })
    raise CourseDataError(f"Unknown tool: {name}")


def response(request_id: Any, result: Any) -> dict[str, Any]:
    """Build a successful JSON-RPC response."""
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def error_response(request_id: Any, code: int, message: str) -> dict[str, Any]:
    """Build a JSON-RPC error response."""
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


def handle(message: dict[str, Any]) -> dict[str, Any] | None:
    """Handle one MCP JSON-RPC message."""
    method = message.get("method")
    request_id = message.get("id")
    if method == "initialize":
        requested_version = message.get("params", {}).get(
            "protocolVersion", "2024-11-05"
        )
        return response(
            request_id,
            {
                "protocolVersion": requested_version,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "prairielearn-course-data", "version": "0.1.0"},
            },
        )
    if method in {"notifications/initialized", "notifications/cancelled"}:
        return None
    if method == "ping":
        return response(request_id, {})
    if method == "tools/list":
        return response(request_id, {"tools": TOOLS})
    if method == "tools/call":
        params = message.get("params", {})
        try:
            result = call_tool(params.get("name", ""), params.get("arguments", {}))
        except Exception as error:
            print(f"course-data tool failed: {error}", file=sys.stderr, flush=True)
            result = text_result({"error": str(error)}, is_error=True)
        return response(request_id, result)
    if request_id is None:
        return None
    return error_response(request_id, -32601, f"Method not found: {method}")


def main() -> None:
    """Serve newline-delimited MCP messages over standard input/output."""
    for line in sys.stdin:
        try:
            message = json.loads(line)
            result = handle(message)
            if result is not None:
                print(json.dumps(result, separators=(",", ":")), flush=True)
        except Exception as error:
            print(json.dumps(error_response(None, -32603, str(error))), flush=True)


if __name__ == "__main__":
    main()
