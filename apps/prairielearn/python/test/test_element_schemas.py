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
            "'answers-name' is a required property",
        ),
        (
            {
                "type": "object",
                "properties": {"weight": {"type": "string", "format": "pl-integer"}},
            },
            '<pl-widget weight="1.5"></pl-widget>',
            "pl-integer",
        ),
        (
            {
                "type": "object",
                "properties": {
                    "score": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 1,
                        "errorMessage": "Score must be in the range [0.0, 1.0].",
                    }
                },
            },
            '<pl-widget score="1.5"></pl-widget>',
            "Score must be in the range",
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


def test_validate_element_accepts_number_attribute_strings(tmp_path: Path) -> None:
    schema_path = tmp_path / "schema.json"
    schema_path.write_text(
        json.dumps({
            "type": "object",
            "properties": {"score": {"type": "number", "minimum": 0, "maximum": 1}},
        })
    )

    validate_element(
        lxml.html.fragment_fromstring('<pl-widget score=".5"></pl-widget>'), schema_path
    )
