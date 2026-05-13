import json
import re
from pathlib import Path
from typing import Any

import lxml.html
import pytest
from prairielearn.element_schemas import (
    PL_KEYWORDS,
    PLValidator,
    _assert_registered_names,
    _build_envelope,
    pl_format_checker,
    validate_element,
)


def test_build_envelope_normalizes_underscores_and_skips_comments() -> None:
    element = lxml.html.fragment_fromstring(
        '<pl-widget answers_name="x"><!-- comment -->'
        '<pl_answer score_value="1"><strong>A</strong></pl_answer>'
        "</pl-widget>"
    )

    assert _build_envelope(element) == {
        "tag": "pl-widget",
        "attributes": {"answers-name": "x"},
        "text": "A",
        "innerHtml": '<!-- comment --><pl_answer score_value="1"><strong>A</strong></pl_answer>',
        "children": [
            {
                "tag": "pl-answer",
                "attributes": {"score-value": "1"},
                "text": "A",
                "innerHtml": "<strong>A</strong>",
            }
        ],
    }


@pytest.mark.parametrize(
    ("error_message", "expected"),
    [
        ("Custom string", "Custom string"),
        ({"required": "Custom dict"}, "Custom dict"),
        ({"_": "Custom fallback"}, "Custom fallback"),
        (None, "'missing' is a required property"),
    ],
)
def test_validate_element_error_mapping(
    tmp_path: Path, error_message: Any, expected: str
) -> None:
    schema: dict[str, Any] = {"type": "object", "required": ["missing"]}
    if error_message is not None:
        schema["errorMessage"] = error_message
    schema_path = tmp_path / f"schema-{len(str(error_message))}.json"
    schema_path.write_text(json.dumps(schema))

    element = lxml.html.fragment_fromstring("<pl-widget></pl-widget>")

    with pytest.raises(ValueError, match=expected):
        validate_element(element, schema_path)


def test_unregistered_format_preflight() -> None:
    with pytest.raises(ValueError, match="unregistered format 'pl-unknown'"):
        _assert_registered_names({"type": "string", "format": "pl-unknown"})


def test_unregistered_keyword_preflight() -> None:
    with pytest.raises(ValueError, match="unregistered PL keyword 'unique-child-tex'"):
        _assert_registered_names({"type": "object", "unique-child-tex": True})


def test_unique_child_text_keyword() -> None:
    schema = {"type": "object", "unique-child-text": True}
    element = lxml.html.fragment_fromstring(
        "<pl-widget><pl-answer> A </pl-answer><pl-answer>A</pl-answer></pl-widget>"
    )

    validator = PLValidator(schema)
    errors = list(validator.iter_errors(_build_envelope(element)))

    assert errors[0].message == "Duplicate child text: 'A'"


def test_pl_float_range_keyword() -> None:
    validator = PLValidator({
        "type": "string",
        "format": "pl-float",
        "pl-float-range": [0, 1],
    })

    assert list(validator.iter_errors(".5")) == []
    assert list(validator.iter_errors("0e0")) == []
    assert (
        next(iter(validator.iter_errors("1.5"))).message
        == "must be in the range [0.0, 1.0]"
    )


@pytest.mark.parametrize(
    ("name", "schema"),
    [
        ("properties", {"properties": {"x": {"format": "pl-unknown"}}}),
        ("patternProperties", {"patternProperties": {".*": {"format": "pl-unknown"}}}),
        ("additionalProperties", {"additionalProperties": {"format": "pl-unknown"}}),
        ("propertyNames", {"propertyNames": {"format": "pl-unknown"}}),
        ("items", {"items": {"format": "pl-unknown"}}),
        ("prefixItems", {"prefixItems": [{"format": "pl-unknown"}]}),
        ("contains", {"contains": {"format": "pl-unknown"}}),
        ("allOf", {"allOf": [{"format": "pl-unknown"}]}),
        ("anyOf", {"anyOf": [{"format": "pl-unknown"}]}),
        ("oneOf", {"oneOf": [{"format": "pl-unknown"}]}),
        ("not", {"not": {"format": "pl-unknown"}}),
        ("if", {"if": {"format": "pl-unknown"}}),
        ("then", {"then": {"format": "pl-unknown"}}),
        ("else", {"else": {"format": "pl-unknown"}}),
        ("dependentSchemas", {"dependentSchemas": {"x": {"format": "pl-unknown"}}}),
        ("$defs", {"$defs": {"x": {"format": "pl-unknown"}}}),
        ("definitions", {"definitions": {"x": {"format": "pl-unknown"}}}),
    ],
)
def test_preflight_walks_nested_subschema_positions(
    name: str, schema: dict[str, Any]
) -> None:
    with pytest.raises(ValueError, match=f"#/{re.escape(name)}"):
        _assert_registered_names(schema)


def test_keyword_format_parity() -> None:
    manifest_path = (
        Path(__file__).parents[4]
        / "apps/prairielearn/src/ee/lib/element-schemas/keywords.manifest.json"
    )
    if not manifest_path.exists():
        pytest.skip("element schema keyword manifest has not been generated yet")

    manifest = json.loads(manifest_path.read_text())

    assert set(manifest["keywords"]) == set(PL_KEYWORDS)
    assert set(manifest["formats"]) == set(pl_format_checker.checkers)
