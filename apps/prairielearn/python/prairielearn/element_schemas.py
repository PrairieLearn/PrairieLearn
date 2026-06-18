"""JSON Schema validation helpers for PrairieLearn element attributes and structure.

Attribute schema error messages intentionally mirror the wording produced by
the `@prairielearn/tree-sitter-htmlmustache` linter. Tree validation adds
Python-side selector context for parent/child paths.
"""

import functools
import json
import pathlib
from collections.abc import Mapping
from typing import Any, NotRequired, TypedDict, cast

import lxml.etree
import lxml.html
from jsonschema import FormatChecker, ValidationError
from jsonschema.validators import validator_for

from prairielearn.html_utils import (
    is_boolean_attrib,
    is_float_attrib,
    is_integer_attrib,
)

__all__ = ["validate_element", "validate_element_tree"]


class ElementSchemaManifestChild(TypedDict):
    tag: str
    schema: NotRequired[str]
    children: NotRequired[list["ElementSchemaManifestChild"]]
    allowAdditionalChildren: NotRequired[bool]


class ElementSchemaManifest(TypedDict):
    tag: str
    schema: str
    children: NotRequired[list[ElementSchemaManifestChild]]


pl_format_checker = FormatChecker(formats=())


def _check_boolean_attrib(value: object) -> bool:
    return isinstance(value, str) and is_boolean_attrib(value)


def _check_integer_attrib(value: object) -> bool:
    return isinstance(value, str) and is_integer_attrib(value)


def _check_float_attrib(value: object) -> bool:
    return isinstance(value, str) and is_float_attrib(value)


pl_format_checker.checks("boolean")(_check_boolean_attrib)
pl_format_checker.checks("integer")(_check_integer_attrib)
pl_format_checker.checks("number")(_check_float_attrib)


@functools.cache
def _load_validator(path: pathlib.Path) -> Any:
    schema = json.loads(path.read_text())
    validator_cls = validator_for(schema)
    validator_cls.check_schema(schema)
    return validator_cls(schema, format_checker=pl_format_checker)


@functools.cache
def _load_manifest(path: pathlib.Path) -> ElementSchemaManifest:
    return cast(ElementSchemaManifest, json.loads(path.read_text()))


def validate_element(
    element: lxml.html.HtmlElement,
    schema_path: pathlib.Path,
    *,
    parent_tag: str | None = None,
) -> None:
    """Validate an element's attributes against a PrairieLearn element schema.

    `parent_tag`, when provided, is woven into the message the same way the
    linter does for nested elements (e.g. `<pl-answer> inside <pl-multiple-choice>`).
    """
    _validate_element_at_context(
        element, schema_path, _tag_context(_tag_name(element), parent_tag)
    )


def validate_element_tree(
    element: lxml.html.HtmlElement,
    manifest_path: pathlib.Path,
) -> None:
    """Validate an element subtree against an element schema manifest.

    This is a lightweight first pass for local structure: the root tag,
    contextual child tags, and each declared tag's attributes. Element Python
    code remains responsible for semantic validation.
    """
    manifest = _load_manifest(manifest_path)
    _validate_element_tree_node(
        element,
        manifest,
        manifest_path.parent,
        manifest["tag"],
    )


def _validate_element_at_context(
    element: lxml.html.HtmlElement,
    schema_path: pathlib.Path,
    context: str,
) -> None:
    validator = _load_validator(schema_path)
    first = next(validator.iter_errors(_normalize_attrs(dict(element.attrib))), None)
    if first is not None:
        raise ValueError(_render_error(first, context))


def _validate_element_tree_node(
    element: lxml.html.HtmlElement,
    manifest: ElementSchemaManifest | ElementSchemaManifestChild,
    manifest_dir: pathlib.Path,
    context: str,
) -> None:
    actual_tag = _manifest_tag_name(element)
    expected_tag = manifest["tag"]
    if actual_tag != expected_tag:
        raise ValueError(f"Expected {expected_tag} at {context}, not {actual_tag}.")

    schema_path = manifest.get("schema")
    if schema_path is not None:
        _validate_element_at_context(element, manifest_dir / schema_path, context)

    children = manifest.get("children")
    if children is None:
        return

    child_manifests = {child["tag"]: child for child in children}
    child_counts: dict[str, int] = {}
    for child in element:
        if isinstance(child, lxml.etree._Comment):
            continue
        child_tag = _manifest_tag_name(child)
        child_counts[child_tag] = child_counts.get(child_tag, 0) + 1
        child_context = (
            f"{context} > {child_tag}:nth-of-type({child_counts[child_tag]})"
        )
        child_manifest = child_manifests.get(child_tag)
        if child_manifest is not None:
            _validate_element_tree_node(
                child, child_manifest, manifest_dir, child_context
            )
        elif not manifest.get("allowAdditionalChildren", False):
            allowed = ", ".join(sorted(child_manifests))
            raise ValueError(
                f"Unexpected child {child_tag} at {child_context}. Expected: {allowed}."
            )


def _tag_name(element: lxml.html.HtmlElement) -> str:
    tag = element.tag
    return tag.lower() if isinstance(tag, str) else "element"


def _manifest_tag_name(element: lxml.html.HtmlElement) -> str:
    return _tag_name(element).replace("_", "-")


def _normalize_attrs(attribs: Mapping[str, Any]) -> dict[str, Any]:
    # When both spellings are present, the hyphenated one wins regardless of
    # attribute order, matching `_get_attrib()`.
    return {
        key.replace("_", "-"): value
        for key, value in attribs.items()
        if "_" not in key or key.replace("_", "-") not in attribs
    }


def _tag_context(tag: str, parent_tag: str | None) -> str:
    return f"<{tag}> inside <{parent_tag}>" if parent_tag else f"<{tag}>"


def _render_error(error: ValidationError, context: str) -> str:
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
        missing = _missing_required_attribute(error)
        if missing is not None:
            return f'{context} is missing required attribute "{missing}".'
        return error.message
    if error.validator == "additionalProperties":
        unexpected = _first_unexpected_attribute(error)
        if unexpected is not None:
            return f'Unknown attribute "{unexpected}" on {context}.'
        return error.message
    if error.validator in {"anyOf", "oneOf"}:
        return _render_disjunctive_error(error, context)

    attribute = _attribute_name(error)
    phrase = _constraint_phrase(error)
    if attribute is not None and phrase is not None:
        return f'Attribute "{attribute}" on {context} must {phrase}.'
    return error.message


def _missing_required_attribute(error: ValidationError) -> str | None:
    required = error.validator_value
    if isinstance(required, list) and isinstance(error.instance, Mapping):
        return next(
            (
                name
                for name in required
                if isinstance(name, str) and name not in error.instance
            ),
            None,
        )
    return None


def _first_unexpected_attribute(error: ValidationError) -> str | None:
    if isinstance(error.instance, Mapping) and isinstance(error.schema, dict):
        properties = error.schema.get("properties", {})
        if isinstance(properties, dict):
            unexpected = sorted(
                str(key) for key in error.instance if key not in properties
            )
            if unexpected:
                return unexpected[0]
    return None


def _render_disjunctive_error(error: ValidationError, context: str) -> str:
    attribute = _attribute_name(error)
    phrases: list[str] = []
    for branch in error.context:
        phrase = _constraint_phrase(branch)
        if phrase is not None and phrase not in phrases:
            phrases.append(phrase)
    if attribute is not None and phrases:
        return f'Attribute "{attribute}" on {context} must {" or ".join(phrases)}.'
    return error.message


def _constraint_phrase(error: ValidationError) -> str | None:
    validator = error.validator
    value = error.validator_value
    if validator == "type":
        formatted = " or ".join(value) if isinstance(value, list) else str(value)
        return f"be {formatted}"
    if validator == "enum" and isinstance(value, list):
        return f"be one of: {_format_values(value)}"
    if validator == "const":
        return f"be {json.dumps(value)}"
    if validator == "minimum":
        return f"be >= {value}"
    if validator == "maximum":
        return f"be <= {value}"
    if validator == "format" and isinstance(value, str):
        return f"match format {json.dumps(value)}"
    if validator == "pattern" and isinstance(value, str):
        return f"match pattern {json.dumps(value)}"
    return None


def _attribute_name(error: ValidationError) -> str | None:
    return str(error.path[0]) if error.path else None


def _format_values(values: list[Any]) -> str:
    return ", ".join(json.dumps(value) for value in values)
