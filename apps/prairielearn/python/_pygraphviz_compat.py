"""Temporary executor compatibility patch for PyGraphviz file-like output."""

import os
from functools import wraps
from typing import Any

import pygraphviz


def patch_pygraphviz() -> None:
    """Restore Python-level writes for PyGraphviz file-like outputs."""
    # PyGraphviz 2.0 passes file-like outputs to a FILE* typemap that segfaults
    # for BytesIO: https://github.com/pygraphviz/pygraphviz/issues/548
    # Render to bytes and use Python's write() as 1.14 did. Remove this workaround
    # once PL upgrades to a PyGraphviz release containing the upstream fix:
    # https://github.com/pygraphviz/pygraphviz/pull/661
    original_draw = pygraphviz.AGraph.draw

    @wraps(original_draw)
    def draw(
        self: pygraphviz.AGraph,
        path: Any = None,
        format: str | None = None,  # ruff:ignore[builtin-argument-shadowing]
        prog: str | None = None,
        args: str = "",
    ) -> bytes | None:
        if hasattr(path, "write"):
            # Preserve upstream's format inference for named file objects.
            output_format = format
            if output_format is None:
                output_format = os.path.splitext(path.name)[-1].lower()[1:]
            path.write(original_draw(self, format=output_format, prog=prog, args=args))
            return None
        return original_draw(self, path=path, format=format, prog=prog, args=args)

    pygraphviz.AGraph.draw = draw
