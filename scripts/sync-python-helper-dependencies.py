#!/usr/bin/env python3
"""Sync the install dependencies for the PrairieLearn Python helper package."""

from __future__ import annotations

import argparse
import ast
import difflib
import re
import sys
import tomllib
from enum import Enum
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
ROOT_PYPROJECT_PATH = REPOSITORY_ROOT / "pyproject.toml"
HELPER_PYPROJECT_PATH = REPOSITORY_ROOT / "apps/prairielearn/python/pyproject.toml"
# Only derive dependencies for the installed helper package. Deprecated
# top-level modules next to this package are intentionally not included.
HELPER_PACKAGE_ROOT = REPOSITORY_ROOT / "apps/prairielearn/python/prairielearn"


class SyncResult(Enum):
    """Result of syncing helper dependencies."""

    IN_SYNC = "in_sync"
    OUT_OF_SYNC = "out_of_sync"
    UPDATED = "updated"


def normalize_package_name(name: str) -> str:
    """Normalize a Python package name according to PEP 503."""
    return re.sub(r"[-_.]+", "-", name).lower()


def dependency_name(dependency: str) -> str:
    """Extract the package name from a PEP 508 dependency string."""
    match = re.match(r"\s*([A-Za-z0-9][A-Za-z0-9._-]*)", dependency)
    if match is None:
        raise ValueError(f"Could not parse dependency name from {dependency!r}")
    return normalize_package_name(match.group(1))


def root_dependencies_by_name() -> dict[str, str]:
    """Return root project dependencies keyed by normalized package name."""
    data = tomllib.loads(ROOT_PYPROJECT_PATH.read_text())
    dependencies = data["project"]["dependencies"]

    dependencies_by_name: dict[str, str] = {}
    for dependency in dependencies:
        name = dependency_name(dependency)
        if name in dependencies_by_name:
            raise ValueError(f"Duplicate dependency in root pyproject.toml: {name}")
        dependencies_by_name[name] = dependency

    return dependencies_by_name


def imported_modules(path: Path) -> set[str]:
    """Return top-level modules imported by a Python file."""
    tree = ast.parse(path.read_text(), filename=str(path))
    modules: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name.split(".", maxsplit=1)[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            modules.add(node.module.split(".", maxsplit=1)[0])

    return modules


def helper_imports() -> set[str]:
    """Return third-party modules imported by the helper package."""
    imports: set[str] = set()

    for path in HELPER_PACKAGE_ROOT.rglob("*.py"):
        imports.update(imported_modules(path))

    return {
        module
        for module in imports
        if module not in sys.stdlib_module_names and module != "prairielearn"
    }


def helper_dependencies() -> list[str]:
    """Return helper package dependencies using versions from the root project."""
    dependencies_by_name = root_dependencies_by_name()
    dependencies: list[str] = []

    for module_name in sorted(helper_imports()):
        normalized_name = normalize_package_name(module_name)
        dependency = dependencies_by_name.get(normalized_name)
        if dependency is None:
            raise ValueError(
                f"{module_name!r} is imported by the helper package, but no matching "
                "dependency is present in the root pyproject.toml"
            )
        dependencies.append(dependency)

    return dependencies


def render_dependencies_block(dependencies: list[str]) -> list[str]:
    """Render a TOML dependencies block."""
    lines = ["dependencies = [\n"]
    lines.extend(f'  "{dependency}",\n' for dependency in dependencies)
    lines.append("]\n")
    return lines


def replace_project_dependencies(contents: str, dependencies: list[str]) -> str:
    """Replace the [project] dependencies array in a pyproject.toml file."""
    lines = contents.splitlines(keepends=True)

    project_index = next(
        (index for index, line in enumerate(lines) if line.strip() == "[project]"),
        None,
    )
    if project_index is None:
        raise ValueError("Could not find [project] table")

    dependencies_start = None
    next_table_index = len(lines)
    for index in range(project_index + 1, len(lines)):
        stripped_line = lines[index].strip()
        if stripped_line.startswith("[") and stripped_line.endswith("]"):
            next_table_index = index
            break
        if stripped_line == "dependencies = [":
            dependencies_start = index
            break

    if dependencies_start is None:
        raise ValueError("Could not find [project].dependencies array")

    dependencies_end = None
    for index in range(dependencies_start + 1, next_table_index):
        if lines[index].strip() == "]":
            dependencies_end = index + 1
            break

    if dependencies_end is None:
        raise ValueError("Could not find end of [project].dependencies array")

    new_lines = (
        lines[:dependencies_start]
        + render_dependencies_block(dependencies)
        + lines[dependencies_end:]
    )
    return "".join(new_lines)


def sync_helper_pyproject(*, check: bool) -> SyncResult:
    """Sync or check helper package dependencies."""
    current_contents = HELPER_PYPROJECT_PATH.read_text()
    new_contents = replace_project_dependencies(current_contents, helper_dependencies())

    if current_contents == new_contents:
        return SyncResult.IN_SYNC

    if check:
        diff = difflib.unified_diff(
            current_contents.splitlines(keepends=True),
            new_contents.splitlines(keepends=True),
            fromfile=str(HELPER_PYPROJECT_PATH),
            tofile=f"{HELPER_PYPROJECT_PATH} (expected)",
        )
        sys.stdout.writelines(diff)
        print(
            "\nPython helper dependencies are out of sync. "
            "Run `make update-python-helper-dependencies` and commit the result.",
            file=sys.stderr,
        )
        return SyncResult.OUT_OF_SYNC

    HELPER_PYPROJECT_PATH.write_text(new_contents)
    return SyncResult.UPDATED


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description=(
            "Sync apps/prairielearn/python/pyproject.toml dependency versions "
            "from the root pyproject.toml."
        )
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check that dependencies are already synchronized without writing.",
    )
    return parser.parse_args()


def main() -> int:
    """Run the dependency sync."""
    args = parse_args()
    result = sync_helper_pyproject(check=args.check)
    return 1 if result == SyncResult.OUT_OF_SYNC else 0


if __name__ == "__main__":
    raise SystemExit(main())
