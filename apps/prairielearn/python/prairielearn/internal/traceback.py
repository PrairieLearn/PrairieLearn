import contextlib
import io
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


def make_rich_excepthook(
    suppress: Sequence[str],
) -> Callable[[type[BaseException], BaseException, types.TracebackType | None], None]:
    """Create an excepthook that formats tracebacks with syntax highlighting using Rich.

    ``suppress`` is a list of paths whose frames will be hidden from the traceback.
    """

    def _hook(
        exc_type: type[BaseException],
        exc_value: BaseException,
        exc_tb: types.TracebackType | None,
    ) -> None:
        try:
            from rich.console import Console
            from rich.theme import Theme
            from rich.traceback import Traceback

            with _suppress_panel_border():
                console = Console(
                    file=io.StringIO(),
                    force_terminal=True,
                    theme=Theme({"traceback.title": "dim"}),
                    width=300,
                    record=True,
                )
                console.print(
                    Traceback.from_exception(
                        exc_type,
                        exc_value,
                        exc_tb,
                        suppress=list(suppress),
                        width=None,
                        code_width=None,
                        word_wrap=False,
                        show_locals=False,
                        indent_guides=False,
                    ),
                    soft_wrap=True,
                )
                sys.stderr.write(console.export_text(styles=True))
        except Exception:
            import traceback

            traceback.print_exception(exc_type, exc_value, exc_tb)

    return _hook
