import importlib
import json
from pathlib import Path
from typing import Any

import pytest
from lxml import html

spreadsheet = importlib.import_module("pl-spreadsheet")

ELEMENT_HTML = """
<pl-spreadsheet
  answers-name="model"
  params-name="workbook"
  aria-label="Budget model"
  height="500px"
></pl-spreadsheet>
"""

ALLOW_BLANK_ELEMENT_HTML = """
<pl-spreadsheet
  answers-name="model"
  params-name="workbook"
  allow-blank="true"
></pl-spreadsheet>
"""


def template() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "sheets": [
            {
                "name": "Inputs",
                "rows": 3,
                "columns": 3,
                "cells": {"A1": "Quantity", "A2": 2, "B2": "=A2*2"},
                "editable_ranges": ["A2:A3"],
            }
        ],
    }


def question_data(**overrides: Any) -> dict[str, Any]:
    data = {
        "params": {"workbook": template()},
        "correct_answers": {},
        "answers_names": {},
        "submitted_answers": {},
        "raw_submitted_answers": {},
        "format_errors": {},
        "partial_scores": {},
        "panel": "question",
        "editable": True,
    }
    data.update(overrides)
    return data


def prepare_data(**overrides: Any) -> dict[str, Any]:
    data = question_data(**overrides)
    spreadsheet.prepare(ELEMENT_HTML, data)
    return data


def snapshot(
    data: dict[str, Any], *, include_editable_input: bool = True
) -> dict[str, Any]:
    config = data["params"]["_pl_spreadsheet_v1"]["model"]
    cells = {
        "A1": {
            "input": {"type": "string", "value": "Quantity"},
            "result": {"type": "string", "value": "Quantity"},
        },
        "B2": {
            "input": {"type": "formula", "value": "=A2*2"},
            "result": {"type": "number", "value": 6},
        },
    }
    if include_editable_input:
        cells["A2"] = {
            "input": {"type": "number", "value": 3},
            "result": {"type": "number", "value": 3},
        }
    return {
        "schema_version": 1,
        "template_hash": config["template_hash"],
        "engine": {
            "name": "hyperformula",
            "version": "3.4.0",
            "configuration_version": 1,
        },
        "sheets": [{"name": "Inputs", "rows": 3, "columns": 3, "cells": cells}],
    }


@pytest.fixture
def element_directory(monkeypatch: pytest.MonkeyPatch) -> None:
    module_path = spreadsheet.__file__
    assert module_path is not None
    monkeypatch.chdir(Path(module_path).parent)


def test_prepare_persists_normalized_versioned_config(element_directory: None) -> None:
    data = prepare_data()
    config = data["params"]["_pl_spreadsheet_v1"]["model"]

    assert config["schema_version"] == 1
    assert len(config["template_hash"]) == 64
    assert config["template"]["sheets"][0]["editable_ranges"] == ["A2:A3"]
    assert data["answers_names"] == {"model": True}


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda value: value["sheets"][0].update(rows=1001), "rows must be between"),
        (
            lambda value: value["sheets"][0]["cells"].update({"D1": 1}),
            "outside sheet",
        ),
        (
            lambda value: value["sheets"][0]["cells"].update({"A2": "=RAND()"}),
            "unsupported function RAND",
        ),
        (
            lambda value: value["sheets"][0]["cells"].update({"A2": float("inf")}),
            "finite number",
        ),
    ],
)
def test_prepare_rejects_invalid_templates(
    mutate: Any, message: str, element_directory: None
) -> None:
    workbook = template()
    mutate(workbook)
    data = question_data(params={"workbook": workbook})

    with pytest.raises(ValueError, match=message):
        spreadsheet.prepare(ELEMENT_HTML, data)


def test_parse_accepts_a_normalized_snapshot(element_directory: None) -> None:
    data = prepare_data()
    data["submitted_answers"]["model"] = snapshot(data)

    spreadsheet.parse(ELEMENT_HTML, data)

    assert "model" not in data["format_errors"]


def test_parse_rejects_blank_and_error_envelopes(element_directory: None) -> None:
    data = prepare_data()
    data["submitted_answers"]["model"] = snapshot(data, include_editable_input=False)
    spreadsheet.parse(ELEMENT_HTML, data)
    assert data["format_errors"]["model"] == [
        "The spreadsheet answer may not be blank."
    ]

    data["format_errors"] = {}
    data["submitted_answers"]["model"] = {
        "schema_version": 1,
        "template_hash": data["params"]["_pl_spreadsheet_v1"]["model"]["template_hash"],
        "error": "Cell Inputs!A1 is read-only.",
    }
    spreadsheet.parse(ELEMENT_HTML, data)
    assert data["format_errors"]["model"] == ["Cell Inputs!A1 is read-only."]


def test_parse_allows_blank_when_configured(element_directory: None) -> None:
    data = question_data()
    spreadsheet.prepare(ALLOW_BLANK_ELEMENT_HTML, data)
    data["submitted_answers"]["model"] = snapshot(data, include_editable_input=False)

    spreadsheet.parse(ALLOW_BLANK_ELEMENT_HTML, data)

    assert "model" not in data["format_errors"]


def test_render_editable_and_read_only_views(element_directory: None) -> None:
    data = prepare_data()
    editable_html = spreadsheet.render(ELEMENT_HTML, data)
    assert 'name="model"' in editable_html
    assert "pl-spreadsheet-root" in editable_html
    assert "JavaScript is required" in editable_html

    data["panel"] = "submission"
    data["submitted_answers"]["model"] = snapshot(data)
    read_only_html = spreadsheet.render(ELEMENT_HTML, data)
    assert "<caption>Inputs</caption>" in read_only_html
    assert '<th scope="col">A</th>' in read_only_html
    assert 'aria-label="Cell B2">6</td>' in read_only_html

    data["panel"] = "answer"
    answer_html = spreadsheet.render(ELEMENT_HTML, data)
    assert "grading is defined by the question" in answer_html


def test_render_restores_a_prior_raw_submission(element_directory: None) -> None:
    data = prepare_data()
    config = data["params"]["_pl_spreadsheet_v1"]["model"]
    prior = json.dumps(
        {
            "schema_version": 1,
            "template_hash": config["template_hash"],
            "sheets": {"Inputs": {"A2": 3}},
        },
        separators=(",", ":"),
    )
    data["raw_submitted_answers"]["model"] = prior

    rendered = html.fromstring(spreadsheet.render(ELEMENT_HTML, data))

    assert rendered.xpath('//input[@name="model"]/@value') == [prior]


def test_missing_optional_persisted_fields_use_defaults(
    element_directory: None,
) -> None:
    data = prepare_data()
    config = data["params"]["_pl_spreadsheet_v1"]["model"]
    del config["aria_label"]
    del config["height"]
    del config["allow_blank"]

    rendered = spreadsheet.render(ELEMENT_HTML, data)

    assert "Spreadsheet" in rendered
    assert "height: 500px" in rendered


@pytest.mark.parametrize("test_type", ["correct", "incorrect", "invalid"])
def test_generates_deterministic_test_submissions(
    test_type: str, element_directory: None
) -> None:
    data = prepare_data()
    data["test_type"] = test_type

    spreadsheet.test(ELEMENT_HTML, data)

    raw = data["raw_submitted_answers"]["model"]
    if test_type == "invalid":
        assert raw == "not valid json"
    else:
        decoded = json.loads(raw)
        assert decoded["sheets"]["Inputs"]["A2"] == f"Test {test_type}"
