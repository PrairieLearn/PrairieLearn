import json
from pathlib import Path
from typing import Any

import lxml.html
import pytest
from jsonschema import ValidationError
from prairielearn.element_schemas import (
    _attribute_name,
    _normalize_attrs,
    validate_element,
    validate_element_tree,
)


def test_normalize_attrs_replaces_underscores() -> None:
    assert _normalize_attrs({"answers_name": "x"}) == {"answers-name": "x"}


def test_normalize_attrs_prefers_hyphenated_spelling() -> None:
    assert _normalize_attrs({"number-answers": "3", "number_answers": "bad"}) == {
        "number-answers": "3"
    }
    assert _normalize_attrs({"number_answers": "bad", "number-answers": "3"}) == {
        "number-answers": "3"
    }


def test_attribute_name_empty_path_returns_none() -> None:
    assert _attribute_name(ValidationError("boom")) is None


@pytest.mark.parametrize(
    ("schema", "html", "expected"),
    [
        (
            {"type": "object", "required": ["answers-name"]},
            "<pl-widget></pl-widget>",
            r'<pl-widget> is missing required attribute "answers-name"\.',
        ),
        (
            {
                "type": "object",
                "properties": {"answers-name": {"type": "string"}},
                "additionalProperties": False,
            },
            '<pl-widget answers-name="x" bogus="true"></pl-widget>',
            r'Unknown attribute "bogus" on <pl-widget>\.',
        ),
        (
            {
                "type": "object",
                "properties": {"weight": {"type": "string", "format": "integer"}},
            },
            '<pl-widget weight="1.5"></pl-widget>',
            r'Attribute "weight" on <pl-widget> must match format "integer"\.',
        ),
        (
            {
                "type": "object",
                "properties": {
                    "display": {"type": "string", "enum": ["block", "inline"]}
                },
            },
            '<pl-widget display="grid"></pl-widget>',
            r'Attribute "display" on <pl-widget> must be one of: "block", "inline"\.',
        ),
        (
            {
                "type": "object",
                "properties": {
                    "all-of-the-above": {
                        "anyOf": [
                            {"type": "string", "format": "boolean"},
                            {"type": "string", "enum": ["false", "random", "correct"]},
                        ]
                    }
                },
            },
            '<pl-widget all-of-the-above="maybe"></pl-widget>',
            (
                r'Attribute "all-of-the-above" on <pl-widget> must match format '
                r'"boolean" or be one of: "false", "random", "correct"\.'
            ),
        ),
        (
            {
                "type": "object",
                "properties": {
                    "weight": {
                        "type": "string",
                        "format": "integer",
                        "errorMessage": "Use a real weight.",
                    }
                },
            },
            '<pl-widget weight="1.5"></pl-widget>',
            "Use a real weight.",
        ),
        (
            {
                "type": "object",
                "properties": {
                    "weight": {
                        "type": "string",
                        "format": "integer",
                        "errorMessage": {"format": "Weight must be a whole number."},
                    }
                },
            },
            '<pl-widget weight="1.5"></pl-widget>',
            r"Weight must be a whole number\.",
        ),
        (
            {
                "type": "object",
                "properties": {
                    "weight": {
                        "type": "string",
                        "format": "integer",
                        "errorMessage": {"_": "Bad weight."},
                    }
                },
            },
            '<pl-widget weight="1.5"></pl-widget>',
            r"Bad weight\.",
        ),
        (
            {
                "type": "object",
                "properties": {"answers-name": {"type": "string"}},
                "additionalProperties": False,
            },
            '<pl-widget answers-name="x" foo="1" bar="2"></pl-widget>',
            r'Unknown attribute "bar" on <pl-widget>\.',
        ),
        (
            {"type": "object", "properties": {"weight": {"type": "integer"}}},
            '<pl-widget weight="1"></pl-widget>',
            r'Attribute "weight" on <pl-widget> must be integer\.',
        ),
        (
            {
                "type": "object",
                "properties": {"weight": {"type": ["integer", "null"]}},
            },
            '<pl-widget weight="1"></pl-widget>',
            r'Attribute "weight" on <pl-widget> must be integer or null\.',
        ),
        (
            {
                "type": "object",
                "properties": {
                    "value": {
                        "oneOf": [
                            {"type": "string", "format": "integer"},
                            {"type": "string", "enum": ["auto"]},
                        ]
                    }
                },
            },
            '<pl-widget value="bogus"></pl-widget>',
            (
                r'Attribute "value" on <pl-widget> must match format "integer" '
                r'or be one of: "auto"\.'
            ),
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


def test_validate_element_includes_parent_context(tmp_path: Path) -> None:
    schema = {
        "type": "object",
        "properties": {"answers-name": {"type": "string"}},
        "additionalProperties": False,
    }
    schema_path = tmp_path / "schema.json"
    schema_path.write_text(json.dumps(schema))

    with pytest.raises(
        ValueError,
        match=r'Unknown attribute "bogus" on <pl-answer> inside <pl-multiple-choice>\.',
    ):
        validate_element(
            lxml.html.fragment_fromstring('<pl-answer bogus="1"></pl-answer>'),
            schema_path,
            parent_tag="pl-multiple-choice",
        )


@pytest.mark.parametrize(
    ("schema", "html"),
    [
        (
            {
                "type": "object",
                "properties": {
                    "answers-name": {"type": "string"},
                    "weight": {"type": "string", "format": "integer"},
                },
                "required": ["answers-name"],
                "additionalProperties": False,
            },
            '<pl-widget answers-name="x" weight="3"></pl-widget>',
        ),
        (
            {
                "type": "object",
                "properties": {
                    "value": {
                        "oneOf": [
                            {"type": "string", "format": "integer"},
                            {"type": "string", "enum": ["auto"]},
                        ]
                    }
                },
            },
            '<pl-widget value="auto"></pl-widget>',
        ),
    ],
)
def test_validate_element_success(
    tmp_path: Path, schema: dict[str, Any], html: str
) -> None:
    schema_path = tmp_path / "schema.json"
    schema_path.write_text(json.dumps(schema))

    validate_element(lxml.html.fragment_fromstring(html), schema_path)


def _write_element_tree_manifest(tmp_path: Path) -> Path:
    schemas_dir = tmp_path / "schemas"
    schemas_dir.mkdir()
    (schemas_dir / "pl-widget.json").write_text(
        json.dumps({
            "type": "object",
            "properties": {"answers-name": {"type": "string"}},
            "required": ["answers-name"],
            "additionalProperties": False,
        })
    )
    (schemas_dir / "pl-answer.json").write_text(
        json.dumps({
            "type": "object",
            "properties": {"correct": {"type": "string", "format": "boolean"}},
            "additionalProperties": False,
        })
    )
    manifest_path = tmp_path / "schema.json"
    manifest_path.write_text(
        json.dumps({
            "tag": "pl-widget",
            "schema": "./schemas/pl-widget.json",
            "children": [
                {
                    "tag": "pl-answer",
                    "schema": "./schemas/pl-answer.json",
                }
            ],
        })
    )
    return manifest_path


def test_validate_element_tree_success(tmp_path: Path) -> None:
    manifest_path = _write_element_tree_manifest(tmp_path)

    validate_element_tree(
        lxml.html.fragment_fromstring(
            '<pl-widget answers-name="x"><pl-answer correct="true"><strong>A</strong></pl-answer></pl-widget>'
        ),
        manifest_path,
    )


def test_validate_element_tree_allows_legacy_underscore_tags_when_enabled(
    tmp_path: Path,
) -> None:
    manifest_path = _write_element_tree_manifest(tmp_path)

    validate_element_tree(
        lxml.html.fragment_fromstring(
            '<pl-widget answers-name="x"><pl_answer correct="true"></pl_answer></pl-widget>'
        ),
        manifest_path,
        allow_legacy_underscore_tags=True,
    )


@pytest.mark.parametrize(
    ("html", "expected"),
    [
        (
            '<pl-widget answers-name="x"><pl-answer bogus="1"></pl-answer></pl-widget>',
            r'Unknown attribute "bogus" on pl-widget > pl-answer:nth-of-type\(1\)\.',
        ),
        (
            '<pl-widget answers-name="x"><pl_answer correct="true"></pl_answer></pl-widget>',
            r"Unexpected child pl_answer at pl-widget > pl_answer:nth-of-type\(1\)\. Expected: pl-answer\.",
        ),
        (
            '<pl-widget answers-name="x"><p>A</p></pl-widget>',
            r"Unexpected child p at pl-widget > p:nth-of-type\(1\)\. Expected: pl-answer\.",
        ),
    ],
)
def test_validate_element_tree_errors(tmp_path: Path, html: str, expected: str) -> None:
    manifest_path = _write_element_tree_manifest(tmp_path)

    with pytest.raises(ValueError, match=expected):
        validate_element_tree(lxml.html.fragment_fromstring(html), manifest_path)
