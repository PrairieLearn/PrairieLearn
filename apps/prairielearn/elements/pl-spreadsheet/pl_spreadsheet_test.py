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

FILE_ELEMENT_HTML = """
<pl-spreadsheet answers-name="model" aria-label="CSV budget">
  <pl-spreadsheet-data
    source-file="workbook.csv"
    sheet-name="Inputs"
    student-range="B2:C3"
    editable-ranges="B2:B3"
  ></pl-spreadsheet-data>
  <pl-spreadsheet-output
    name="score"
    sheet-name="Inputs"
    cell="D2"
    required="true"
  ></pl-spreadsheet-output>
</pl-spreadsheet>
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


def grading_config() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "sheets": [
            {
                "name": "Checks",
                "rows": 2,
                "columns": 1,
                "cells": {"A1": "=Inputs!B2", "A2": "=A1=6"},
            }
        ],
        "outputs": {
            "calculated": {"sheet": "Checks", "cell": "a1", "required": True},
            "is_correct": {"sheet": "Checks", "cell": "A2"},
        },
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


def file_question_data(question_path: Path, **overrides: Any) -> dict[str, Any]:
    data = question_data(
        options={
            "question_path": str(question_path),
            "server_files_course_path": str(question_path),
        },
        **overrides,
    )
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


def test_prepare_requires_exactly_one_source_mode(element_directory: None) -> None:
    with pytest.raises(ValueError, match=r"either.*params-name"):
        spreadsheet.prepare(
            '<pl-spreadsheet answers-name="model"></pl-spreadsheet>', question_data()
        )

    conflicting_html = ELEMENT_HTML.replace(
        "</pl-spreadsheet>",
        '<pl-spreadsheet-data source-file="workbook.csv" sheet-name="Inputs" '
        'student-range="A1:B2"></pl-spreadsheet-data></pl-spreadsheet>',
    )
    with pytest.raises(ValueError, match="cannot be combined"):
        spreadsheet.prepare(conflicting_html, question_data())


def test_prepare_normalizes_private_grading_config(element_directory: None) -> None:
    data = question_data(correct_answers={"model": grading_config()})

    spreadsheet.prepare(ELEMENT_HTML, data)

    grader = data["correct_answers"]["model"]
    assert grader["schema_version"] == 1
    assert len(grader["grader_hash"]) == 64
    assert grader["outputs"]["calculated"] == {
        "sheet": "Checks",
        "cell": "A1",
        "required": True,
    }
    assert grader["outputs"]["is_correct"] == {"sheet": "Checks", "cell": "A2"}
    assert grader["sheets"][0]["cells"]["A1"] == "=Inputs!B2"


def test_prepare_csv_keeps_hidden_source_cells_server_only(tmp_path: Path) -> None:
    (tmp_path / "workbook.csv").write_text(
        "HIDDEN_SENTINEL,,,\n,2,=B2*2,=C2=4\n,3,=B3*2,=SUM(C2:C3)\n"
    )
    data = file_question_data(tmp_path)

    spreadsheet.prepare(FILE_ELEMENT_HTML, data)

    config = data["params"]["_pl_spreadsheet_v1"]["model"]
    public_sheet = config["template"]["sheets"][0]
    assert public_sheet == {
        "name": "Inputs",
        "rows": 3,
        "columns": 3,
        "cells": {"B2": "2", "C2": "=B2*2", "B3": "3", "C3": "=B3*2"},
        "editable_ranges": ["B2:B3"],
        "student_range": "B2:C3",
    }
    assert "HIDDEN_SENTINEL" not in json.dumps(config)
    assert "=C2=4" not in json.dumps(config)
    grader = data["correct_answers"]["model"]
    assert grader["source_sheets"][0]["cells"]["A1"] == "HIDDEN_SENTINEL"
    assert grader["source_sheets"][0]["cells"]["D2"] == "=C2=4"
    assert grader["outputs"] == {
        "score": {"sheet": "Inputs", "cell": "D2", "required": True}
    }

    table = spreadsheet._table_data(config, None)[0]
    assert [column["name"] for column in table["columns"]] == ["B", "C"]
    assert [row["number"] for row in table["rows"]] == [2, 3]


def test_prepare_rejects_visible_formula_references_outside_student_range(
    tmp_path: Path,
) -> None:
    (tmp_path / "workbook.csv").write_text(",,\n,2,=A1\n")
    data = file_question_data(tmp_path)

    with pytest.raises(ValueError, match="outside declared student ranges"):
        spreadsheet.prepare(FILE_ELEMENT_HTML.replace('cell="D2"', 'cell="A1"'), data)


def test_prepare_rejects_source_path_traversal(tmp_path: Path) -> None:
    data = file_question_data(tmp_path)
    element_html = FILE_ELEMENT_HTML.replace(
        'source-file="workbook.csv"', 'source-file="../workbook.csv"'
    )

    with pytest.raises(ValueError, match="may not leave"):
        spreadsheet.prepare(element_html, data)


@pytest.mark.parametrize(
    "name",
    [
        "Bob's Data",
        "预算 Данные بيانات",
        "😀" * 31,
        "Sheet?-,/\\|`~.@#$%^&*()+;=",
    ],
)
def test_sheet_name_blocklist_accepts_other_characters(name: str) -> None:
    assert spreadsheet._normalize_sheet_name(name, "Sheet 1") == name


@pytest.mark.parametrize(
    "name",
    [
        "Input!",
        "Input:",
        "Input<",
        "Input>",
        "Input{",
        "Input}",
        "Input[",
        "Input]",
        "Input\0",
        " Input",
        "a" * 32,
    ],
)
def test_sheet_name_blocklist_rejects_unsafe_characters_and_long_names(
    name: str,
) -> None:
    with pytest.raises(ValueError, match="not allowed"):
        spreadsheet._normalize_sheet_name(name, "Sheet 1")


def test_private_grader_hash_changes_with_configuration(
    element_directory: None,
) -> None:
    first = question_data(correct_answers={"model": grading_config()})
    second_grader = grading_config()
    second_grader["sheets"][0]["cells"]["A2"] = "=A1=7"
    second = question_data(correct_answers={"model": second_grader})

    spreadsheet.prepare(ELEMENT_HTML, first)
    spreadsheet.prepare(ELEMENT_HTML, second)

    assert (
        first["correct_answers"]["model"]["grader_hash"]
        != second["correct_answers"]["model"]["grader_hash"]
    )


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda value: value["sheets"][0].update(name="inputs"), "conflicts"),
        (
            lambda value: value["sheets"][0].update(name="Check{"),
            "not allowed",
        ),
        (lambda value: value["sheets"][0].update(rows=1001), "rows must be between"),
        (
            lambda value: value["sheets"][0]["cells"].update({"A1": "=RAND()"}),
            "unsupported function RAND",
        ),
        (
            lambda value: value["outputs"]["calculated"].update(cell="B1"),
            "outside sheet",
        ),
        (lambda value: value.update(outputs={}), "define 1 to 100 outputs"),
    ],
)
def test_prepare_rejects_invalid_private_grading_config(
    mutate: Any, message: str, element_directory: None
) -> None:
    grader = grading_config()
    mutate(grader)
    data = question_data(correct_answers={"model": grader})

    with pytest.raises(ValueError, match=message):
        spreadsheet.prepare(ELEMENT_HTML, data)


def test_prepare_rejects_non_boolean_required_output(
    element_directory: None,
) -> None:
    grader = grading_config()
    grader["outputs"]["calculated"]["required"] = "true"
    data = question_data(correct_answers={"model": grader})

    with pytest.raises(TypeError, match="required must be a boolean"):
        spreadsheet.prepare(ELEMENT_HTML, data)


def test_prepare_rejects_oversized_private_grading_config(
    element_directory: None,
) -> None:
    grader = grading_config()
    grader["sheets"][0].update(
        rows=33,
        cells={f"A{index + 1}": "x" * (32 * 1024) for index in range(33)},
    )
    data = question_data(correct_answers={"model": grader})

    with pytest.raises(ValueError, match="at most 1048576 bytes"):
        spreadsheet.prepare(ELEMENT_HTML, data)


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (
            lambda value: value["sheets"][0].update(name="Input["),
            "not allowed",
        ),
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


def test_render_does_not_expose_private_grading_config(element_directory: None) -> None:
    data = question_data(correct_answers={"model": grading_config()})
    spreadsheet.prepare(ELEMENT_HTML, data)

    rendered = spreadsheet.render(ELEMENT_HTML, data)

    assert "Checks" not in rendered
    assert "=Inputs!B2" not in rendered


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
