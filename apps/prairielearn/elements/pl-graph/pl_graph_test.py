import importlib
import tempfile
from pathlib import Path

import pytest

graph = importlib.import_module("pl-graph")


def test_render_with_source_file_name() -> None:
    """Test that pl-graph can render from a source file"""
    # Create a temporary graph file
    with tempfile.TemporaryDirectory() as tmpdir:
        graph_content = "digraph G { A -> B }"
        graph_file = Path(tmpdir) / "test.dot"
        graph_file.write_text(graph_content)

        # Create minimal data structure
        data = {
            "options": {
                "question_path": tmpdir,
                "server_files_course_path": "",
                "client_files_course_path": "",
            },
            "extensions": [],
        }

        # Create element HTML with source-file-name
        element_html = '<pl-graph source-file-name="test.dot"></pl-graph>'

        # Render the element
        result = graph.render(element_html, data)

        # Verify that result contains expected SVG wrapper
        assert '<div class="pl-graph">' in result
        assert "</div>" in result


def test_prepare_with_source_file_name_and_content_error() -> None:
    """Test that prepare raises an error when both source-file-name and content are provided"""
    data = {
        "options": {
            "question_path": ".",
        },
        "extensions": [],
    }

    # Create element HTML with both source-file-name and content
    element_html = (
        '<pl-graph source-file-name="test.dot">digraph G { A -> B }</pl-graph>'
    )

    # Verify that prepare raises an error
    with pytest.raises(ValueError, match="Existing graph content cannot be added"):
        graph.prepare(element_html, data)


def test_render_missing_file_error() -> None:
    """Test that render raises an error when source file doesn't exist"""
    data = {
        "options": {
            "question_path": "/tmp/nonexistent",
            "server_files_course_path": "",
            "client_files_course_path": "",
        },
        "extensions": [],
    }

    element_html = '<pl-graph source-file-name="missing.dot"></pl-graph>'

    with pytest.raises(ValueError, match="Unknown file path"):
        graph.render(element_html, data)
