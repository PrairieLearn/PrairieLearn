import contextlib
import io
import os
import sys
import types
from collections.abc import Callable, Iterator, Sequence


@contextlib.contextmanager
def _suppress_panel_border() -> Iterator[None]:
    """Temporarily strip Rich Panel borders so tracebacks render without a box."""
    from rich.console import Console, ConsoleOptions, RenderResult
    from rich.panel import Panel

    orig = Panel.__rich_console__

    def _borderless(
        self: Panel,
        console: Console,  # noqa: ARG001
        options: ConsoleOptions,  # noqa: ARG001
    ) -> RenderResult:
        # Rich's Traceback wraps its output in a Panel, which adds a
        # box-drawing border.
        # We yield the panel's title and inner renderables directly,
        # skipping the border.
        if self.title:
            yield self.title
        renderable = self.renderable
        items = (
            renderable.renderables  # type: ignore[union-attr]
            if hasattr(renderable, "renderables")
            else [renderable]
        )
        for item in items:
            # Filter out empty-string separators that Rich inserts between frames
            if item != "":
                yield item

    Panel.__rich_console__ = _borderless
    try:
        yield
    finally:
        Panel.__rich_console__ = orig


def _collect_and_clear_notes(exc: BaseException) -> list[str]:
    """Walk the exception chain, collect all __notes__, and clear them.

    Rich has a bug where it reads __notes__ once from the outermost exception
    and applies them to every stack in the chain, causing duplicate display.
    We work around this by stripping notes before Rich sees them and rendering
    them ourselves afterward.

    See https://github.com/Textualize/rich/issues/3960 for context.
    """
    notes: list[str] = []
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        exc_notes = getattr(current, "__notes__", None)
        if exc_notes:
            notes.extend(exc_notes)
            current.__notes__ = []
        current = current.__cause__ or current.__context__
    return notes


def make_rich_excepthook(
    suppress: Sequence[str],
    hide: Sequence[str] = (),
    relative_to: str | None = None,
) -> Callable[[type[BaseException], BaseException, types.TracebackType | None], None]:
    """Create an excepthook that formats tracebacks with syntax highlighting using Rich.

    ``suppress`` is a list of paths whose frames will be dimmed in the traceback
    (source code hidden but frame header still shown).

    ``hide`` is a list of paths whose frames will be removed entirely from the
    traceback output.

    ``relative_to`` is a directory path. If provided, absolute filenames that
    start with this prefix will be shortened to relative paths.
    """
    # Some of these features are now upstream PRs, so we should remove them once they are merged.
    # https://github.com/Textualize/rich/pull/3968
    # https://github.com/Textualize/rich/pull/3969
    # https://github.com/Textualize/rich/pull/3970

    def _hook(
        exc_type: type[BaseException],
        exc_value: BaseException,
        exc_tb: types.TracebackType | None,
    ) -> None:
        try:
            from rich.console import Console
            from rich.theme import Theme
            from rich.traceback import Traceback

            notes = _collect_and_clear_notes(exc_value)

            with _suppress_panel_border():
                console = Console(
                    file=io.StringIO(),
                    force_terminal=True,
                    theme=Theme({"traceback.title": "dim"}),
                    width=300,
                    record=True,
                )
                tb = Traceback.from_exception(
                    exc_type,
                    exc_value,
                    exc_tb,
                    suppress=list(suppress),
                    width=None,
                    code_width=None,
                    word_wrap=False,
                    show_locals=False,
                    indent_guides=False,
                )
                if hide:
                    normalized = [os.path.normpath(os.path.abspath(p)) for p in hide]
                    for stack in tb.trace.stacks:
                        stack.frames = [
                            f
                            for f in stack.frames
                            if not any(f.filename.startswith(p) for p in normalized)
                        ]

                if relative_to:
                    # Rewrite the filenames for display purposes.
                    prefix = os.path.normpath(os.path.abspath(relative_to)) + os.sep
                    for stack in tb.trace.stacks:
                        for frame in stack.frames:
                            frame.filename = frame.filename.removeprefix(prefix)
                    tb.suppress = [p.removeprefix(prefix) for p in tb.suppress]

                    # chdir so os.path.exists and linecache resolve
                    # the shortened relative paths during rendering.
                    # Otherwise, the rewritten paths won't be resolved correctly.
                    old_cwd = os.getcwd()
                    os.chdir(relative_to)
                    try:
                        console.print(tb, soft_wrap=True)
                    finally:
                        os.chdir(old_cwd)
                else:
                    console.print(tb, soft_wrap=True)
                for note in notes:
                    from rich.text import Text

                    console.print(
                        Text.assemble(("[NOTE] ", "traceback.note"), note),
                        highlight=False,
                    )
                sys.stderr.write(console.export_text(styles=True))
        except Exception:
            # If something goes wrong in the printing of the traceback with Rich, just print the exception and continue.
            # This will swallow Rich's traceback.
            import traceback

            traceback.print_exception(exc_type, exc_value, exc_tb)

    return _hook
