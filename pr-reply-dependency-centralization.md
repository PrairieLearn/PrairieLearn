Codex looked into a few ways to avoid manually maintaining a second dependency list here.

The options it found:

- **uv workspaces:** useful for sharing one lockfile/resolution context across multiple Python packages in a repo, but each workspace member still owns its own package metadata. It would **not** make `apps/prairielearn/python` inherit `project.dependencies` in a way that `pip` understands for a VCS subdirectory install.
- **setuptools dynamic dependencies from a requirements file:** possible via `dynamic = ["dependencies"]` and `[tool.setuptools.dynamic]`, but that mostly **moves the duplicate list** to a different file unless we generate that file from the root metadata.
- **Generate/check the helper package dependency list from the root `pyproject.toml`:** this keeps the subdirectory package independently installable for `pip`/`uv`, while making the root `pyproject.toml` the source of truth for dependency versions.

I tried the third approach in this PR. The new `scripts/sync-python-helper-dependencies.py` script derives the helper package's dependency set by AST-scanning imports under `apps/prairielearn/python/prairielearn`, filters out stdlib/self imports, and then looks up the matching pinned dependency specifiers from the root `pyproject.toml`. It intentionally ignores deprecated top-level modules next to the package, since those are no longer installed.

This gives us two useful workflows:

- `uv run python scripts/sync-python-helper-dependencies.py` updates `apps/prairielearn/python/pyproject.toml` from the root dependency pins.
- `make check-python-helper-dependencies` runs the same script with `--check`, so CI fails if the helper metadata drifts from what the source imports and root pins imply.

That seems like the best compromise to me: the subdirectory remains a normal installable Python package, but version pinning stays centralized in the root `pyproject.toml`, and CI guards against drift.

Addressed in 18efdad44.
