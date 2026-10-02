import importlib
import json
import re
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
        "schema_version": 2,
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
        "schema_version": 2,
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
    config = data["params"]["_pl_spreadsheet_v2"]["model"]
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
        "schema_version": 2,
        "template_hash": config["template_hash"],
        "engine": {
            "name": "formualizer",
            "version": "0.9.3",
            "configuration_version": 2,
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
    config = data["params"]["_pl_spreadsheet_v2"]["model"]

    assert config["schema_version"] == 2
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
    assert grader["schema_version"] == 2
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

    config = data["params"]["_pl_spreadsheet_v2"]["model"]
    public_sheet = config["template"]["sheets"][0]
    assert public_sheet == {
        "name": "Inputs",
        "rows": 2,
        "columns": 2,
        "cells": {"A1": "2", "B1": "=A1*2", "A2": "3", "B2": "=A2*2"},
        "editable_ranges": ["A1:A2"],
    }
    assert "HIDDEN_SENTINEL" not in json.dumps(config)
    assert "=C2=4" not in json.dumps(config)
    grader = data["correct_answers"]["model"]
    assert grader["source_sheets"][0]["cells"]["A1"] == "HIDDEN_SENTINEL"
    assert grader["source_sheets"][0]["cells"]["D2"] == "=C2=4"
    assert grader["outputs"] == {
        "score": {"sheet": "Inputs", "cell": "D2", "required": True}
    }
    assert grader["student_overlays"] == [
        {
            "student_sheet": "Inputs",
            "source_sheet": "Inputs",
            "source_range": "B2:C3",
        }
    ]

    table = spreadsheet._table_data(config, None)[0]
    assert [column["name"] for column in table["columns"]] == ["A", "B"]
    assert [row["number"] for row in table["rows"]] == [1, 2]
    assert table["rows"][1]["cells"][1] == {
        "address": "B2",
        "value": "=A2*2",
        "formula": "=A2*2",
        "error": False,
        "class_name": "pl-spreadsheet-cell-readonly",
    }


def test_prepare_rejects_visible_formula_references_outside_student_range(
    tmp_path: Path,
) -> None:
    (tmp_path / "workbook.csv").write_text(",,\n,2,=A1\n")
    data = file_question_data(tmp_path)

    with pytest.raises(ValueError, match="outside declared student ranges"):
        spreadsheet.prepare(FILE_ELEMENT_HTML.replace('cell="D2"', 'cell="A1"'), data)


@pytest.mark.parametrize(
    ("formula", "message"),
    [
        ('=\'Q"1\'!B1+SHEETS()+LEN("")', "unsupported function SHEETS"),
        ('=\'Q"1\'!B1+SUM(OFFSET(A1,0,2))+LEN("")', "unsupported function OFFSET"),
        ("=_xlfn.OFFSET(A1,0,2)", "unsupported function _XLFN.OFFSET"),
        ("=IFERROR(SHEETS_(),0)", "unsupported function SHEETS_"),
        ("=offset (A1,0,2)", "unsupported function OFFSET"),
        ("='[other.xlsx]Sheet1'!A1", "external, structured, or array"),
    ],
)
def test_validate_formula_rejects_disguised_functions(
    formula: str, message: str
) -> None:
    with pytest.raises(ValueError, match=re.escape(message)):
        spreadsheet._validate_formula(formula, "Inputs!A1")


@pytest.mark.parametrize(
    "formula",
    ['=\'Q"1\'!B1&"!"', "='It''s'!A1+SUM(B1:B2)", '="SHEETS()"&LEN("(")'],
)
def test_validate_formula_accepts_quoted_text(formula: str) -> None:
    spreadsheet._validate_formula(formula, "Inputs!A1")


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


def test_sheet_names_cannot_use_the_private_student_mirror_prefix() -> None:
    with pytest.raises(ValueError, match="reserved prefix"):
        spreadsheet._normalize_sheet_name("__pl_student_0", "Sheet 1")


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


def test_template_hash_includes_the_private_source_address_space(
    element_directory: None,
) -> None:
    first_template = {
        "schema_version": 2,
        "sheets": [
            {
                "name": "Inputs",
                "rows": 2,
                "columns": 2,
                "cells": {"A1": 1},
                "editable_ranges": ["A1"],
                "student_range": "A1",
            }
        ],
    }
    second_template = {
        "schema_version": 2,
        "sheets": [
            {
                "name": "Inputs",
                "rows": 2,
                "columns": 2,
                "cells": {"B2": 1},
                "editable_ranges": ["B2"],
                "student_range": "B2",
            }
        ],
    }
    first = question_data(params={"workbook": first_template})
    second = question_data(params={"workbook": second_template})

    spreadsheet.prepare(ELEMENT_HTML, first)
    spreadsheet.prepare(ELEMENT_HTML, second)

    assert (
        first["params"]["_pl_spreadsheet_v2"]["model"]["template_hash"]
        != second["params"]["_pl_spreadsheet_v2"]["model"]["template_hash"]
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
        "schema_version": 2,
        "template_hash": data["params"]["_pl_spreadsheet_v2"]["model"]["template_hash"],
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
    rendered = html.fromstring(read_only_html)
    b2 = rendered.xpath('//td[@aria-label="Cell B2"]')[0]
    assert b2.xpath('.//span[@data-spreadsheet-view="values"]/text()') == ["6"]
    assert b2.xpath('.//span[@data-spreadsheet-view="formulas"]/text()') == ["=A2*2"]
    # Formulas such as =$A$1 must not be typeset as math.
    assert rendered.find_class("pl-spreadsheet-read-only") == rendered.find_class(
        "mathjax_ignore"
    )
    assert 'role="switch"' in read_only_html
    assert 'aria-label="Show formulas for Budget model"' in read_only_html

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
    config = data["params"]["_pl_spreadsheet_v2"]["model"]
    prior = json.dumps(
        {
            "schema_version": 2,
            "template_hash": config["template_hash"],
            "sheets": {"Inputs": {"A2": 3}},
        },
        separators=(",", ":"),
    )
    data["raw_submitted_answers"]["model"] = prior

    rendered = html.fromstring(spreadsheet.render(ELEMENT_HTML, data))

    assert rendered.xpath('//input[@name="model"]/@value') == [prior]


def test_missing_optional_display_fields_use_defaults(
    element_directory: None,
) -> None:
    data = prepare_data()
    config = data["params"]["_pl_spreadsheet_v2"]["model"]
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
        assert "model" in data["format_errors"]
    else:
        decoded = json.loads(raw)
        assert decoded["sheets"] == {"Inputs": {"A2": 2}}


def test_test_submission_falls_back_to_placeholder_for_blank_template(
    element_directory: None,
) -> None:
    blank_template = template()
    blank_template["sheets"][0]["cells"] = {"A1": "Quantity"}
    data = prepare_data(params={"workbook": blank_template})
    data["test_type"] = "correct"

    spreadsheet.test(ELEMENT_HTML, data)

    decoded = json.loads(data["raw_submitted_answers"]["model"])
    assert decoded["sheets"] == {"Inputs": {"A2": "Test correct"}}


def reference_grading_config(**overrides: Any) -> dict[str, Any]:
    config = grading_config()
    config.update({
        "parameters": ["Inputs!A2"],
        "test_cases": [{"name": "five", "inputs": {"Inputs!A2": 5}}, {"inputs": {}}],
        "reference": {"cells": {"Inputs!A3": "=A2*3"}},
    })
    config.update(overrides)
    return config


def test_prepare_normalizes_test_cases_and_reference(element_directory: None) -> None:
    data = prepare_data(correct_answers={"model": reference_grading_config()})

    grader = data["correct_answers"]["model"]
    assert grader["parameters"] == [{"sheet": "Inputs", "range": "A2:A2"}]
    assert grader["test_cases"] == [
        {"name": "five", "inputs": [{"sheet": "Inputs", "cell": "A2", "value": 5}]},
        {"name": "Case 2", "inputs": []},
    ]
    assert grader["reference"] == {
        "cells": [{"sheet": "Inputs", "cell": "A3", "input": "=A2*3"}],
        "rtol": 0.01,
        "atol": 1e-8,
        "compare_outputs": False,
    }
    assert "=A2*3" not in json.dumps(data["params"])


def test_prepare_allows_reference_without_outputs(element_directory: None) -> None:
    config = reference_grading_config(outputs={}, sheets=[])
    data = prepare_data(correct_answers={"model": config})
    assert data["correct_answers"]["model"]["outputs"] == {}

    config.pop("reference")
    with pytest.raises(ValueError, match="or a reference solution"):
        prepare_data(correct_answers={"model": config})


def test_grader_hash_covers_test_cases_and_reference(element_directory: None) -> None:
    base = prepare_data(correct_answers={"model": reference_grading_config()})
    changed_case = prepare_data(
        correct_answers={
            "model": reference_grading_config(test_cases=[{"inputs": {"Inputs!A2": 6}}])
        }
    )
    changed_reference = prepare_data(
        correct_answers={
            "model": reference_grading_config(
                reference={"cells": {"Inputs!A3": "=A2*4"}}
            )
        }
    )
    hashes = {
        data["correct_answers"]["model"]["grader_hash"]
        for data in (base, changed_case, changed_reference)
    }
    assert len(hashes) == 3


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        (
            {"test_cases": [{"inputs": {"Inputs!A3": 1}}]},
            "cannot override",
        ),
        (
            {"test_cases": [{"inputs": {"Inputs!B2": 1}}]},
            "cannot override",
        ),
        (
            {"test_cases": [{"inputs": {"Inputs!A2": "=1+1"}}]},
            "constant, not a formula",
        ),
        ({"test_cases": [{"inputs": {"Inputs!Z9": 1}}]}, "unknown cell"),
        ({"test_cases": [{"inputs": {"A2": 1}}]}, "sheet-qualified"),
        (
            {"test_cases": [{"name": "same", "inputs": {}}] * 2},
            "is duplicated",
        ),
        ({"parameters": ["Inputs!A2:A9"]}, "inside a student range"),
        ({"reference": {"cells": {"Inputs!B2": "=A2"}}}, "must be editable"),
        ({"reference": {"cells": {"Inputs!A2": "=1"}}}, "also be a parameter"),
        ({"reference": {"cells": {"Inputs!A3": "=RAND()"}}}, "unsupported function"),
        (
            {"reference": {"cells": {"Inputs!A3": "=Checks!A1"}}},
            "non-visible sheet",
        ),
        (
            {"reference": {"cells": {"Inputs!A3": {"value": "=A2", "rtol": -1}}}},
            "non-negative finite",
        ),
        ({"reference": {"cells": {}}}, "1 to 500 cells"),
        (
            {
                "test_cases": [{"name": str(i), "inputs": {}} for i in range(50)],
                "reference": {
                    "cells": {"Inputs!A3": "=A2"},
                    "compare_outputs": True,
                },
                "outputs": {
                    f"output_{i}": {"sheet": "Checks", "cell": "A1"} for i in range(40)
                },
            },
            "at most 5000 results",
        ),
    ],
)
def test_prepare_rejects_invalid_testing_config(
    element_directory: None, overrides: dict[str, Any], message: str
) -> None:
    with pytest.raises((TypeError, ValueError), match=message):
        prepare_data(correct_answers={"model": reference_grading_config(**overrides)})


def test_prepare_rebases_reference_children_into_student_coordinates(
    tmp_path: Path,
) -> None:
    (tmp_path / "workbook.csv").write_text(",,,\n,2,=B2*2,\n,3,,\n")
    element_html = FILE_ELEMENT_HTML.replace(
        "</pl-spreadsheet>",
        """
        <pl-spreadsheet-parameter sheet-name="Inputs" range="B2"></pl-spreadsheet-parameter>
        <pl-spreadsheet-reference
          sheet-name="Inputs" cell="b3" formula="=$B$2+C2" rtol="0.001"
        ></pl-spreadsheet-reference>
        </pl-spreadsheet>""",
    )
    data = file_question_data(tmp_path)

    spreadsheet.prepare(element_html, data)

    grader = data["correct_answers"]["model"]
    assert grader["parameters"] == [{"sheet": "Inputs", "range": "B2:B2"}]
    assert grader["reference"]["cells"] == [
        {"sheet": "Inputs", "cell": "B3", "input": "=$A$1+B1", "rtol": 0.001}
    ]
    assert "B2+C2" not in json.dumps(data["params"])


def test_prepare_reference_children_create_a_grading_config(
    element_directory: None,
) -> None:
    element_html = ELEMENT_HTML.replace(
        "</pl-spreadsheet>",
        '<pl-spreadsheet-reference sheet-name="Inputs" cell="A3" formula="=A2*3">'
        "</pl-spreadsheet-reference></pl-spreadsheet>",
    )
    data = question_data()

    spreadsheet.prepare(element_html, data)

    grader = data["correct_answers"]["model"]
    assert grader["outputs"] == {}
    assert grader["reference"]["cells"][0]["input"] == "=A2*3"

    duplicated = element_html.replace(
        "</pl-spreadsheet>",
        '<pl-spreadsheet-reference sheet-name="Inputs" cell="a3" formula="=A2">'
        "</pl-spreadsheet-reference></pl-spreadsheet>",
    )
    with pytest.raises(ValueError, match="is duplicated"):
        spreadsheet.prepare(duplicated, question_data())


def test_render_answer_panel_shows_the_evaluated_reference_workbook(
    element_directory: None,
) -> None:
    data = prepare_data(correct_answers={"model": reference_grading_config()})
    data["panel"] = "answer"
    assert "grading is defined by the question" in spreadsheet.render(
        ELEMENT_HTML, data
    )

    data["correct_answers"]["model"]["answer"] = {
        "sheets": [
            {
                "name": "Inputs",
                "rows": 3,
                "columns": 3,
                "cells": {
                    "A2": {
                        "input": {"type": "number", "value": 2},
                        "result": {"type": "number", "value": 2},
                    },
                    "A3": {
                        "input": {"type": "formula", "value": "=A2*3"},
                        "result": {"type": "number", "value": 6},
                    },
                },
            }
        ]
    }
    rendered = html.fromstring(spreadsheet.render(ELEMENT_HTML, data))

    assert "Highlighted cells show a reference solution" in rendered.text_content()
    answer_cell = rendered.xpath('//td[@class="table-success"]')
    assert [cell.get("aria-label") for cell in answer_cell] == [
        "Cell A3, reference solution"
    ]
    assert answer_cell[0].xpath('.//span[@data-spreadsheet-view="values"]/text()') == [
        "6"
    ]
    assert answer_cell[0].xpath(
        './/span[@data-spreadsheet-view="formulas"]/text()'
    ) == ["=A2*3"]
    assert "Checks" not in rendered.text_content()


def test_reference_answer_cells_use_student_coordinates() -> None:
    assert spreadsheet._reference_answer_cells({
        "student_overlays": [
            {
                "student_sheet": "Inputs",
                "source_sheet": "Inputs",
                "source_range": "B2:C3",
            }
        ],
        "reference": {"cells": [{"sheet": "Inputs", "cell": "C3", "input": "=A1"}]},
    }) == {"Inputs": {"B2"}}


def test_prepare_resolves_open_ended_ranges(element_directory: None) -> None:
    workbook = template()
    workbook["sheets"][0]["editable_ranges"] = ["A2:A"]
    config = grading_config()
    config["parameters"] = ["Inputs!a2:a"]

    data = prepare_data(
        params={"workbook": workbook}, correct_answers={"model": config}
    )

    public_sheet = data["params"]["_pl_spreadsheet_v2"]["model"]["template"]["sheets"][
        0
    ]
    assert public_sheet["editable_ranges"] == ["A2:A3"]
    assert data["correct_answers"]["model"]["parameters"] == [
        {"sheet": "Inputs", "range": "A2:A3"}
    ]


def test_prepare_resolves_open_ended_file_ranges(tmp_path: Path) -> None:
    (tmp_path / "workbook.csv").write_text(",,,\n,2,=B2*2,\n,3,,\n")
    element_html = (
        FILE_ELEMENT_HTML
        .replace('student-range="B2:C3"', 'student-range="B2:C"')
        .replace('editable-ranges="B2:B3"', 'editable-ranges="B2:B"')
        .replace(
            "</pl-spreadsheet>",
            '<pl-spreadsheet-parameter sheet-name="Inputs" range="B:B">'
            "</pl-spreadsheet-parameter></pl-spreadsheet>",
        )
    )
    data = file_question_data(tmp_path)

    spreadsheet.prepare(element_html, data)

    public_sheet = data["params"]["_pl_spreadsheet_v2"]["model"]["template"]["sheets"][
        0
    ]
    assert public_sheet["editable_ranges"] == ["A1:A2"]
    grader = data["correct_answers"]["model"]
    assert grader["student_overlays"][0]["source_range"] == "B2:C3"
    assert grader["parameters"] == [{"sheet": "Inputs", "range": "B2:B3"}]


def test_render_submission_shows_score_and_feedback(element_directory: None) -> None:
    data = prepare_data()
    data["panel"] = "submission"
    data["submitted_answers"]["model"] = snapshot(data)
    data["partial_scores"]["model"] = {
        "score": 0.5,
        "weight": 1,
        "feedback": "1 of 2 answer cells match.",
    }

    html = spreadsheet.render(ELEMENT_HTML, data)

    assert "50%" in html
    assert "1 of 2 answer cells match." in html
    data["panel"] = "question"
    data["editable"] = False
    assert "1 of 2 answer cells match." not in spreadsheet.render(ELEMENT_HTML, data)


def test_render_submission_marks_incorrect_reference_cells(
    element_directory: None,
) -> None:
    data = question_data(correct_answers={"model": reference_grading_config()})
    spreadsheet.prepare(ELEMENT_HTML, data)
    data["panel"] = "submission"
    data["submitted_answers"]["model"] = reference_snapshot(
        data, [False, True, True], answer=FORMULA_ANSWER
    )
    spreadsheet.grade(ELEMENT_HTML, data)

    rendered = html.fromstring(spreadsheet.render(ELEMENT_HTML, data))

    assert [
        cell.get("aria-label") for cell in rendered.xpath('//td[@class="table-danger"]')
    ] == ["Cell A3, incorrect"]

    data["submitted_answers"]["model"] = reference_snapshot(
        data, [True, True, True], answer=FORMULA_ANSWER
    )
    spreadsheet.grade(ELEMENT_HTML, data)
    rendered = html.fromstring(spreadsheet.render(ELEMENT_HTML, data))
    assert rendered.xpath('//td[@class="table-danger"]') == []


WEIGHTED_ELEMENT_HTML = ELEMENT_HTML.replace(
    'height="500px"', 'height="500px" weight="2"'
)


def number_comparison(*, match: bool) -> dict[str, Any]:
    return {
        "student": {"type": "number", "value": 6},
        "reference": {"type": "number", "value": 6 if match else 15},
        "match": match,
    }


def reference_snapshot(
    data: dict[str, Any], matches: list[bool], *, answer: dict[str, Any]
) -> dict[str, Any]:
    submission = snapshot(data)
    submission["sheets"][0]["cells"]["A3"] = answer
    grader = data["correct_answers"]["model"]
    submission["grading"] = {
        "schema_version": 2,
        "grader_hash": grader["grader_hash"],
        "outputs": {},
        "cases": [
            {"name": case["name"], "outputs": {}} for case in grader["test_cases"]
        ],
        "reference": {
            "cells": {
                "Inputs!A3": {
                    "base": number_comparison(match=matches[0]),
                    "cases": [number_comparison(match=m) for m in matches[1:]],
                }
            },
            "summary": {"matched": sum(matches), "total": len(matches)},
        },
    }
    return submission


FORMULA_ANSWER = {
    "input": {"type": "formula", "value": "=A2*2"},
    "result": {"type": "number", "value": 6},
}
TYPED_ANSWER = {
    "input": {"type": "number", "value": 6},
    "result": {"type": "number", "value": 6},
}


@pytest.mark.parametrize(
    ("matches", "answer", "score", "feedback"),
    [
        (
            [True, True, True],
            FORMULA_ANSWER,
            1,
            "All answer cells match the reference solution on your worksheet and on every hidden test case.",
        ),
        (
            [False, True, True],
            FORMULA_ANSWER,
            0,
            "0 of 1 answer cells match the reference solution. For example, A3 does not calculate the expected value.",
        ),
        (
            [True, False, True],
            FORMULA_ANSWER,
            0,
            "0 of 1 answer cells match the reference solution. For example, A3 is correct for the values shown but not for every hidden test case.",
        ),
        (
            [True, True, False],
            TYPED_ANSWER,
            0,
            "0 of 1 answer cells match the reference solution. For example, A3 is correct for the values shown but not when the hidden test cases change the data.",
        ),
    ],
)
def test_grade_scores_reference_cells_and_explains_the_first_mismatch(
    matches: list[bool],
    answer: dict[str, Any],
    score: float,
    feedback: str,
    element_directory: None,
) -> None:
    data = question_data(correct_answers={"model": reference_grading_config()})
    spreadsheet.prepare(WEIGHTED_ELEMENT_HTML, data)
    data["submitted_answers"]["model"] = reference_snapshot(
        data, matches, answer=answer
    )

    spreadsheet.grade(WEIGHTED_ELEMENT_HTML, data)

    partial_score = data["partial_scores"]["model"]
    assert (partial_score["score"], partial_score["weight"]) == (score, 2)
    assert partial_score["feedback"].startswith(feedback)


def test_grade_leaves_questions_without_a_reference_to_the_question(
    element_directory: None,
) -> None:
    data = prepare_data(correct_answers={"model": grading_config()})
    data["submitted_answers"]["model"] = snapshot(data)

    spreadsheet.grade(ELEMENT_HTML, data)

    assert data["partial_scores"] == {}


@pytest.mark.parametrize(
    ("test_type", "answer", "score", "feedback"),
    [
        (
            "correct",
            "=A2*3",
            1,
            "All answer cells match the reference solution on your worksheet and on every hidden test case.",
        ),
        (
            "incorrect",
            "Incorrect",
            0,
            "0 of 1 answer cells match the reference solution. For example, A3 does not calculate the expected value.",
        ),
    ],
)
def test_reference_test_submissions_predict_their_grade(
    test_type: str,
    answer: str,
    score: int,
    feedback: str,
    element_directory: None,
) -> None:
    data = question_data(correct_answers={"model": reference_grading_config()})
    spreadsheet.prepare(WEIGHTED_ELEMENT_HTML, data)
    data["test_type"] = test_type

    spreadsheet.test(WEIGHTED_ELEMENT_HTML, data)

    raw = json.loads(data["raw_submitted_answers"]["model"])
    assert raw["sheets"] == {"Inputs": {"A3": answer}}
    assert data["partial_scores"]["model"] == {
        "score": score,
        "weight": 2,
        "feedback": feedback,
    }
