"""JSON Schema validation helpers for PrairieLearn elements."""

import functools
import json
import pathlib
from collections.abc import Mapping
from typing import Any

import lxml.html
from jsonschema import FormatChecker, ValidationError
from jsonschema.validators import validator_for

from prairielearn.html_utils import is_pl_boolean, is_pl_float, is_pl_integer

pl_format_checker = FormatChecker(formats=())


def _check_pl_boolean(value: object) -> bool:
    return isinstance(value, str) and is_pl_boolean(value)


def _check_pl_integer(value: object) -> bool:
    return isinstance(value, str) and is_pl_integer(value)


def _check_pl_float(value: object) -> bool:
    return isinstance(value, str) and is_pl_float(value)


pl_format_checker.checks("pl-boolean")(_check_pl_boolean)
pl_format_checker.checks("pl-integer")(_check_pl_integer)
pl_format_checker.checks("pl-float")(_check_pl_float)


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
    return error.message
