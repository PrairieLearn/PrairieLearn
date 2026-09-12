from __future__ import annotations

import copy
import re
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from types import (
    MappingProxyType as frozendict,  # ruff: ignore[camelcase-imported-as-lowercase]
)
from typing import Any, Final, Literal, cast

import chevron
import lxml.html
import prairielearn as pl
import prairielearn.big_operator as pbo
import prairielearn.internal.symbolic_input as psi
import prairielearn.sympy_utils as psu
import sympy
import sympy.sets

HERE: Final = Path(__file__).parent
SCHEMA_PATH: Final = HERE / "schemas" / "pl-big-operator-input.json"
SYMBOLIC_INPUT_TEMPLATE_PATH: Final = (
    HERE.parent / "pl-symbolic-input" / "pl-symbolic-input.mustache"
)

BODY_SIZE_DEFAULT: Final = 16
BOUNDS_INDEX_FIELD_SIZE_DEFAULT: Final = 7
ANNOTATION_INDEX_FIELD_SIZE_DEFAULT: Final = 10
IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT: Final = "i"
DISPLAY_DEFAULT: Final = psi.DisplayType.BLOCK
DISPLAY_LOG_AS_LN_DEFAULT: Final = False

type BuiltinOperator = Literal[
    "sum",
    "product",
    "integral",
    "limit",
    "union",
    "intersection",
    "disjoint-union",
    "min",
    "max",
]
type Operator = pbo.BigOperatorName
type BuiltinOperatorFn = Literal[
    "Sum",
    "Product",
    "Integral",
    "Limit",
    "Union",
    "Intersection",
    "DisjointUnion",
    "Min",
    "Max",
]
type OperatorFn = Literal["Custom"] | BuiltinOperatorFn
type Indexing = pbo.BigOperatorIndexing


@dataclass(frozen=True, slots=True)
class OperatorMetadata:
    fn_name: BuiltinOperatorFn
    tex: str
    valid_indexing: frozenset[Indexing]
    bounds_constructor: type[sympy.Basic]
    _domain_constructor: type[sympy.Basic] | None = None

    @property
    def domain_constructor(self) -> type[sympy.Basic]:
        return self._domain_constructor or self.bounds_constructor


_BOUNDS_DOMAIN: Final[frozenset[Indexing]] = frozenset(("bounds", "domain"))
OP_METADATA: Final[frozendict[BuiltinOperator, OperatorMetadata]] = frozendict({
    "sum": OperatorMetadata("Sum", r"\sum", _BOUNDS_DOMAIN, sympy.Sum, sympy.Add),
    "product": OperatorMetadata(
        "Product", r"\prod", _BOUNDS_DOMAIN, sympy.Product, sympy.Mul
    ),
    "integral": OperatorMetadata("Integral", r"\int", _BOUNDS_DOMAIN, sympy.Integral),
    "limit": OperatorMetadata(
        "Limit", r"\lim", frozenset(("approaches",)), sympy.Limit
    ),
    "union": OperatorMetadata("Union", r"\bigcup", _BOUNDS_DOMAIN, sympy.Union),
    "intersection": OperatorMetadata(
        "Intersection", r"\bigcap", _BOUNDS_DOMAIN, sympy.Intersection
    ),
    "disjoint-union": OperatorMetadata(
        "DisjointUnion",
        r"\bigsqcup",
        _BOUNDS_DOMAIN,
        sympy.sets.DisjointUnion,
    ),
    "min": OperatorMetadata("Min", r"\min", _BOUNDS_DOMAIN, sympy.Min),
    "max": OperatorMetadata("Max", r"\max", _BOUNDS_DOMAIN, sympy.Max),
})


def _operator_fn_name(operator: Operator) -> OperatorFn:
    return "Custom" if operator == "custom" else OP_METADATA[operator].fn_name


type DirectionName = pbo.BigOperatorDirection
type DirectionSymbol = Literal["+-", "-", "+"]
DIRECTION_SYMBOLS: Final[frozendict[DirectionName, DirectionSymbol]] = frozendict({
    "two-sided": "+-",
    "from-left": "-",
    "from-right": "+",
})
DIRECTION_NAMES: Final[frozendict[DirectionSymbol, DirectionName]] = frozendict({
    symbol: name for name, symbol in DIRECTION_SYMBOLS.items()
})
type FormattedCall = tuple[str, tuple[str, ...]]
type Component = Literal["lower", "upper", "domain", "target", "body"]
COMPONENTS_MAP: Final[frozendict[Indexing, frozenset[Component]]] = frozendict({
    "bounds": frozenset(("lower", "upper", "body")),
    "domain": frozenset(("domain", "body")),
    "approaches": frozenset(("target", "body")),
})
type ResponseComponent = Literal["direction"] | Component
type ResponseValues = dict[ResponseComponent, sympy.Basic]

type GradingMethod = Literal["equivalent", "component", "exact", "none"]
GRADING_METHODS: Final[frozenset[GradingMethod]] = frozenset((
    "equivalent",
    "component",
    "exact",
    "none",
))
type AllowedBlank = Literal["none", "indices", "body", "all"]
ALLOWED_BLANKS: Final[frozenset[AllowedBlank]] = frozenset((
    "none",
    "indices",
    "body",
    "all",
))


class _ParseError(ValueError):
    """An author-provided mathematical expression could not be parsed."""

    def __init__(self, src: psu.BaseSympyError) -> None:
        super().__init__(str(src))
        self._src = src


@dataclass(frozen=True, slots=True, kw_only=True)
class RenderConfig:
    answer_name: str
    operator: Operator
    operator_latex: str
    has_operator_latex_override: bool
    prefix_latex: str | None
    suffix_latex: str | None
    indexing: Indexing
    index: str
    variables: tuple[str, ...]
    custom_functions: tuple[str, ...]
    direction: DirectionName
    allow_direction_input: bool
    allowed_blank: AllowedBlank
    display: psi.DisplayType
    allow_complex: bool
    imaginary_unit: str
    display_log_as_ln: bool
    show_help_text: bool
    body_size: int
    index_field_size: int
    grading: GradingMethod
    body_weight: int
    weight: int
    correct_attribute: str | None

    @property
    def components(self) -> frozenset[Component]:
        return COMPONENTS_MAP[self.indexing]

    @property
    def response_components(self) -> Sequence[ResponseComponent]:
        if self.indexing == "approaches" and self.allow_direction_input:
            return (*self.components, "direction")
        return tuple(self.components)

    def component_name(self, component: ResponseComponent) -> str:
        return f"{self.answer_name}-{component}"


def _raw_correct_answer(
    answer: str,
    correct_attribute: str | None,
    data: Any | None,
) -> Any:
    if correct_attribute is not None:
        return correct_attribute
    if data is None:
        return None
    correct_answers = data.get("correct_answers", {})
    if not isinstance(correct_answers, dict):
        raise TypeError("data['correct_answers'] must be a mapping.")
    return correct_answers.get(answer)


def _binder_indexing(value: Any) -> Indexing | None:
    match value:
        case sympy.Limit():
            return "approaches"
        case sympy.Sum() | sympy.Product() | sympy.Integral():
            if len(value.limits) != 1:
                return None
            match len(cast(Sequence[Any], value.limits[0])):
                case 2:
                    return "domain"
                case 3:
                    return "bounds"
                case _:
                    return None
        case _:
            return None


def _split_top_level(source: str) -> list[str]:
    parts: list[str] = []
    start = 0
    depth = 0
    quote: str | None = None
    for position, character in enumerate(source):
        if quote is not None:
            if character == quote and (position == 0 or source[position - 1] != "\\"):
                quote = None
        elif character in {"'", '"'}:
            quote = character
        elif character in "([{":
            depth += 1
        elif character in ")]}":
            depth -= 1
        elif character == "," and depth == 0:
            parts.append(source[start:position].strip())
            start = position + 1
    parts.append(source[start:].strip())
    return parts


def _formatted_call(source: str, function_name: OperatorFn) -> FormattedCall | None:
    match = re.fullmatch(
        rf"\s*{re.escape(function_name)}\s*\((.*)\)\s*", source, re.DOTALL
    )
    if match is None:
        return None
    arguments = _split_top_level(match.group(1))
    if len(arguments) != 2:
        return None
    indexing_source = arguments[1].strip()
    if not (indexing_source.startswith("(") and indexing_source.endswith(")")):
        return None
    indexing_args = _split_top_level(indexing_source[1:-1])
    return arguments[0], tuple(indexing_args)


def _formatted_direction(indexing_args: Sequence[str]) -> DirectionSymbol | None:
    if len(indexing_args) != 3:
        return None
    source = indexing_args[2].strip()
    if len(source) < 2 or source[0] not in {"'", '"'} or source[-1] != source[0]:
        return None
    return source[1:-1]  # type: ignore


def _legacy_limit_call(source: str) -> FormattedCall | None:
    """Parse SymPy's documented ``Limit(body, index, target, dir=...)`` form."""
    match = re.fullmatch(r"\s*Limit\s*\((.*)\)\s*", source, re.DOTALL)
    if match is None:
        return None
    arguments = _split_top_level(match.group(1))
    if len(arguments) != 4:
        return None
    direction = re.fullmatch(r"dir\s*=\s*(['\"])(\+-|\+|-)\1", arguments[3])
    if direction is None:
        return None
    return arguments[0], (arguments[1], arguments[2], repr(direction.group(2)))


def _symbol_name(value: Any) -> str | None:
    return str(value) if isinstance(value, sympy.Symbol) else None


def _identifier(source: str) -> str | None:
    """Return a supported PrairieLearn identifier without evaluating it."""
    token = source.strip()
    return token if re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", token) else None


def _binder_index(value: Any) -> str | None:
    if isinstance(value, sympy.Limit):
        return _symbol_name(value.args[1])
    if (
        isinstance(value, (sympy.Sum, sympy.Product, sympy.Integral))
        and len(value.limits) == 1
    ):
        return _symbol_name(value.limits[0][0])  # type: ignore
    return None


def _infer_spec(
    raw: Any,
) -> tuple[Operator | None, Indexing | None, str | None]:
    match raw:
        case str():
            regex_match = re.match(r"^\s*([A-Za-z][A-Za-z0-9_]*)\s*\(", raw)
            function = regex_match.group(1) if regex_match else None
            parsed_operator: Operator | None = (
                "custom"
                if function == "Custom"
                else next(
                    (
                        operator
                        for operator, metadata in OP_METADATA.items()
                        if metadata.fn_name == function
                    ),
                    None,
                )
            )
            if parsed_operator is None:
                return None, None, None
            operator = parsed_operator
            formatted = _formatted_call(raw, _operator_fn_name(parsed_operator))
            if formatted is None and parsed_operator == "limit":
                formatted = _legacy_limit_call(raw)
            if formatted is not None:
                index = _identifier(formatted[1][0]) if formatted[1] else None
                match parsed_operator, len(formatted[1]):
                    case "limit", _:
                        return operator, "approaches", index
                    case _, 2:
                        return operator, "domain", index
                    case _, 3:
                        return (
                            operator,
                            "approaches"
                            if _formatted_direction(formatted[1]) is not None
                            else "bounds",
                            index,
                        )
                    case _:
                        return operator, None, index
            if value := _safe_decode(raw):
                return operator, _binder_indexing(value), _binder_index(value)
            return operator, None, None

        case {
            "_version": 1,
            "_type": "big_operator",
            "operator": operator,
            "indexing": indexing,
            "index": index_var,
        } if (
            (index := _symbol_name(_safe_decode(index_var)))
            and (operator == "custom" or operator in OP_METADATA)
            and indexing in COMPONENTS_MAP
        ):
            return operator, indexing, index

        case {"_type": "sympy", "_value": str(source)}:
            return _infer_spec(source)

        case _:
            return None, None, None


def _infer_direction(raw: Any, operator: Operator) -> DirectionName | None:
    def _decode_limit_direction(raw: dict | str) -> DirectionName | None:
        if (value := _safe_decode(raw)) is not None:  # ruff: ignore[collapsible-if]
            if isinstance(value, sympy.Limit):
                return DIRECTION_NAMES.get(str(value.args[3]))  # type: ignore
        return None

    match raw:
        case {"_type": "big_operator", "direction": dir} if dir in DIRECTION_SYMBOLS:
            return dir

        case {"_type": "sympy", "_value": str(source)}:
            return _infer_direction(source, operator)

        case str():
            formatted = _formatted_call(raw, _operator_fn_name(operator))
            if formatted is None and operator == "limit":
                formatted = _legacy_limit_call(raw)
            match formatted:
                case None:
                    return _decode_limit_direction(raw)

                case _, indexing_args if direction := _formatted_direction(
                    indexing_args
                ):
                    return DIRECTION_NAMES.get(direction)

                case _:
                    return None

        case _:
            return None


def _get_tuple_attrib[T](
    element: lxml.html.HtmlElement, attr: str, default: T = ()
) -> tuple[str, ...] | T:
    val = pl.get_string_attrib(element, attr, None)
    if val is None:
        return default
    return tuple(filter(bool, map(str.strip, val.split(","))))


def _config(html: str, data: pl.QuestionData | None = None) -> RenderConfig:
    element = lxml.html.fragment_fromstring(html)
    answer = pl.get_string_attrib(element, "answers-name", None)
    if answer is None or not answer.strip():
        raise ValueError('Required attribute "answers-name" missing')
    answer = answer.strip()
    custom_latex = pl.get_string_attrib(element, "operator-latex", None)
    correct_attribute = pl.get_string_attrib(element, "correct-answer", None)
    raw_correct = _raw_correct_answer(answer, correct_attribute, data)
    if raw_correct is None:
        raise ValueError(
            f'Correct answer "{answer}" is required to configure the big operator.'
        )
    operator, indexing, index = _infer_spec(raw_correct)
    if operator is None or indexing is None or index is None:
        raise ValueError(
            f'Correct answer "{answer}" must be a supported complete answer from '
            "which the operator, index variable, and indexing can be inferred."
        )
    if operator == "custom":
        if custom_latex is None or not custom_latex.strip():
            raise ValueError(
                'Attribute "operator-latex" is required when operator="custom".'
            )
        operator_latex = custom_latex.strip()
    else:
        metadata = OP_METADATA[operator]
        operator_latex = (
            custom_latex.strip() if custom_latex is not None else metadata.tex
        )
    allowed = (
        frozenset(("bounds", "domain", "approaches"))
        if operator == "custom"
        else OP_METADATA[operator].valid_indexing
    )
    if indexing not in allowed:
        raise ValueError(
            f'Operator "{operator}" does not support indexing="{indexing}"; use {", ".join(sorted(allowed))}.'
        )
    body_size = pl.get_integer_attrib(element, "body-size", BODY_SIZE_DEFAULT)
    if body_size < 1:
        raise ValueError('Attribute "body-size" must be positive.')
    default_index_field_size = (
        BOUNDS_INDEX_FIELD_SIZE_DEFAULT
        if indexing == "bounds"
        else ANNOTATION_INDEX_FIELD_SIZE_DEFAULT
    )
    index_field_size = pl.get_integer_attrib(
        element, "index-field-size", default_index_field_size
    )
    if index_field_size < 1:
        raise ValueError('Attribute "index-field-size" must be positive.')
    grading: GradingMethod | str = (
        pl.get_string_attrib(element, "grading-method", "equivalent") or "equivalent"
    )
    if grading not in GRADING_METHODS:
        raise ValueError(
            'Attribute "grading-method" must be exact, component, equivalent, or none.'
        )
    body_weight = pl.get_integer_attrib(element, "body-relative-weight", 3)
    if body_weight < 1:
        raise ValueError('Attribute "body-relative-weight" must be positive.')
    direction = (
        _infer_direction(raw_correct, operator)
        if indexing == "approaches"
        else "two-sided"
    )
    if direction is None:
        raise ValueError(
            "Correct answer approaches limit must include a valid direction."
        )
    direction_input_attribute = "allow-limit-direction-input" in element.attrib
    if direction_input_attribute and indexing != "approaches":
        raise ValueError(
            'Attribute "allow-limit-direction-input" can only be used with indexing="approaches".'
        )
    allow_direction_input = pl.get_boolean_attrib(
        element, "allow-limit-direction-input", indexing == "approaches"
    )
    variables = _get_tuple_attrib(element, "variables")
    custom_functions = _get_tuple_attrib(element, "custom-functions")
    allowed_blank: AllowedBlank | str = (
        pl.get_string_attrib(element, "allowed-blank", "none") or "none"
    )
    if allowed_blank not in ALLOWED_BLANKS:
        raise ValueError(
            'Attribute "allowed-blank" must be none, indices, body, or all.'
        )
    if operator == "custom" and grading == "equivalent":
        raise ValueError(
            'Custom operators with a correct answer do not support grading-method="equivalent".'
        )
    imaginary_unit = pl.get_string_attrib(
        element,
        "imaginary-unit-for-display",
        IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT,
    )
    if imaginary_unit not in {"i", "j"}:
        raise ValueError('Attribute "imaginary-unit-for-display" must be i or j.')
    return RenderConfig(
        answer_name=answer,
        operator=operator,
        operator_latex=operator_latex,
        has_operator_latex_override=custom_latex is not None,
        prefix_latex=pl.get_string_attrib(element, "prefix-latex", None),
        suffix_latex=pl.get_string_attrib(element, "suffix-latex", None),
        indexing=indexing,
        index=index,
        variables=variables,
        custom_functions=custom_functions,
        direction=direction,
        allow_direction_input=allow_direction_input,
        allowed_blank=allowed_blank,
        display=pl.get_enum_attrib(
            element, "display", psi.DisplayType, DISPLAY_DEFAULT
        ),
        allow_complex=pl.get_boolean_attrib(element, "allow-complex", False),
        imaginary_unit=imaginary_unit,
        display_log_as_ln=pl.get_boolean_attrib(
            element, "display-log-as-ln", DISPLAY_LOG_AS_LN_DEFAULT
        ),
        show_help_text=pl.get_boolean_attrib(element, "show-help-text", True),
        body_size=body_size,
        index_field_size=index_field_size,
        grading=grading,
        body_weight=body_weight,
        weight=pl.get_integer_attrib(element, "weight", 1),
        correct_attribute=correct_attribute,
    )


def _decode(value: Any) -> sympy.Expr:
    match value:
        case {"_type": "sympy"}:
            serialized_variables = value.get("_variables")
            allow_complex = not (
                isinstance(serialized_variables, list)
                and any(name in {"i", "j"} for name in serialized_variables)
            )
            return psu.json_to_sympy(
                cast(psu.SympyJson, value),
                allow_sets=True,
                allow_complex=allow_complex,
            )

        case sympy.Expr():
            return value

        case _:
            raise TypeError(
                "Mathematical values must be SymPy expressions or dictionaries."
            )


def _safe_decode(value: Any) -> sympy.Expr | None:
    try:
        return _decode(value)
    except (TypeError, ValueError):
        return None


def _json(value: sympy.Basic) -> psu.SympyJson:
    return psu.sympy_to_json(cast(Any, value), allow_sets=True)


def _canonical(
    config: RenderConfig,
    values: ResponseValues,
    direction: DirectionName | None = None,
) -> pbo.BigOperatorJson:
    result = {
        "_type": "big_operator",
        "_version": 1,
        "operator": config.operator,
        "indexing": config.indexing,
        "index": _json(sympy.Symbol(config.index)),
    }
    result.update({key: _json(values[key]) for key in config.components})
    if config.indexing == "approaches":
        result["direction"] = direction or config.direction
    return result  # type: ignore


def _structured(config: RenderConfig, value: dict[str, Any]) -> pbo.BigOperatorJson:
    decoded = pbo.json_to_big_operator(value)
    values = _decoded_values(config, decoded)
    return _canonical(config, values)


def _decoded_values(config: RenderConfig, decoded: pbo.BigOperator) -> ResponseValues:
    match config.indexing:
        case "bounds":
            if decoded["indexing"] != "bounds":
                raise ValueError("Big operator indexing does not match the element.")
            return {
                "lower": decoded["lower"],
                "upper": decoded["upper"],
                "body": decoded["body"],
            }
        case "domain":
            if decoded["indexing"] != "domain":
                raise ValueError("Big operator indexing does not match the element.")
            return {"domain": decoded["domain"], "body": decoded["body"]}
        case "approaches":
            if decoded["indexing"] != "approaches":
                raise ValueError("Big operator indexing does not match the element.")
            return {"target": decoded["target"], "body": decoded["body"]}


def _validate_component_values(config: RenderConfig, values: ResponseValues) -> None:
    allowed = set(config.variables) | {config.index}
    for component, item in values.items():
        typed_component = cast(Component, component)
        type_failure = psu.check_sympy_types(
            item, _component_allowed_types(config, typed_component)
        )
        if type_failure is not None:
            raise ValueError(
                f'Correct answer component "{component}" must be an expression.'
            )
        if _requires_set(config, typed_component) and not _is_set_input(item):
            raise ValueError(f'Correct answer component "{component}" must be a set.')
        undeclared = {str(symbol) for symbol in item.free_symbols} - allowed
        if undeclared:
            raise ValueError(
                "Correct answer contains undeclared symbol(s): "
                + ", ".join(sorted(undeclared))
            )
        if not config.allow_complex and item.has(sympy.I):
            raise ValueError(
                "Correct answer contains a complex value, but complex values are disabled."
            )


def _binder(config: RenderConfig, value: Any) -> pbo.BigOperatorJson | None:
    match config.operator:
        case "limit":
            if not isinstance(value, sympy.Limit):
                return None
            if len(value.args) != 4:
                raise ValueError("Correct answer Limit has an invalid structure.")
            body, _, target, _ = value.args
            return _canonical(config, {"target": target, "body": body})

        case "sum":
            if not isinstance(value, sympy.Sum):
                return None
        case "product":
            if not isinstance(value, sympy.Product):
                return None
        case "integral":
            if not isinstance(value, sympy.Integral):
                return None
        case _:
            return None

    if len(value.args) != 2 or not isinstance(value.args[1], sympy.Tuple):
        raise ValueError("Correct answer must have exactly one indexing tuple.")
    indexing_values = value.args[1].args
    expected_length = 3 if config.indexing == "bounds" else 2
    if len(indexing_values) != expected_length:
        raise ValueError(
            f'Correct answer for indexing="{config.indexing}" must have exactly one '
            f"{expected_length}-item indexing tuple."
        )
    body = value.args[0]
    match config.indexing:
        case "bounds":
            return _canonical(
                config,
                {
                    "lower": indexing_values[1],
                    "upper": indexing_values[2],
                    "body": body,
                },
            )
        case "domain":
            return _canonical(config, {"domain": indexing_values[1], "body": body})
        case "approaches":
            raise ValueError(
                f"Correct answer operator does not support indexing={config.indexing!r}."
            )


def _formatted_answer(config: RenderConfig, source: str) -> pbo.BigOperatorJson | None:
    formatted = _formatted_call(source, _operator_fn_name(config.operator))
    if formatted is None and config.operator == "limit":
        formatted = _legacy_limit_call(source)
    if formatted is None:
        return None
    body_source, indexing_args = formatted
    match config.indexing:
        case "domain":
            expected_length = 2
        case "bounds" | "approaches":
            expected_length = 3
    if len(indexing_args) != expected_length:
        raise ValueError(
            f'Correct answer for indexing="{config.indexing}" requires a '
            f"{expected_length}-item indexing tuple."
        )
    try:
        body = _unchecked_parse(
            body_source,
            tuple(dict.fromkeys((*config.variables, config.index))),
            config.custom_functions,
            allow_complex=config.allow_complex,
        )
    except _ParseError as exc:
        raise ValueError(
            "The correct answer contains invalid SymPy data."
        ) from exc._src
    values: ResponseValues
    try:
        match config.indexing:
            case "approaches":
                direction = _formatted_direction(indexing_args)
                if direction not in DIRECTION_NAMES:
                    raise ValueError('Limit direction must be "+", "-", or "+-".')
                values = {
                    "target": _unchecked_parse(
                        indexing_args[1],
                        config.variables,
                        config.custom_functions,
                        allow_complex=config.allow_complex,
                    ),
                    "body": body,
                }
            case "bounds":
                values = {
                    "lower": _unchecked_parse(
                        indexing_args[1],
                        config.variables,
                        config.custom_functions,
                        allow_complex=config.allow_complex,
                    ),
                    "upper": _unchecked_parse(
                        indexing_args[2],
                        config.variables,
                        config.custom_functions,
                        allow_complex=config.allow_complex,
                    ),
                    "body": body,
                }
            case "domain":
                values = {
                    "domain": _unchecked_parse(
                        indexing_args[1],
                        config.variables,
                        config.custom_functions,
                        allow_complex=config.allow_complex,
                    ),
                    "body": body,
                }
    except _ParseError as exc:
        raise ValueError(
            "The correct answer contains invalid SymPy data."
        ) from exc._src
    return _canonical(config, values)


def _validate_correct(
    config: RenderConfig, correct: dict[str, Any] | pbo.BigOperatorJson
) -> pbo.BigOperatorJson:
    decoded = pbo.json_to_big_operator(correct)
    _validate_component_values(config, _decoded_values(config, decoded))
    return correct  # type: ignore


def _correct(config: RenderConfig, data: pl.QuestionData) -> pbo.BigOperatorJson:
    raw = _raw_correct_answer(config.answer_name, config.correct_attribute, data)
    if config.operator == "custom" and config.grading == "equivalent":
        raise ValueError(
            'Custom operators with a correct answer do not support grading-method="equivalent".'
        )
    if raw is None:
        raise ValueError(
            f'Correct answer "{config.answer_name}" is required to configure the big operator.'
        )
    if isinstance(raw, dict) and raw.get("_type") == "big_operator":
        return _validate_correct(config, _structured(config, raw))
    if isinstance(raw, str):
        converted = _formatted_answer(config, raw)
        if converted is not None:
            return _validate_correct(config, converted)
        if config.operator == "limit" and re.match(r"^\s*Limit\s*\(", raw):
            raise ValueError("The correct answer has an invalid Limit wrapper.")
        raise TypeError(
            f'Correct answer "{config.answer_name}" must be a matching formatted object or canonical structured dictionary.'
        )
    if (
        isinstance(raw, dict)
        and raw.get("_type") == "sympy"
        and isinstance(raw.get("_value"), str)
    ):
        converted = _formatted_answer(config, raw["_value"])
        if converted is not None:
            return _validate_correct(config, converted)
    value = _decode(raw)
    converted = _binder(config, value)
    if converted is not None:
        return _validate_correct(config, converted)
    raise TypeError(
        f'Correct answer "{config.answer_name}" must be a matching formatted object or canonical structured dictionary.'
    )


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    pl.validate_element(element, SCHEMA_PATH)
    config = _config(element_html, data)
    correct = _correct(config, data)
    data.setdefault("correct_answers", {})[config.answer_name] = correct


def _render_symbolic_input(
    data: pl.QuestionData,
    *,
    name: str,
    variables: tuple[str, ...],
    custom_functions: tuple[str, ...],
    aria_label: str,
    size: int,
    allowed_types: set[psu.AllowedSympyType],
    allow_complex: bool,
    imaginary_unit: str,
    display_log_as_ln: bool,
    show_help_text: bool = False,
    show_score: bool = False,
    prefix: str | None = None,
    suffix: str | None = None,
    score: float | None = None,
) -> tuple[str, pl.QuestionData]:
    config = psi.RenderConfig(
        # passed-through
        name=name,
        label=prefix,
        aria_label=aria_label,
        suffix=suffix,
        variables=list(variables),
        initial_value_variables=list(variables),
        custom_functions=list(custom_functions),
        allow_complex=allow_complex,
        allowed_types=allowed_types,
        size=size,
        show_score=show_score,
        show_info=show_help_text,
        display_log_as_ln=display_log_as_ln,
        imaginary_unit=imaginary_unit,
        # fixed
        display=psi.DisplayType.INLINE,
        placeholder="",
        allow_trig=True,
        simplify_expression=True,
        formula_editor=True,
        show_score_percent=False,
        initial_value=None,
    )

    # create a defensive-copied view over data with tweaked values
    view = copy.deepcopy(data)
    if score is not None:
        view["partial_scores"][name] = {"score": score}

    template = SYMBOLIC_INPUT_TEMPLATE_PATH.read_text(encoding="utf-8")

    html = psi.render_with_config(config, view, template=template)

    return html, view


def _symbolic_field(
    config: RenderConfig,
    *,
    data: pl.QuestionData,
    component: Component,
    label: str,
    size: int,
    prefix: str | None = None,
    suffix: str | None = None,
    score: float | None = None,
) -> dict[Literal["html"], str]:
    name = config.component_name(component)
    variables = (
        tuple(dict.fromkeys((*config.variables, config.index)))
        if component == "body"
        else config.variables
    )
    html, _view = _render_symbolic_input(
        data,
        name=name,
        variables=variables,
        custom_functions=config.custom_functions,
        aria_label=label,
        size=size,
        allowed_types=_component_allowed_types(config, component),
        allow_complex=config.allow_complex,
        imaginary_unit=config.imaginary_unit,
        display_log_as_ln=config.display_log_as_ln,
        show_help_text=component == "body" and config.show_help_text,
        show_score=config.grading == "component",
        prefix=prefix,
        suffix=suffix,
        score=score,
    )
    return {"html": html}


def _component_scores(config: RenderConfig, data: pl.QuestionData) -> dict[str, float]:
    if config.grading != "component" or config.answer_name not in data.get(
        "partial_scores", {}
    ):
        return {}
    submitted_json = data.get("submitted_answers", {}).get(config.answer_name)
    correct_json = _correct(config, data)
    if not isinstance(submitted_json, dict):
        return {}
    try:
        submitted = _values(config, submitted_json)
        correct = _values(config, correct_json)
    except (KeyError, TypeError, ValueError):
        return {}
    scores = {
        component: float(
            _expressions_equivalent(submitted[component], correct[component])
        )
        for component in config.components
    }
    if config.indexing == "approaches" and config.allow_direction_input:
        scores["direction"] = float(
            submitted_json.get("direction") == correct_json.get("direction")
        )
    return scores


def _direction_input(
    config: RenderConfig, data: pl.QuestionData, score: float | None
) -> dict[str, Any]:
    name = config.component_name("direction")
    raw_value = str(data.get("raw_submitted_answers", {}).get(name, ""))
    has_error = name in data.get("format_errors", {})
    return {
        "name": name,
        "invalid": has_error,
        "feedback": data.get("format_errors", {}).get(name),
        "options": [
            {"value": value, "label": label, "selected": raw_value == value}
            for value, label in (
                ("two-sided", "±"),
                ("from-right", "+"),
                ("from-left", "-"),
            )
        ],
        "score_badge": _score_badge(score) if score is not None else None,
    }


def _render_mustache(
    context: dict[str, Any], *, mode: Literal["question", "submission"]
) -> str:
    return chevron.render(
        (HERE / "pl-big-operator-input.mustache").read_text(),
        {**context, mode: True},
        partials_path=str(HERE / "partials"),
        partials_ext="mustache",
    )


def _question_mustache(config: RenderConfig, data: pl.QuestionData) -> str:
    index = sympy.latex(sympy.Symbol(config.index))
    component_scores = _component_scores(config, data)
    context: dict[str, Any] = {
        config.indexing: True,
        config.display.value: True,
        "integral": config.operator == "integral",
        "operator_latex": _operator_tex(config),
        "prefix_latex": config.prefix_latex,
        "suffix_latex": config.suffix_latex,
        "index_label": index,
        "body_size": config.body_size,
        "index_field_size": config.index_field_size,
        "body_field": _symbolic_field(
            config,
            component="body",
            label="Operator body",
            size=config.body_size,
            data=data,
            score=component_scores.get("body"),
        ),
    }
    partial_score = data.get("partial_scores", {}).get(config.answer_name)
    if partial_score is not None:
        context["score_badge"] = _score_badge(float(partial_score.get("score") or 0))
    match config.indexing:
        case "bounds":
            context["lower_field"] = _symbolic_field(
                config,
                component="lower",
                label="Lower bound",
                size=config.index_field_size,
                data=data,
                prefix=None if config.operator == "integral" else rf"\({index} = \)",
                score=component_scores.get("lower"),
            )
            context["upper_field"] = _symbolic_field(
                config,
                component="upper",
                label="Upper bound",
                size=config.index_field_size,
                data=data,
                score=component_scores.get("upper"),
            )
        case "domain":
            context["annotation_field"] = _symbolic_field(
                config,
                component="domain",
                label="Integration domain"
                if config.operator == "integral"
                else "Index domain",
                size=config.index_field_size,
                data=data,
                prefix=None if config.operator == "integral" else rf"\({index} \in \)",
                score=component_scores.get("domain"),
            )
        case "approaches":
            direction_score = component_scores.get("direction")
            if config.allow_direction_input:
                context["direction_input"] = _direction_input(
                    config, data, direction_score
                )
            direction_suffix = (
                None
                if config.allow_direction_input
                else {"two-sided": None, "from-left": "-", "from-right": "+"}[
                    config.direction
                ]
            )
            context["annotation_field"] = _symbolic_field(
                config,
                component="target",
                label="approaches target",
                size=config.index_field_size,
                data=data,
                prefix=rf"\({index} \to \)",
                suffix=rf"\({{}}^{direction_suffix}\)" if direction_suffix else None,
                score=component_scores.get("target"),
            )
    return _render_mustache(context, mode="question")


def _operator_tex(config: RenderConfig) -> str:
    if config.has_operator_latex_override:
        if config.operator == "integral":
            return rf"\mathop{{{config.operator_latex}}}\nolimits"
        return rf"\mathop{{{config.operator_latex}}}\limits"
    return config.operator_latex


def _tex(config: RenderConfig, raw: dict[str, Any] | None) -> str:
    raw = raw or {}

    def get_comp(c: Component) -> Any:
        return raw.get(config.component_name(c), "?")

    index = sympy.latex(sympy.Symbol(config.index))
    op = _operator_tex(config)
    match config.indexing, config.operator:
        case "bounds", "integral":
            return rf"{op}_{{{get_comp('lower')}}}^{{{get_comp('upper')}}} {get_comp('body')}\,\mathrm{{d}}{index}"
        case "bounds", _:
            return rf"{op}_{{{index}={get_comp('lower')}}}^{{{get_comp('upper')}}} {get_comp('body')}"
        case "domain", "integral":
            return rf"{op}_{{{get_comp('domain')}}} {get_comp('body')}\,\mathrm{{d}}{index}"
        case "domain", _:
            return rf"{op}_{{{index}\in {get_comp('domain')}}} {get_comp('body')}"
        case "approaches", _:
            direction_value = (
                str(raw.get(config.component_name("direction"), ""))
                if config.allow_direction_input
                else config.direction
            )
            direction = {
                "two-sided": "",
                "from-left": "^-",
                "from-right": "^+",
            }.get(direction_value, "^?")
            return rf"{op}_{{{index}\to {get_comp('target')}{direction}}} {get_comp('body')}"


def _structured_tex(
    config: RenderConfig, structured: pbo.BigOperatorJson | dict[str, Any]
) -> str:
    values = _values(config, structured)
    raw = {
        config.component_name(key): _expression_tex(config, value)
        for key, value in values.items()
    }
    if config.indexing == "approaches" and config.allow_direction_input:
        raw[config.component_name("direction")] = structured.get("direction", "")
    return _tex(config, raw)


def _expression_tex(config: RenderConfig, value: sympy.Basic) -> str:
    display_value = psi.replace_imaginary_for_display(
        cast(sympy.Expr, value), config.imaginary_unit
    )
    if config.display_log_as_ln:
        display_value = display_value.replace(sympy.log, sympy.Function("ln"))
    return sympy.latex(display_value)


def _parse_component_submission(
    config: RenderConfig, component: Component, source: str | None
) -> psu.SymbolicSubmissionParseResult:
    variables = (
        tuple(dict.fromkeys((*config.variables, config.index)))
        if component == "body"
        else config.variables
    )
    return psu.try_parse_symbolic_submission(
        source,
        variables,
        formula_editor=True,
        custom_functions=config.custom_functions,
        allowed_types=_component_allowed_types(config, component),
        allow_complex=config.allow_complex,
        imaginary_unit=config.imaginary_unit,
    )


def _submitted_tex(config: RenderConfig, data: pl.QuestionData) -> str:
    structured = data.get("submitted_answers", {}).get(config.answer_name)
    if isinstance(structured, dict):
        try:
            return _structured_tex(config, structured)
        except (KeyError, TypeError, ValueError):
            pass
    raw = data.get("raw_submitted_answers", {})
    display_raw: dict[str, Any] = dict(raw)
    for component in config.components:
        name = config.component_name(component)
        parsed = _parse_component_submission(
            config, component, cast(str | None, raw.get(name))
        )
        if isinstance(parsed, psu.SympyParseFailure) or parsed.expr == "":
            continue
        display_raw[name] = _expression_tex(config, parsed.expr)
    return _tex(config, display_raw)


def _score_badge(score: float) -> dict[str, Any]:
    if score >= 1:
        return {"correct": True}
    if score <= 0:
        return {"incorrect": True}
    return {"partial": round(score * 100)}


def render(element_html: str, data: pl.QuestionData) -> str:
    config = _config(element_html, data)
    panel = data.get("panel", "question")
    match panel:
        case "question":
            return _question_mustache(config, data)
        case "answer":
            correct = _correct(config, data)
            return _render_mustache(
                {
                    config.display.value: True,
                    "tex": _structured_tex(config, correct),
                    "prefix_latex": config.prefix_latex,
                    "suffix_latex": config.suffix_latex,
                },
                mode="submission",
            )
        case "submission":
            context: dict[str, Any] = {
                config.display.value: True,
                "tex": _submitted_tex(config, data),
                "prefix_latex": config.prefix_latex,
                "suffix_latex": config.suffix_latex,
            }
            partial_score = data.get("partial_scores", {}).get(config.answer_name)
            if partial_score is not None:
                context.update(_score_badge(float(partial_score.get("score") or 0)))
            return _render_mustache(context, mode="submission")


def _unchecked_parse(
    source: str,
    variables: tuple[str, ...],
    custom_functions: tuple[str, ...] = (),
    *,
    allow_complex: bool = False,
) -> sympy.Basic:
    source = re.sub(r"\binfinity\b", "infty", source)
    for name in ("sin", "cos", "tan", "sec", "csc", "cot"):
        source = re.sub(rf"\b{' *'.join(name)}\b", name, source)
    try:
        return psu.convert_string_to_sympy(
            source,
            variables,
            allow_hidden=True,
            allow_complex=allow_complex,
            allow_sets=True,
            allow_trig_functions=True,
            custom_functions=custom_functions,
        )
    except psu.BaseSympyError as exc:
        raise _ParseError(exc) from None


def _requires_set(config: RenderConfig, component: Component) -> bool:
    return component == "domain" or (
        component == "body"
        and config.operator in {"union", "intersection", "disjoint-union"}
    )


def _component_allowed_types(
    config: RenderConfig, component: Component
) -> set[psu.AllowedSympyType]:
    return {"all" if _requires_set(config, component) else "expression"}


def _is_set_input(value: sympy.Basic) -> bool:
    # A bare symbol may denote a set whose members are not known at parse time.
    return isinstance(value, (sympy.Set, sympy.Symbol))


def _component_allows_blank(config: RenderConfig, component: ResponseComponent) -> bool:
    return config.allowed_blank == "all" or (
        config.allowed_blank == "body"
        if component == "body"
        else config.allowed_blank == "indices"
    )


def _parse_values(config: RenderConfig, data: pl.QuestionData) -> ResponseValues | None:
    result = {}
    raw_answers = data.get("raw_submitted_answers", {})
    for component in config.components:
        name = config.component_name(component)
        if not str(raw_answers.get(name, "")).strip() and _component_allows_blank(
            config, component
        ):
            continue
        requires_set = _requires_set(config, component)
        parsed = _parse_component_submission(
            config, component, cast(str | None, raw_answers.get(name))
        )
        if isinstance(parsed, psu.SympyParseFailure):
            data.setdefault("format_errors", {})[name] = parsed.error
            continue
        if parsed.expr == "":
            raise AssertionError("Component parsing does not allow blank values.")
        if requires_set and not _is_set_input(parsed.expr):
            data.setdefault("format_errors", {})[name] = "This field must be a set."
            continue
        result[component] = parsed.expr
        data.get("format_errors", {}).pop(name, None)
    return result if len(result) == len(config.components) else None


def parse(element_html: str, data: pl.QuestionData) -> None:
    config = _config(element_html, data)
    submitted = data.setdefault("submitted_answers", {})
    if submitted:
        # undo the pollution of submitted_answers by the inner symbolic-inputs
        for component in config.response_components:
            submitted.pop(config.component_name(component), None)

    raw = data.get("raw_submitted_answers", {})
    blank_components: list[ResponseComponent] = [
        component
        for component in config.response_components
        if not str(raw.get(config.component_name(component), "")).strip()
    ]
    if blank_components and all(
        _component_allows_blank(config, component) for component in blank_components
    ):
        _parse_values(config, data)
        if "direction" in blank_components:
            data.get("format_errors", {}).pop(config.component_name("direction"), None)
        errors = data.get("format_errors", {})
        has_component_error = any(
            config.component_name(component) in errors
            for component in config.response_components
        )
        submitted[config.answer_name] = None if has_component_error else ""
        return
    values = _parse_values(config, data)
    direction: DirectionName = config.direction
    if config.indexing == "approaches" and config.allow_direction_input:
        direction_name = config.component_name("direction")
        raw_direction = str(raw.get(direction_name, "")).strip()
        if raw_direction not in DIRECTION_SYMBOLS:
            data.setdefault("format_errors", {})[direction_name] = (
                "Select a valid limit direction."
            )
            submitted[config.answer_name] = None
            return
        direction = raw_direction  # type: ignore
        data.get("format_errors", {}).pop(direction_name, None)
    submitted[config.answer_name] = (
        _canonical(config, values, direction=direction) if values else None
    )


def _values(
    config: RenderConfig, structured: pbo.BigOperatorJson | object
) -> ResponseValues:
    return _decoded_values(config, pbo.json_to_big_operator(structured))


def _construct(
    config: RenderConfig,
    values: ResponseValues,
    direction: DirectionName | None = None,
) -> sympy.Basic:
    index = sympy.Symbol(config.index)
    body = values["body"]
    match config.indexing, config.operator:
        case "bounds", "custom":
            return sympy.Tuple(body, (index, values["lower"], values["upper"]))
        case "bounds", operator:
            bound_constructor = OP_METADATA[operator].bounds_constructor
            return bound_constructor(body, (index, values["lower"], values["upper"]))
        case "approaches", _:
            return sympy.Limit(
                body,
                index,
                values["target"],
                dir=DIRECTION_SYMBOLS[direction or config.direction],
            )
        case "domain", "integral":
            raise NotImplementedError(
                "Equivalent grading for domain integrals is unsupported; use exact or component grading."
            )
        case "domain", operator:
            domain = values["domain"]
            if not isinstance(domain, sympy.FiniteSet):
                raise NotImplementedError(
                    "Equivalent grading of domain forms requires a concrete FiniteSet domain."
                )
            terms: list[sympy.Expr] = [
                body.subs(index, item)
                for item in domain  # type: ignore
            ]
            if operator == "custom":
                return sympy.Tuple(*terms)
            return OP_METADATA[operator].domain_constructor(*terms)


def _equivalent(
    config: RenderConfig,
    left_values: ResponseValues,
    right_values: ResponseValues,
    left_direction: DirectionName | None = None,
    right_direction: DirectionName | None = None,
) -> bool:
    try:
        left, right = (
            _construct(config, left_values, left_direction),
            _construct(config, right_values, right_direction),
        )
        return _expressions_equivalent(left, right)
    except (NotImplementedError, TypeError, ValueError, ZeroDivisionError):
        return False


def _expressions_equivalent(left: sympy.Basic, right: sympy.Basic) -> bool:
    try:
        if left == right:
            return True

        difference = sympy.simplify(sympy.expand(left - right))  # type: ignore
        if difference == 0 or difference.equals(0) is True:
            return True

        left = left.doit()
        if left == right:
            return True
        right = right.doit()
        if left == right:
            return True

        difference = sympy.simplify(sympy.expand(left - right))  # type: ignore
        return difference == 0 or difference.equals(0) is True
    except (TypeError, ValueError, ZeroDivisionError):
        return False


def grade(element_html: str, data: pl.QuestionData) -> None:
    config = _config(element_html, data)
    if config.grading == "none":
        return
    correct_json = _correct(config, data)
    if data.get("submitted_answers", {}).get(config.answer_name) == "":
        score = 0.0
    else:
        submitted_json = data.get("submitted_answers", {}).get(config.answer_name)
        if not isinstance(submitted_json, dict):
            data.setdefault("partial_scores", {})[config.answer_name] = {
                "score": 0.0,
                "weight": config.weight,
            }
            pl.set_weighted_score_data(data)
            return
        try:
            submitted, correct = (
                _values(config, submitted_json),
                _values(config, correct_json),
            )
        except (KeyError, TypeError, ValueError):
            data.setdefault("partial_scores", {})[config.answer_name] = {
                "score": 0.0,
                "weight": config.weight,
            }
            pl.set_weighted_score_data(data)
            return
        match config.grading:
            case "exact":
                score = float(submitted_json == correct_json)
            case "component":
                earned = sum(
                    config.body_weight if c == "body" else 1
                    for c in config.components
                    if _expressions_equivalent(submitted[c], correct[c])
                )
                possible = len(config.components) + (
                    (config.body_weight - 1) if "body" in config.components else 0
                )
                if config.allow_direction_input:
                    earned += int(
                        submitted_json.get("direction") == correct_json.get("direction")
                    )
                    possible += 1
                score = earned / possible
            case "equivalent":
                score = float(
                    _equivalent(
                        config,
                        submitted,
                        correct,
                        submitted_json.get("direction"),
                        correct_json.get("direction"),
                    )
                )
    data.setdefault("partial_scores", {})[config.answer_name] = {
        "score": score,
        "weight": config.weight,
    }
    pl.set_weighted_score_data(data)


def test(element_html: str, data: pl.ElementTestData) -> None:
    config = _config(element_html, data)
    correct_json = _correct(config, data)

    correct = _values(config, correct_json)
    match data["test_type"]:
        case "correct":
            for component, value in correct.items():
                data["raw_submitted_answers"][config.component_name(component)] = str(
                    psi.replace_imaginary_for_display(
                        cast(sympy.Expr, value), config.imaginary_unit
                    )
                )
            if config.indexing == "approaches" and config.allow_direction_input:
                data["raw_submitted_answers"][config.component_name("direction")] = (
                    correct_json.get("direction", None)
                )
            if config.grading != "none":
                data["partial_scores"][config.answer_name] = {
                    "score": 1,
                    "weight": config.weight,
                }
        case "incorrect":
            for component, value in correct.items():
                raw_value = (
                    r"{999999}"
                    if _requires_set(config, cast(Component, component))
                    else f"({value}) + 1"
                )
                data["raw_submitted_answers"][config.component_name(component)] = (
                    raw_value
                )
            if config.indexing == "approaches" and config.allow_direction_input:
                data["raw_submitted_answers"][config.component_name("direction")] = (
                    correct_json.get("direction", None)
                )
            if config.grading != "none":
                data["partial_scores"][config.answer_name] = {
                    "score": 0,
                    "weight": config.weight,
                }
        case "invalid":
            name = config.component_name(next(iter(config.components)))
            data["raw_submitted_answers"][name] = "INVALID"
            data["format_errors"][name] = "Invalid test input"
