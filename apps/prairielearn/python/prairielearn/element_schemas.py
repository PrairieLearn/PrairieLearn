"""JSON Schema validation helpers for PrairieLearn elements."""

import functools
import json
import pathlib
from collections.abc import Iterator, Mapping
from typing import Any, cast

import lxml.etree
import lxml.html
from jsonschema import Draft202012Validator, FormatChecker, ValidationError
from jsonschema.validators import extend

from prairielearn.html_utils import (
    inner_html,
    is_pl_boolean,
    is_pl_float,
    is_pl_integer,
)

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


def _unique_child_inner_html(
    validator: Draft202012Validator,
    value: Any,
    instance: Any,
    schema: Any,
) -> Iterator[ValidationError]:
    del validator, schema
    if value is not True:
        return
    seen = set()
    if isinstance(instance, list):
        children = instance
    elif isinstance(instance, Mapping):
        children = instance.get("children", [])
    else:
        return
    if not isinstance(children, list):
        return
    for child in children:
        if not isinstance(child, Mapping):
            continue
        inner_html_value = child.get("innerHtml", "")
        if not isinstance(inner_html_value, str):
            continue
        inner_html_value = inner_html_value.strip()
        if inner_html_value in seen:
            yield ValidationError(f"Duplicate child inner HTML: {inner_html_value!r}")
        seen.add(inner_html_value)


def _pl_float_range(
    validator: Draft202012Validator,
    value: Any,
    instance: Any,
    schema: Any,
) -> Iterator[ValidationError]:
    del validator, schema
    if not isinstance(value, list) or len(value) != 2:
        return
    minimum, maximum = value
    if not isinstance(minimum, int | float) or not isinstance(maximum, int | float):
        return
    if not isinstance(instance, str | int | float):
        return
    try:
        parsed = float(instance)
    except ValueError:
        return
    if not minimum <= parsed <= maximum:
        yield ValidationError(f"must be in the range [{minimum:.1f}, {maximum:.1f}]")


PL_KEYWORDS = {
    "pl-float-range": _pl_float_range,
    "unique-child-inner-html": _unique_child_inner_html,
}
PLValidator = extend(Draft202012Validator, validators=PL_KEYWORDS)

_JSON_SCHEMA_KEYWORDS = frozenset({
    "$anchor",
    "$comment",
    "$defs",
    "$dynamicAnchor",
    "$dynamicRef",
    "$id",
    "$ref",
    "$schema",
    "$vocabulary",
    "additionalItems",
    "additionalProperties",
    "allOf",
    "anyOf",
    "const",
    "contains",
    "contentEncoding",
    "contentMediaType",
    "contentSchema",
    "default",
    "definitions",
    "dependentRequired",
    "dependentSchemas",
    "deprecated",
    "description",
    "else",
    "enum",
    "errorMessage",
    "examples",
    "exclusiveMaximum",
    "exclusiveMinimum",
    "format",
    "if",
    "items",
    "maxContains",
    "maxItems",
    "maxLength",
    "maxProperties",
    "maximum",
    "minContains",
    "minItems",
    "minLength",
    "minProperties",
    "minimum",
    "multipleOf",
    "not",
    "oneOf",
    "pattern",
    "patternProperties",
    "prefixItems",
    "properties",
    "propertyNames",
    "readOnly",
    "required",
    "then",
    "title",
    "type",
    "unevaluatedItems",
    "unevaluatedProperties",
    "uniqueItems",
    "writeOnly",
})


@functools.cache
def _load_schema(path: pathlib.Path) -> dict[str, Any]:
    schema = json.loads(path.read_text())
    _assert_registered_names(schema)
    return schema


def validate_element(element: lxml.html.HtmlElement, schema_path: pathlib.Path) -> None:
    """Validate an element against a PrairieLearn element schema."""
    schema = _load_schema(schema_path)
    envelope = _build_envelope(element)
    validator = PLValidator(schema, format_checker=pl_format_checker)
    first = next(validator.iter_errors(envelope), None)
    if first is not None:
        raise ValueError(_render_error(first, schema))


def _normalize_attrs(attribs: Mapping[str, Any]) -> dict[str, str]:
    return {key.replace("_", "-"): value for key, value in attribs.items()}


def _build_envelope(element: lxml.html.HtmlElement) -> dict[str, Any]:
    return {
        "tag": cast(str, element.tag).replace("_", "-"),
        "attributes": _normalize_attrs(cast(Mapping[str, str], element.attrib)),
        "text": element.text_content(),
        "innerHtml": inner_html(element),
        "children": [
            {
                "tag": cast(str, child.tag).replace("_", "-"),
                "attributes": _normalize_attrs(cast(Mapping[str, str], child.attrib)),
                "text": child.text_content(),
                "innerHtml": inner_html(child),
            }
            for child in element
            if not isinstance(child, lxml.etree._Comment)
        ],
    }


def _assert_registered_names(schema: Any) -> None:
    registered_formats = set(pl_format_checker.checkers)
    registered_keywords = set(PL_KEYWORDS)
    for path, name in _iter_referenced_formats(schema):
        if name not in registered_formats:
            raise ValueError(
                f"Schema references unregistered format {name!r} at {path}"
            )
    for path, name in _iter_referenced_pl_keywords(schema):
        if name not in registered_keywords:
            raise ValueError(
                f"Schema references unregistered PL keyword {name!r} at {path}"
            )


def _iter_referenced_formats(schema: Any, path: str = "#") -> Iterator[tuple[str, str]]:
    if not isinstance(schema, dict):
        return
    format_name = schema.get("format")
    if isinstance(format_name, str):
        yield path, format_name
    yield from _iter_subschemas(schema, path, _iter_referenced_formats)


def _iter_referenced_pl_keywords(
    schema: Any, path: str = "#"
) -> Iterator[tuple[str, str]]:
    if not isinstance(schema, dict):
        return
    for key in schema:
        if key in PL_KEYWORDS or ("-" in key and key not in _JSON_SCHEMA_KEYWORDS):
            yield f"{path}/{key}", key
    yield from _iter_subschemas(schema, path, _iter_referenced_pl_keywords)


def _iter_subschemas(
    schema: dict[str, Any],
    path: str,
    visit: Any,
) -> Iterator[tuple[str, str]]:
    for key in (
        "additionalProperties",
        "propertyNames",
        "items",
        "contains",
        "not",
        "if",
        "then",
        "else",
    ):
        if key in schema:
            yield from visit(schema[key], f"{path}/{key}")

    for key in (
        "properties",
        "patternProperties",
        "dependentSchemas",
        "$defs",
        "definitions",
    ):
        value = schema.get(key)
        if isinstance(value, dict):
            for name, subschema in value.items():
                yield from visit(subschema, f"{path}/{key}/{name}")

    for key in ("prefixItems", "allOf", "anyOf", "oneOf"):
        value = schema.get(key)
        if isinstance(value, list):
            for index, subschema in enumerate(value):
                yield from visit(subschema, f"{path}/{key}/{index}")


def _render_error(error: ValidationError, root_schema: Any | None = None) -> str:
    error_message = (
        error.schema.get("errorMessage") if isinstance(error.schema, dict) else None
    )
    if error_message is None and root_schema is not None:
        error_message = _find_nearest_error_message(
            root_schema, list(error.schema_path)
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


def _find_nearest_error_message(root_schema: Any, schema_path: list[Any]) -> Any:
    current = root_schema
    candidates = []
    for part in schema_path:
        if isinstance(current, dict) and "errorMessage" in current:
            candidates.append(current["errorMessage"])
        if isinstance(current, dict):
            current = current.get(part)
        elif (
            isinstance(current, list) and isinstance(part, int) and part < len(current)
        ):
            current = current[part]
        else:
            break
    if isinstance(current, dict) and "errorMessage" in current:
        candidates.append(current["errorMessage"])
    return candidates[-1] if candidates else None
