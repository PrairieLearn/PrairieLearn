#!/usr/bin/env python3
"""Check that shared Python dependencies have consistent pins across images."""

import re
import tomllib
from collections import defaultdict
from collections.abc import Iterator
from pathlib import Path

MANIFEST_DIRECTORIES = (
    "apps/*/python",
    "docs",
    "graders/*",
    "images/*",
    "workspaces/*",
)
# Conditional requirements can intentionally select different versions for different
# environments. Compare only unconditional exact pins, not ranges or wildcards.
EXACT_PIN = re.compile(
    r"([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[A-Za-z0-9,._\s-]+\])?\s*==\s*([A-Za-z0-9.!+_-]+)"
)


def manifest_paths(root: Path) -> Iterator[Path]:
    """Find manifests in maintained application and image directories."""
    directories = [root]
    for pattern in MANIFEST_DIRECTORIES:
        directories.extend(root.glob(pattern))
    for directory in sorted(directories):
        yield from sorted(directory.glob("pyproject.toml"))
        yield from sorted(directory.glob("requirements*.txt"))


def requirements(path: Path) -> Iterator[str]:
    """Read direct dependencies without resolving or installing any packages."""
    if path.suffix != ".toml":
        yield from path.read_text().splitlines()
        return

    data = tomllib.loads(path.read_text())
    project = data.get("project", {})
    yield from project.get("dependencies", [])
    for dependencies in project.get("optional-dependencies", {}).values():
        yield from dependencies
    for dependencies in data.get("dependency-groups", {}).values():
        for dependency in dependencies:
            # Included groups are already visited independently.
            if isinstance(dependency, str):
                yield dependency


def check_dependencies(root: Path) -> int:
    """Report inconsistent pins and return a nonzero exit code if any are found."""
    pins: dict[str, set[tuple[str, str]]] = defaultdict(set)
    paths = list(manifest_paths(root))
    for path in paths:
        for requirement in requirements(path):
            match = EXACT_PIN.fullmatch(requirement.partition("#")[0].strip())
            if match is None:
                continue
            name = re.sub(r"[-_.]+", "-", match[1]).lower()
            pins[name].add((str(path.relative_to(root)), match[2]))

    inconsistent = False
    for name, locations in sorted(pins.items()):
        if len({version for _, version in locations}) <= 1:
            continue
        inconsistent = True
        print(f"Inconsistent versions of {name}:")
        for path, version in sorted(locations):
            print(f"  {path}: {version}")

    if inconsistent:
        print(
            "\nUpdate all listed pins for each dependency together, then run "
            "`uv lock` if pyproject.toml changed. "
            "Re-run `make check-python-dependencies` to verify."
        )
        return 1

    print(f"Python dependency pins are consistent across {len(paths)} manifests.")
    return 0


if __name__ == "__main__":
    raise SystemExit(check_dependencies(Path(__file__).resolve().parents[1]))
