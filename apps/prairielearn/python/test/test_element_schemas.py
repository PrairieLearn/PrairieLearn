import json
from pathlib import Path
from typing import Any

import lxml.html
import pytest
from jsonschema import ValidationError
from prairielearn.element_schemas import (
    _attribute_name,
    _format_description,
    _join_constraints,
    _normalize_attrs,
    _type_description,
    validate_element,
)


def test_normalize_attrs_replaces_underscores() -> None:
    assert _normalize_attrs({"answers_name": "x"}) == {"answers-name": "x"}


def test_attribute_name_empty_path_fallback() -> None:
    assert _attribute_name(ValidationError("boom")) == "attribute"


def test_format_description_unknown_format_default() -> None:
    assert _format_description("mystery") == 'a valid "mystery" value'


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("string", "a string"),
        ("number", "a number"),
        ("integer", "an integer"),
        ("boolean", "a boolean"),
        ("object", "an object"),
        ("array", "an array"),
        ("null", "null"),
        ("custom", "custom"),
    ],
)
def test_type_description(value: str, expected: str) -> None:
    assert _type_description(value) == expected


@pytest.mark.parametrize(
    ("constraints", "expected"),
    [
        (["a number"], "a number"),
        (["a number", "an integer"], "a number or an integer"),
        (
            ["a number", "an integer", "null"],
            "a number, an integer, or null",
        ),
    ],
)
def test_join_constraints(constraints: list[str], expected: str) -> None:
    assert _join_constraints(constraints) == expected


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
                "properties": {
                    "weight": {"type": "string", "format": "integer-attrib"}
                },
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
                            {"type": "string", "format": "boolean-attrib"},
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
                        "format": "integer-attrib",
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
                        "format": "integer-attrib",
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
                        "format": "integer-attrib",
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
            r'Attributes "bar" and "foo" are not allowed\.',
        ),
        (
            {
                "type": "object",
                "properties": {"answers-name": {"type": "string"}},
                "additionalProperties": False,
            },
            '<pl-widget answers-name="x" foo="1" bar="2" baz="3"></pl-widget>',
            r'Attributes "bar", "baz", and "foo" are not allowed\.',
        ),
        (
            {"type": "object", "properties": {"weight": {"type": "integer"}}},
            '<pl-widget weight="1"></pl-widget>',
            r'Attribute "weight" must be an integer\.',
        ),
        (
            {
                "type": "object",
                "properties": {"weight": {"type": ["integer", "null"]}},
            },
            '<pl-widget weight="1"></pl-widget>',
            r'Attribute "weight" must be an integer or null\.',
        ),
        (
            {
                "type": "object",
                "properties": {
                    "value": {
                        "oneOf": [
                            {"type": "string", "format": "integer-attrib"},
                            {"type": "string", "enum": ["auto"]},
                        ]
                    }
                },
            },
            '<pl-widget value="bogus"></pl-widget>',
            r'Attribute "value" must be an integer or one of: auto\.',
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


@pytest.mark.parametrize(
    ("schema", "html"),
    [
        (
            {
                "type": "object",
                "properties": {
                    "answers-name": {"type": "string"},
                    "weight": {"type": "string", "format": "integer-attrib"},
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
                            {"type": "string", "format": "integer-attrib"},
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
