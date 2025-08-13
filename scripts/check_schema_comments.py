#!/usr/bin/env python3

"""
Check for fields that have a $ref whose target has a description/comment,
while the referencing field itself is missing a description/comment.

- Supports internal JSON Pointer references (e.g., "#/$defs/Foo").
- Uses BFS to follow $ref chains, tracking visited refs to avoid cycles.
- Traverses schema recursively to inspect all subschemas (properties, items, anyOf, etc.).

Usage:
  python scripts/check_schema_comments.py /path/to/schema.json

Exit codes:
  0 - No issues found
  1 - Issues found or an error occurred
"""

from __future__ import annotations

import json
import sys
from collections import deque
from collections.abc import Iterable
from pathlib import Path
from typing import Any

Json = dict[str, Any]


def load_schema(path: Path) -> Json:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def json_pointer_unescape(token: str) -> str:
    return token.replace("~1", "/").replace("~0", "~")


def resolve_json_pointer(root: Json, pointer: str) -> Any | None:
    if not pointer.startswith("#"):
        return None
    # empty pointer refers to whole document
    if pointer in ("#", ""):
        return root

    path = pointer[2:] if pointer.startswith("#/") else pointer[1:]
    if not path:
        return root

    current: Any = root
    for raw_token in path.split("/"):
        token = json_pointer_unescape(raw_token)
        if isinstance(current, dict):
            if token in current:
                current = current[token]
            else:
                return None
        elif isinstance(current, list):
            try:
                idx = int(token)
            except ValueError:
                return None
            if 0 <= idx < len(current):
                current = current[idx]
            else:
                return None
        else:
            return None
    return current


def has_comment(node: Any) -> bool:
    if not isinstance(node, dict):
        return False
    # Consider multiple keys as "comment" indicators
    return any(
        k in node and isinstance(node[k], str) and node[k].strip()
        for k in ("description", "$comment", "comment")
    )


def iter_subschemas(node: Any) -> Iterable[tuple[str, Any]]:
    """Yield (key, subschema) pairs for locations that may contain subschemas."""
    if not isinstance(node, dict):
        return

    # Standard containers
    if isinstance(node.get("properties"), dict):
        for prop_key, sub in node["properties"].items():
            yield f"properties/{prop_key}", sub

    if isinstance(node.get("patternProperties"), dict):
        for prop_key, sub in node["patternProperties"].items():
            yield f"patternProperties/{prop_key}", sub

    if "additionalProperties" in node and isinstance(
        node["additionalProperties"], (dict, list)
    ):
        yield "additionalProperties", node["additionalProperties"]

    if "items" in node:
        items = node["items"]
        if isinstance(items, list):
            for idx, sub in enumerate(items):
                yield f"items/{idx}", sub
        elif isinstance(items, dict):
            yield "items", items

    for keyword in ("allOf", "anyOf", "oneOf"):
        if isinstance(node.get(keyword), list):
            for idx, sub in enumerate(node[keyword]):
                yield f"{keyword}/{idx}", sub

    for keyword in ("if", "then", "else", "not"):
        if isinstance(node.get(keyword), dict):
            yield keyword, node[keyword]

    # Definitions containers (we still traverse them, but we won't treat them as violations directly)
    for defs_key in ("$defs", "definitions", "components"):
        sub = node.get(defs_key)
        if isinstance(sub, dict):
            if defs_key == "components" and isinstance(sub.get("schemas"), dict):
                for k, v in sub["schemas"].items():
                    yield f"components/schemas/{k}", v
            else:
                for k, v in sub.items():
                    yield f"{defs_key}/{k}", v


def bfs_ref_has_comment(ref: str, root: Json) -> bool:
    """Return True if any schema reachable via $ref chains contains a comment/description."""
    queue: deque[str] = deque([ref])
    visited: set[str] = set()

    while queue:
        current_ref = queue.popleft()
        if current_ref in visited:
            continue
        visited.add(current_ref)

        target = resolve_json_pointer(root, current_ref)
        if target is None:
            # Unsupported or invalid ref; skip
            continue

        if has_comment(target):
            return True

        # Follow nested $ref(s) and composition keywords inside the target
        if isinstance(target, dict):
            if "$ref" in target and isinstance(target["$ref"], str):
                queue.append(target["$ref"])
            for key in ("allOf", "anyOf", "oneOf"):
                if isinstance(target.get(key), list):
                    for sub in target[key]:
                        if (
                            isinstance(sub, dict)
                            and "$ref" in sub
                            and isinstance(sub["$ref"], str)
                        ):
                            queue.append(sub["$ref"])
    return False


def is_definition_path(path_parts: list[str]) -> bool:
    # Treat these roots as definition locations
    if not path_parts:
        return False
    root = path_parts[0]
    if root in ("$defs", "definitions"):
        return True
    if root == "components" and len(path_parts) >= 2 and path_parts[1] == "schemas":
        return True
    return False


def to_json_pointer(path_parts: list[str]) -> str:
    def esc(token: str) -> str:
        return token.replace("~", "~0").replace("/", "~1")

    return "#/" + "/".join(esc(p) for p in path_parts)


def check_schema(schema: Json) -> list[tuple[str, str]]:
    """Return list of (json_pointer, ref) for violations found."""
    violations: list[tuple[str, str]] = []

    def visit(node: Any, path_parts: list[str]) -> None:
        if not isinstance(node, dict):
            # Nothing to do
            return

        # If this node has a $ref, and THIS node lacks a comment, but the ref target chain has a comment -> violation
        ref_val = node.get("$ref")
        if isinstance(ref_val, str):
            if not has_comment(node) and bfs_ref_has_comment(ref_val, schema):
                # Avoid flagging definition entries themselves; only flag usage sites
                if not is_definition_path(path_parts):
                    violations.append((to_json_pointer(path_parts), ref_val))

        # Recurse into subschemas
        for key, sub in iter_subschemas(node):
            visit(sub, path_parts + [key])

    visit(schema, [])
    return violations


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(
            "Usage: python scripts/check_schema_comments.py /path/to/schema.json",
            file=sys.stderr,
        )
        return 1

    schema_path = Path(argv[1])
    if not schema_path.exists():
        print(f"File not found: {schema_path}", file=sys.stderr)
        return 1

    try:
        schema = load_schema(schema_path)
    except Exception as e:
        print(f"Failed to read JSON schema: {e}", file=sys.stderr)
        return 1

    violations = check_schema(schema)

    if not violations:
        print("No issues found.")
        return 0

    print(
        "Found fields that reference a schema with a comment but lack a local description/comment:"
    )
    for path_ptr, ref in violations:
        print(f"- path: {path_ptr}  ref: {ref}")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
