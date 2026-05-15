import json
from pathlib import Path
from typing import Any

import lxml.html
import pytest
from prairielearn.element_schemas import _normalize_attrs, validate_element


def test_normalize_attrs_replaces_underscores() -> None:
    assert _normalize_attrs({"answers_name": "x"}) == {"answers-name": "x"}


@pytest.mark.parametrize(
    ("schema", "html", "expected"),
    [
        (
            {"type": "object", "required": ["answers-name"]},
            "<pl-widget></pl-widget>",
            r'Attribute "answers-name" is required\.',
        ),
        (
            {
                "type": "object",
                "properties": {"answers-name": {"type": "string"}},
                "additionalProperties": False,
            },
            '<pl-widget answers-name="x" bogus="true"></pl-widget>',
            r'Attribute "bogus" is not allowed\.',
        ),
        (
            {
                "type": "object",
                "properties": {"weight": {"type": "string", "format": "pl-integer"}},
            },
            '<pl-widget weight="1.5"></pl-widget>',
            r'Attribute "weight" must be an integer\.',
        ),
        (
            {
                "type": "object",
                "properties": {
                    "display": {"type": "string", "enum": ["block", "inline"]}
                },
            },
            '<pl-widget display="grid"></pl-widget>',
            r'Attribute "display" must be one of: block, inline\.',
        ),
        (
            {
                "type": "object",
                "properties": {
                    "all-of-the-above": {
                        "anyOf": [
                            {"type": "string", "format": "pl-boolean"},
                            {"type": "string", "enum": ["false", "random", "correct"]},
                        ]
                    }
                },
            },
            '<pl-widget all-of-the-above="maybe"></pl-widget>',
            (
                r'Attribute "all-of-the-above" must be a boolean value '
                r"or one of: false, random, correct\."
            ),
        ),
        (
            {
                "type": "object",
                "properties": {
                    "weight": {
                        "type": "string",
                        "format": "pl-integer",
                        "errorMessage": "Use a real weight.",
                    }
                },
            },
            '<pl-widget weight="1.5"></pl-widget>',
            "Use a real weight.",
        ),
    ],
)
def test_validate_element(
    tmp_path: Path, schema: dict[str, Any], html: str, expected: str
) -> None:
    schema_path = tmp_path / "schema.json"
    schema_path.write_text(json.dumps(schema))

    with pytest.raises(ValueError, match=expected):
        validate_element(lxml.html.fragment_fromstring(html), schema_path)
