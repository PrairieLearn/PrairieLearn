import subprocess
import sys
from pathlib import Path
from textwrap import dedent


def test_draw_file_like_output():
    # Keep a regression in the native FILE* conversion from crashing pytest.
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            dedent(r"""
                import io

                import pygraphviz
                from prairielearn.internal.pygraphviz_compat import patch_pygraphviz

                patch_pygraphviz()
                graph = pygraphviz.AGraph()
                graph.add_edge("a", "b")

                png = io.BytesIO()
                assert graph.draw(png, format="png", prog="dot", args="-Nshape=box") is None
                assert png.getvalue().startswith(b"\x89PNG\r\n\x1a\n")
                assert graph.node_attr["shape"] == "box"

                graph.layout(prog="neato")
                positions = [node.attr["pos"] for node in graph.nodes()]
                png = io.BytesIO()
                assert graph.draw(png, format="png") is None
                assert png.getvalue().startswith(b"\x89PNG\r\n\x1a\n")
                assert [node.attr["pos"] for node in graph.nodes()] == positions

                svg = io.BytesIO()
                assert graph.draw(svg, format="svg") is None
                assert b"<svg" in svg.getvalue()
            """),
        ],
        cwd=Path(__file__).resolve().parents[1],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stderr
