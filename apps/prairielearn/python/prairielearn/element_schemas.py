"""JSON Schema validation helpers for PrairieLearn elements."""

import functools
import json
import pathlib
from collections.abc import Mapping
from typing import Any

import lxml.html
from jsonschema import FormatChecker, ValidationError
from jsonschema.validators import validator_for

from prairielearn.html_utils import (
    is_boolean_attrib,
    is_float_attrib,
    is_integer_attrib,
)

__all__ = ["validate_element"]

pl_format_checker = FormatChecker(formats=())


def _check_boolean_attrib(value: object) -> bool:
    return isinstance(value, str) and is_boolean_attrib(value)


def _check_integer_attrib(value: object) -> bool:
    return isinstance(value, str) and is_integer_attrib(value)


def _check_float_attrib(value: object) -> bool:
    return isinstance(value, str) and is_float_attrib(value)


pl_format_checker.checks("boolean-attrib")(_check_boolean_attrib)
pl_format_checker.checks("integer-attrib")(_check_integer_attrib)
pl_format_checker.checks("float-attrib")(_check_float_attrib)

_FORMAT_DESCRIPTIONS = {
    "boolean-attrib": "a boolean value",
    "integer-attrib": "an integer",
    "float-attrib": "a number",
}


@functools.cache
def _load_validator(path: pathlib.Path) -> Any:
    schema = json.loads(path.read_text())
    validator_cls = validator_for(schema)
    validator_cls.check_schema(schema)
    return validator_cls(schema, format_checker=pl_format_checker)


def validate_element(element: lxml.html.HtmlElement, schema_path: pathlib.Path) -> None:
    """Validate an element's attributes against a PrairieLearn element schema."""
    validator = _load_validator(schema_path)
    first = next(validator.iter_errors(_normalize_attrs(dict(element.attrib))), None)
    if first is not None:
        raise ValueError(_render_error(first))


def _normalize_attrs(attribs: Mapping[str, Any]) -> dict[str, Any]:
    return {key.replace("_", "-"): value for key, value in attribs.items()}


def _render_error(error: ValidationError) -> str:
    error_message = (
        error.schema.get("errorMessage") if isinstance(error.schema, dict) else None
    )
    if isinstance(error_message, str):
        return error_message
    if isinstance(error_message, dict):
        return (
            error_message.get(error.validator)
            or error_message.get("_")
            or error.message
        )
    if error.validator == "required":
        return _render_required_error(error)
    if error.validator == "additionalProperties":
        return _render_additional_properties_error(error)
    if error.validator == "format":
        return _render_format_error(error)
    if error.validator == "enum":
        return _render_enum_error(error)
    if error.validator == "type":
        return _render_type_error(error)
    if error.validator in {"anyOf", "oneOf"}:
        return _render_disjunctive_error(error)
    return error.message


def _render_required_error(error: ValidationError) -> str:
    required = error.validator_value
    if isinstance(required, list) and isinstance(error.instance, Mapping):
        missing = next(
            (
                name
                for name in required
                if isinstance(name, str) and name not in error.instance
            ),
            None,
        )
        if missing is not None:
            return f'Attribute "{missing}" is required.'
    return error.message


def _render_additional_properties_error(error: ValidationError) -> str:
    if isinstance(error.instance, Mapping) and isinstance(error.schema, dict):
        properties = error.schema.get("properties", {})
        if isinstance(properties, dict):
            unexpected = sorted(
                str(key) for key in error.instance if key not in properties
            )
            if unexpected:
                return _render_not_allowed_attributes(unexpected)
    return error.message


def _render_not_allowed_attributes(attributes: list[str]) -> str:
    if len(attributes) == 1:
        return f'Attribute "{attributes[0]}" is not allowed.'
    if len(attributes) == 2:
        return f'Attributes "{attributes[0]}" and "{attributes[1]}" are not allowed.'
    quoted = ", ".join(f'"{attribute}"' for attribute in attributes[:-1])
    return f'Attributes {quoted}, and "{attributes[-1]}" are not allowed.'


def _render_format_error(error: ValidationError) -> str:
    attribute = _attribute_name(error)
    format_name = error.validator_value
    if isinstance(format_name, str):
        description = _format_description(format_name)
        return f'Attribute "{attribute}" must be {description}.'
    return error.message


def _render_enum_error(error: ValidationError) -> str:
    attribute = _attribute_name(error)
    enum_values = error.validator_value
    if isinstance(enum_values, list):
        return f'Attribute "{attribute}" must be one of: {_format_values(enum_values)}.'
    return error.message


def _render_type_error(error: ValidationError) -> str:
    attribute = _attribute_name(error)
    expected_type = error.validator_value
    if isinstance(expected_type, str):
        return f'Attribute "{attribute}" must be {_type_description(expected_type)}.'
    if isinstance(expected_type, list):
        return (
            f'Attribute "{attribute}" must be '
            f"{' or '.join(_type_description(value) for value in expected_type)}."
        )
    return error.message


def _render_disjunctive_error(error: ValidationError) -> str:
    attribute = _attribute_name(error)
    constraints = [_constraint_description(context) for context in error.context]
    constraints = [constraint for constraint in constraints if constraint is not None]
    if constraints:
        return f'Attribute "{attribute}" must be {_join_constraints(constraints)}.'
    return error.message


def _constraint_description(error: ValidationError) -> str | None:
    if error.validator == "format" and isinstance(error.validator_value, str):
        return _format_description(error.validator_value)
    if error.validator == "enum" and isinstance(error.validator_value, list):
        return f"one of: {_format_values(error.validator_value)}"
    if error.validator == "type":
        expected_type = error.validator_value
        if isinstance(expected_type, str):
            return _type_description(expected_type)
        if isinstance(expected_type, list):
            return " or ".join(_type_description(value) for value in expected_type)
    return None


def _attribute_name(error: ValidationError) -> str:
    if error.path:
        return ".".join(str(part) for part in error.path)
    return "attribute"


def _format_description(format_name: str) -> str:
    return _FORMAT_DESCRIPTIONS.get(format_name, f'a valid "{format_name}" value')


def _format_values(values: list[Any]) -> str:
    return ", ".join(str(value) for value in values)


def _join_constraints(constraints: list[str]) -> str:
    if len(constraints) == 1:
        return constraints[0]
    if len(constraints) == 2:
        return f"{constraints[0]} or {constraints[1]}"
    return f"{', '.join(constraints[:-1])}, or {constraints[-1]}"


def _type_description(value: str) -> str:
    if value == "string":
        return "a string"
    if value == "number":
        return "a number"
    if value == "integer":
        return "an integer"
    if value == "boolean":
        return "a boolean"
    if value == "object":
        return "an object"
    if value == "array":
        return "an array"
    if value == "null":
        return "null"
    return value
