"""JSON Schema validation helpers for PrairieLearn elements."""

import functools
import json
import pathlib
from collections.abc import Iterator, Mapping
from typing import Any

import lxml.html
from jsonschema import Draft202012Validator, FormatChecker, ValidationError
from jsonschema.validators import extend

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


def _is_number(checker: Any, instance: Any) -> bool:
    del checker
    return (isinstance(instance, int | float) and not isinstance(instance, bool)) or (
        isinstance(instance, str) and is_pl_float(instance)
    )


def _number_value(instance: Any) -> float | None:
    if isinstance(instance, int | float) and not isinstance(instance, bool):
        return float(instance)
    if isinstance(instance, str) and is_pl_float(instance):
        return float(instance)
    return None


def _minimum(
    validator: Draft202012Validator,
    minimum: Any,
    instance: Any,
    schema: Any,
) -> Iterator[ValidationError]:
    del validator, schema
    value = _number_value(instance)
    if value is not None and value < minimum:
        yield ValidationError(f"{instance!r} is less than the minimum of {minimum!r}")


def _maximum(
    validator: Draft202012Validator,
    maximum: Any,
    instance: Any,
    schema: Any,
) -> Iterator[ValidationError]:
    del validator, schema
    value = _number_value(instance)
    if value is not None and value > maximum:
        yield ValidationError(
            f"{instance!r} is greater than the maximum of {maximum!r}"
        )


PLValidator = extend(
    Draft202012Validator,
    type_checker=Draft202012Validator.TYPE_CHECKER.redefine("number", _is_number),
    validators={"minimum": _minimum, "maximum": _maximum},
)


@functools.cache
def _load_schema(path: pathlib.Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def validate_element(element: lxml.html.HtmlElement, schema_path: pathlib.Path) -> None:
    """Validate an element's attributes against a PrairieLearn element schema."""
    schema = _load_schema(schema_path)
    validator = PLValidator(schema, format_checker=pl_format_checker)
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
