from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, cast

import chevron
import lxml.html
import prairielearn as pl
import prairielearn.sympy_utils as psu
import symbolic_input_adapter
import sympy
import sympy.sets

HERE = Path(__file__).parent

BODY_SIZE_DEFAULT = 16
BOUNDS_LIMIT_SIZE_DEFAULT = 7
ANNOTATION_LIMIT_SIZE_DEFAULT = 10

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
type Operator = Literal["custom"] | BuiltinOperator
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
type LimitFormat = Literal["bounds", "domain", "approach"]


@dataclass(frozen=True, slots=True)
class OperatorMetadata:
    fn_name: BuiltinOperatorFn
    tex: str
    default_limit: LimitFormat
    valid_limits: frozenset[LimitFormat]
    bounds_constructor: type[sympy.Basic]
    _domain_constructor: type[sympy.Basic] | None = None

    @property
    def domain_constructor(self) -> type[sympy.Basic]:
        return self._domain_constructor or self.bounds_constructor


_BOUNDS_DOMAIN = frozenset(("bounds", "domain"))
OP_METADATA: dict[BuiltinOperator, OperatorMetadata] = {
    "sum": OperatorMetadata(
        "Sum", r"\sum", "bounds", _BOUNDS_DOMAIN, sympy.Sum, sympy.Add
    ),
    "product": OperatorMetadata(
        "Product", r"\prod", "bounds", _BOUNDS_DOMAIN, sympy.Product, sympy.Mul
    ),
    "integral": OperatorMetadata(
        "Integral", r"\int", "bounds", _BOUNDS_DOMAIN, sympy.Integral
    ),
    "limit": OperatorMetadata(
        "Limit", r"\lim", "approach", frozenset(("approach",)), sympy.Limit
    ),
    "union": OperatorMetadata(
        "Union", r"\bigcup", "domain", _BOUNDS_DOMAIN, sympy.Union
    ),
    "intersection": OperatorMetadata(
        "Intersection", r"\bigcap", "domain", _BOUNDS_DOMAIN, sympy.Intersection
    ),
    "disjoint-union": OperatorMetadata(
        "DisjointUnion",
        r"\bigsqcup",
        "domain",
        _BOUNDS_DOMAIN,
        sympy.sets.DisjointUnion,
    ),
    "min": OperatorMetadata("Min", r"\min", "domain", _BOUNDS_DOMAIN, sympy.Min),
    "max": OperatorMetadata("Max", r"\max", "domain", _BOUNDS_DOMAIN, sympy.Max),
}


def _operator_fn_name(operator: Operator) -> OperatorFn:
    return "Custom" if operator == "custom" else OP_METADATA[operator].fn_name


type DirectionName = Literal["two-sided", "from-left", "from-right"]
type DirectionSymbol = Literal["+-", "-", "+"]
DIRECTION_SYMBOLS: dict[DirectionName, DirectionSymbol] = {
    "two-sided": "+-",
    "from-left": "-",
    "from-right": "+",
}
DIRECTION_NAMES: dict[DirectionSymbol, DirectionName] = {
    symbol: name for name, symbol in DIRECTION_SYMBOLS.items()
}
type FormattedCall = tuple[str, tuple[str, ...]]
type Component = Literal["lower", "upper", "domain", "target", "body"]
type ResponseComponent = Literal["direction"] | Component
COMPONENTS_MAP: dict[LimitFormat, Sequence[Component]] = {
    "bounds": ("lower", "upper", "body"),
    "domain": ("domain", "body"),
    "approach": ("target", "body"),
}
CORRECT_COMPONENT_ATTRIBUTES: dict[Component, str] = {
    "lower": "correct-answer-start",
    "upper": "correct-answer-end",
    "domain": "correct-answer-domain",
    "target": "correct-answer-target",
    "body": "correct-answer-body",
}
type GradingMethod = Literal["equivalent", "component", "exact"]
GRADING_METHODS: frozenset[GradingMethod] = frozenset((
    "equivalent",
    "component",
    "exact",
))
type AllowedBlank = Literal["none", "limits", "body", "all"]
ALLOWED_BLANKS: frozenset[AllowedBlank] = frozenset(("none", "limits", "body", "all"))


class _ParseError(ValueError):
    """An author-provided mathematical expression could not be parsed."""

    def __init__(self, src: psu.BaseSympyError) -> None:
        super().__init__(str(src))
        self._src = src


@dataclass(frozen=True, slots=True, kw_only=True)
class RenderConfig:
    answer: str
    operator: Operator
    operator_latex: str
    limits: LimitFormat
    index: str
    variables: tuple[str, ...]
    custom_functions: tuple[str, ...]
    direction: DirectionName
    allow_direction_input: bool
    allowed_blank: AllowedBlank
    allow_complex: bool
    show_help_text: bool
    body_size: int
    limit_size: int
    grading: GradingMethod
    body_weight: int
    weight: int
    correct_attribute: str | None
    correct_components: tuple[tuple[Component, str], ...]

    @property
    def components(self) -> Sequence[Component]:
        return COMPONENTS_MAP[self.limits]

    @property
    def response_components(self) -> Sequence[ResponseComponent]:
        if self.limits == "approach" and self.allow_direction_input:
            return (*self.components, "direction")
        return tuple(self.components)

    def name(self, component: str) -> str:
        return f"{self.answer}-{ {'lower': 'start', 'upper': 'end'}.get(component, component) }"


def _raw_correct_answer(
    answer: str,
    correct_attribute: str | None,
    correct_components: dict[Component, str],
    data: Any | None,
) -> Any:
    if correct_components:
        return correct_components
    if correct_attribute is not None:
        return correct_attribute
    if data is None:
        return None
    correct_answers = data.get("correct_answers", {})
    if not isinstance(correct_answers, dict):
        raise TypeError("data['correct_answers'] must be a mapping.")
    return correct_answers.get(answer)


def _binder_limits(value: Any) -> LimitFormat | None:
    match value:
        case sympy.Limit():
            return "approach"
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
    limits_source = arguments[1].strip()
    if not (limits_source.startswith("(") and limits_source.endswith(")")):
        return None
    limits = _split_top_level(limits_source[1:-1])
    return arguments[0], tuple(limits)


def _formatted_direction(limits: Sequence[str]) -> DirectionSymbol | None:
    if len(limits) != 3:
        return None
    source = limits[2].strip()
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
) -> tuple[Operator | None, LimitFormat | None, str | None]:
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
                        return operator, "approach", index
                    case _, 2:
                        return operator, "domain", index
                    case _, 3:
                        return (
                            operator,
                            "approach"
                            if _formatted_direction(formatted[1]) is not None
                            else "bounds",
                            index,
                        )
                    case _:
                        return operator, None, index
            try:
                value = _decode(raw)
            except Exception:
                return operator, None, None
            return operator, _binder_limits(value), _binder_index(value)

        case {"_type": "operator_expression"}:
            operator = raw.get("operator")
            limits = raw.get("limits")
            try:
                index = _symbol_name(_decode(raw.get("index")))
            except Exception:
                index = None
            if (
                raw.get("_version") == 1
                and (operator == "custom" or operator in OP_METADATA)
                and limits in COMPONENTS_MAP
                and index is not None
            ):
                return operator, limits, index
            return None, None, None

        case {"_type": "sympy"}:
            try:
                value = _decode(raw)
            except Exception:
                return None, None, None

            for operator in ("sum", "product", "integral", "limit"):
                if isinstance(value, OP_METADATA[operator].bounds_constructor):
                    return operator, _binder_limits(value), _binder_index(value)
            return None, None, None

        case _:
            return None, None, None


def _infer_direction(raw: Any, operator: Operator) -> DirectionName | None:
    def _decode_limit_direction(raw: dict | str) -> DirectionName | None:
        try:
            value = _decode(raw)
        except Exception:
            return None
        if isinstance(value, sympy.Limit):
            return DIRECTION_NAMES.get(str(value.args[3]))  # type: ignore
        return None

    match raw:
        case {"_type": "operator_expression"}:
            direction = raw.get("direction")
            return direction if direction in DIRECTION_SYMBOLS else None

        case {"_type": "sympy"}:
            return _decode_limit_direction(raw)

        case str():
            formatted = _formatted_call(raw, _operator_fn_name(operator))
            if formatted is None and operator == "limit":
                formatted = _legacy_limit_call(raw)
            match formatted:
                case None:
                    return _decode_limit_direction(raw)

                case _, limits if direction := _formatted_direction(limits):
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
    explicit_index = pl.get_string_attrib(element, "index-variable", None)
    explicit_index = explicit_index.strip() if explicit_index else None
    explicit_operator = pl.get_string_attrib(element, "operator", None)
    if explicit_operator is not None:
        explicit_operator = explicit_operator[:1].lower() + explicit_operator[1:]
    custom_latex = pl.get_string_attrib(element, "operator-latex", None)
    correct_attribute = pl.get_string_attrib(element, "correct-answer", None)
    supplied_components: dict[Component, str] = {
        component: value
        for component, attribute in CORRECT_COMPONENT_ATTRIBUTES.items()
        if (value := pl.get_string_attrib(element, attribute, None)) is not None
    }
    raw_correct = _raw_correct_answer(
        answer, correct_attribute, supplied_components, data
    )
    inferred_operator, inferred_limits, inferred_index = None, None, None
    if not supplied_components and isinstance(raw_correct, (str, dict)):
        inferred_operator, inferred_limits, inferred_index = _infer_spec(raw_correct)
    index = explicit_index or inferred_index
    if index is None:
        raise ValueError(
            'The "index-variable" attribute is required; it cannot be inferred from the provided correct-answer.'
        )
    if explicit_operator is None and custom_latex is None and inferred_operator is None:
        raise ValueError(
            'The "operator" attribute is required; it cannot be inferred from the provided correct-answer.'
        )
    if (
        operator := (
            explicit_operator
            or inferred_operator
            or ("custom" if custom_latex is not None else None)
        )
    ) is None:
        raise ValueError(
            'The "operator" attribute is required; it cannot be inferred from the provided correct-answer.'
        )
    if operator != "custom" and operator not in OP_METADATA:
        raise ValueError(f'Unknown operator "{operator}".')
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
    limits: LimitFormat | str = (
        pl.get_string_attrib(element, "limits", "auto") or "auto"
    )
    if limits == "auto":
        if inferred_operator == operator and inferred_limits:
            limits = inferred_limits
        elif operator == "custom":
            raise ValueError(
                'Custom operators require a parseable whole correct answer or explicit limits="bounds", limits="domain", or limits="approach".'
            )
        else:
            limits = OP_METADATA[operator].default_limit
    allowed = (
        frozenset(("bounds", "domain", "approach"))
        if operator == "custom"
        else OP_METADATA[operator].valid_limits
    )
    if limits not in allowed:
        raise ValueError(
            f'Operator "{operator}" does not support limits="{limits}"; use {", ".join(sorted(allowed))}.'
        )
    body_size = pl.get_integer_attrib(element, "body-size", BODY_SIZE_DEFAULT)
    if body_size < 1:
        raise ValueError('Attribute "body-size" must be positive.')
    default_limit_size = (
        BOUNDS_LIMIT_SIZE_DEFAULT
        if limits == "bounds"
        else ANNOTATION_LIMIT_SIZE_DEFAULT
    )
    limit_size = pl.get_integer_attrib(element, "limit-size", default_limit_size)
    if limit_size < 1:
        raise ValueError('Attribute "limit-size" must be positive.')
    grading: GradingMethod | str = (
        pl.get_string_attrib(element, "grading-method", "equivalent") or "equivalent"
    )
    if grading not in GRADING_METHODS:
        raise ValueError(
            'Attribute "grading-method" must be exact, component, or equivalent.'
        )
    body_weight = pl.get_integer_attrib(element, "body-relative-weight", 3)
    if body_weight < 1:
        raise ValueError('Attribute "body-relative-weight" must be positive.')
    direction_attribute = pl.get_string_attrib(element, "limit-direction", None)
    direction = (
        direction_attribute
        or (
            _infer_direction(raw_correct, operator)
            if limits == "approach" and not supplied_components
            else None
        )
        or "two-sided"
    )
    if direction not in DIRECTION_SYMBOLS:
        raise ValueError(f'Unknown limit-direction "{direction}".')
    direction_input_attribute = "allow-limit-direction-input" in element.attrib
    if direction_input_attribute and limits != "approach":
        raise ValueError(
            'Attribute "allow-limit-direction-input" can only be used with limits="approach".'
        )
    allow_direction_input = bool(
        pl.get_boolean_attrib(element, "allow-limit-direction-input", True)
    )
    variables = _get_tuple_attrib(element, "variables")
    custom_functions = _get_tuple_attrib(element, "custom-functions")
    allowed_blank: AllowedBlank | str = (
        pl.get_string_attrib(element, "allowed-blank", "none") or "none"
    )
    if allowed_blank not in ALLOWED_BLANKS:
        raise ValueError(
            'Attribute "allowed-blank" must be none, limits, body, or all.'
        )
    components = COMPONENTS_MAP[limits]
    irrelevant = set(supplied_components) - set(components)
    if irrelevant:
        attributes = ", ".join(
            CORRECT_COMPONENT_ATTRIBUTES[component] for component in irrelevant
        )
        raise ValueError(
            f'Correct-answer attribute(s) {attributes} cannot be used with limits="{limits}".'
        )
    if supplied_components and set(supplied_components) != set(components):
        missing = ", ".join(
            CORRECT_COMPONENT_ATTRIBUTES[component]
            for component in components
            if component not in supplied_components
        )
        raise ValueError(
            f"Component correct answers must supply every visible field; missing {missing}."
        )
    if correct_attribute is not None and supplied_components:
        raise ValueError(
            'Use either "correct-answer" or component correct-answer attributes, not both.'
        )
    if (
        operator == "custom"
        and (correct_attribute is not None or supplied_components)
        and grading not in {"exact", "component"}
    ):
        raise ValueError(
            'Custom operators with a correct answer require grading-method="exact" or "component".'
        )
    return RenderConfig(
        answer=answer,
        operator=operator,
        operator_latex=operator_latex,
        limits=limits,
        index=index,
        variables=variables,
        custom_functions=custom_functions,
        direction=direction,
        allow_direction_input=allow_direction_input,
        allowed_blank=allowed_blank,
        allow_complex=pl.get_boolean_attrib(element, "allow-complex", False),
        show_help_text=pl.get_boolean_attrib(element, "show-help-text", True),
        body_size=body_size,
        limit_size=limit_size,
        grading=grading,
        body_weight=body_weight,
        weight=pl.get_integer_attrib(element, "weight", 1),
        correct_attribute=correct_attribute,
        correct_components=(
            tuple(
                (component, supplied_components[component]) for component in components
            )
            if supplied_components
            else ()
        ),
    )


def _decode(value: Any, variables: tuple[str, ...] = ()) -> sympy.Expr:
    local_symbols = {name: sympy.Symbol(name) for name in variables}
    locals = {
        "_Exp1": sympy.E,
        "_ImaginaryUnit": sympy.I,
        **local_symbols,
    }
    match value:
        case {"_type": "sympy", "_value": str(source)}:
            # Canonical leaves are trusted author answers. PrairieLearn's
            # student-input parser cannot round-trip every value emitted by
            # sympy_to_json: binder tuples look like intervals, and Boolean
            # relations are rejected by its expression allowlist.
            try:
                return psu.json_to_sympy(value, allow_sets=True)
            except Exception:
                # TODO(parser-migration.md, upstream PSU canonical decoder): remove this trusted-author-only
                # fallback when json_to_sympy round-trips binders and relations emitted
                # by sympy_to_json. Student answers never enter _decode.
                return sympy.sympify(source, locals=locals)

        case str():
            raise ValueError(
                "Bare mathematical strings must use the PrairieLearn parser."
            )

        case _:
            return value


def _json(value: sympy.Basic) -> dict[str, Any]:
    return cast(dict[str, Any], psu.sympy_to_json(cast(Any, value), allow_sets=True))


def _canonical(
    config: RenderConfig,
    values: dict[str, sympy.Basic],
    direction: str | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "_type": "operator_expression",
        "_version": 1,
        "operator": config.operator,
        "limits": config.limits,
        "index": _json(sympy.Symbol(config.index)),
    }
    if config.operator == "custom":
        result["operator_latex"] = config.operator_latex
    result.update({key: _json(values[key]) for key in config.components})
    if config.limits == "approach":
        result["direction"] = direction or config.direction
    return result


def _structured(config: RenderConfig, value: dict[str, Any]) -> dict[str, Any]:
    keys = {"_type", "_version", "operator", "limits", "index", *config.components}
    if config.operator == "custom":
        keys.add("operator_latex")
    if config.limits == "approach":
        keys.add("direction")
    if (
        set(value) != keys
        or value.get("_type") != "operator_expression"
        or value.get("_version") != 1
    ):
        raise ValueError(
            "Correct answer is not a well-formed version 1 operator expression."
        )
    if value["operator"] != config.operator or value["limits"] != config.limits:
        raise ValueError(
            "Correct answer operator or limits form does not match the element."
        )
    if config.operator == "custom" and value["operator_latex"] != config.operator_latex:
        raise ValueError(
            "Correct answer custom operator does not match operator-latex."
        )
    if config.limits == "approach" and value["direction"] != config.direction:
        raise ValueError("Correct answer direction does not match limit-direction.")
    if _decode(value["index"], (config.index,)) != sympy.Symbol(config.index):
        raise ValueError("Correct answer index does not match index-variable.")
    values = {
        key: _decode(
            value[key],
            tuple(dict.fromkeys((*config.variables, config.index)))
            if key == "body"
            else config.variables,
        )
        for key in config.components
    }
    if not all(isinstance(item, sympy.Basic) for item in values.values()):
        raise ValueError(
            "Every mathematical component must be PrairieLearn SymPy JSON."
        )
    _validate_component_values(config, cast(dict[str, sympy.Basic], values))
    return _canonical(config, cast(dict[str, sympy.Basic], values))


def _validate_component_values(
    config: RenderConfig, values: dict[str, sympy.Basic]
) -> None:
    allowed = set(config.variables) | {config.index}
    for component, item in values.items():
        if _requires_set(config, cast(Component, component)) and not _is_set_input(
            item
        ):
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


def _component_values(
    config: RenderConfig, value: dict[Component, Any]
) -> dict[str, Any]:
    values: dict[str, sympy.Basic] = {}
    for component in config.components:
        raw = value[component]
        variables = (
            tuple(dict.fromkeys((*config.variables, config.index)))
            if component == "body"
            else config.variables
        )
        if isinstance(raw, str):
            try:
                parsed = _parse(raw, variables, config.custom_functions)
            except _ParseError as exc:
                raise ValueError(
                    f'Parsing correct answer component "{component}" failed.'
                ) from exc._src
        else:
            try:
                parsed = _decode(raw, variables)
            except Exception as exc:
                raise ValueError(
                    f'Decoding correct answer component "{component}" failed.'
                ) from exc
        if not isinstance(parsed, sympy.Basic):
            raise TypeError(
                f'Correct answer component "{component}" must be a SymPy value or parseable string.'
            )
        if _requires_set(config, component) and not _is_set_input(parsed):
            raise ValueError(f'Correct answer component "{component}" must be a set.')
        values[component] = parsed
    return _canonical(config, values)


def _binder(config: RenderConfig, value: Any) -> dict[str, Any] | None:
    index = sympy.Symbol(config.index)
    match config.operator:
        case "limit":
            if not isinstance(value, sympy.Limit):
                return None
            if len(value.args) != 4:
                raise ValueError("Correct answer Limit has an invalid structure.")
            body, variable, target, direction = value.args
            if variable != index:
                raise ValueError("Correct answer index does not match index-variable.")
            match str(direction):
                case "+-" | "-" | "+" as direction_symbol:
                    public = DIRECTION_NAMES[direction_symbol]
                case _:
                    public = None
            if public != config.direction:
                raise ValueError(
                    "Correct answer Limit direction does not match limit-direction."
                )
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
        raise ValueError("Correct answer must have exactly one limits tuple.")
    limit_values = value.args[1].args
    expected_length = 3 if config.limits == "bounds" else 2
    if len(limit_values) != expected_length:
        raise ValueError(
            f'Correct answer for limits="{config.limits}" must have exactly one '
            f"{expected_length}-item limits tuple."
        )
    variable = limit_values[0]
    if variable != index:
        raise ValueError("Correct answer index does not match index-variable.")
    body = value.args[0]
    match config.limits:
        case "bounds":
            return _canonical(
                config,
                {
                    "lower": limit_values[1],
                    "upper": limit_values[2],
                    "body": body,
                },
            )
        case "domain":
            return _canonical(config, {"domain": limit_values[1], "body": body})
        case "approach":
            raise ValueError(
                f"Correct answer operator does not support limits={config.limits!r}."
            )


def _formatted_answer(config: RenderConfig, source: str) -> dict[str, Any] | None:
    formatted = _formatted_call(source, _operator_fn_name(config.operator))
    if formatted is None and config.operator == "limit":
        formatted = _legacy_limit_call(source)
    if formatted is None:
        return None
    body_source, limits = formatted
    match config.limits:
        case "domain":
            expected_length = 2
        case "bounds" | "approach":
            expected_length = 3
    if len(limits) != expected_length:
        raise ValueError(
            f'Correct answer for limits="{config.limits}" requires a '
            f"{expected_length}-item limits tuple."
        )
    try:
        body = _parse(
            body_source,
            tuple(dict.fromkeys((*config.variables, config.index))),
            config.custom_functions,
        )
    except _ParseError as exc:
        raise ValueError(
            "The correct answer contains invalid SymPy data."
        ) from exc._src
    index_name = _identifier(limits[0])
    if index_name != config.index:
        raise ValueError("Correct answer index does not match index-variable.")

    try:
        match config.limits:
            case "approach":
                direction = _formatted_direction(limits)
                if direction is None:
                    raise ValueError('Limit direction must be "+", "-", or "+-".')
                public_direction = DIRECTION_NAMES.get(direction)
                if public_direction is None:
                    raise ValueError('Limit direction must be "+", "-", or "+-".')
                if public_direction != config.direction:
                    raise ValueError(
                        "Correct answer direction does not match limit-direction."
                    )
                values = {
                    "target": _parse(
                        limits[1], config.variables, config.custom_functions
                    ),
                    "body": body,
                }
            case "bounds":
                values = {
                    "lower": _parse(
                        limits[1], config.variables, config.custom_functions
                    ),
                    "upper": _parse(
                        limits[2], config.variables, config.custom_functions
                    ),
                    "body": body,
                }
            case "domain":
                values = {
                    "domain": _parse(
                        limits[1], config.variables, config.custom_functions
                    ),
                    "body": body,
                }
    except _ParseError as exc:
        raise ValueError(
            "The correct answer contains invalid SymPy data."
        ) from exc._src
    _validate_component_values(config, values)
    return _canonical(config, values)


def _correct(config: RenderConfig, data: pl.QuestionData) -> dict[str, Any] | None:
    raw = _raw_correct_answer(
        config.answer,
        config.correct_attribute,
        dict(config.correct_components),
        data,
    )
    if (
        config.operator == "custom"
        and raw is not None
        and config.grading not in {"exact", "component"}
    ):
        raise ValueError(
            'Custom operators with a correct answer require grading-method="exact" or "component".'
        )
    if raw is None:
        return None
    if isinstance(raw, dict) and raw.get("_type") == "operator_expression":
        return _structured(config, raw)
    if config.correct_components:
        return _component_values(config, cast(dict[Component, Any], raw))
    if isinstance(raw, str):
        converted = _formatted_answer(config, raw)
        if converted is not None:
            return converted
        if config.operator == "limit" and re.match(r"^\s*Limit\s*\(", raw):
            raise ValueError("The correct answer has an invalid Limit wrapper.")
        raise TypeError(
            f'Correct answer "{config.answer}" must be a matching formatted object or canonical structured dictionary.'
        )
    value = _decode(raw, tuple(dict.fromkeys((*config.variables, config.index))))
    converted = _binder(config, value)
    if converted is not None:
        return converted
    raise TypeError(
        f'Correct answer "{config.answer}" must be a matching formatted object or canonical structured dictionary.'
    )


def prepare(element_html: str, data: pl.QuestionData) -> None:
    config = _config(element_html, data)
    correct = _correct(config, data)
    if correct is not None:
        data.setdefault("correct_answers", {})[config.answer] = correct


def _field(
    config: RenderConfig,
    component: str,
    label: str,
    size: int,
    data: pl.QuestionData,
    prefix: str | None = None,
    suffix: str | None = None,
    score: float | None = None,
) -> dict[str, Any]:
    name = config.name(component)
    variables = (
        tuple(dict.fromkeys((*config.variables, config.index)))
        if component == "body"
        else config.variables
    )
    return {
        "html": symbolic_input_adapter.render(
            data,
            name=name,
            variables=variables,
            custom_functions=config.custom_functions,
            aria_label=label,
            size=size,
            allowed_types={
                "all"
                if _requires_set(config, cast(Component, component))
                else "expression"
            },
            allow_complex=config.allow_complex,
            show_help_text=component == "body" and config.show_help_text,
            show_score=config.grading == "component",
            prefix=prefix,
            suffix=suffix,
            score=score,
        ),
    }


def _component_scores(config: RenderConfig, data: pl.QuestionData) -> dict[str, float]:
    if config.grading != "component" or config.answer not in data.get(
        "partial_scores", {}
    ):
        return {}
    submitted_json = data.get("submitted_answers", {}).get(config.answer)
    correct_json = _correct(config, data)
    if not isinstance(submitted_json, dict) or correct_json is None:
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
    if config.limits == "approach" and config.allow_direction_input:
        scores["direction"] = float(
            submitted_json.get("direction") == correct_json.get("direction")
        )
    return scores


def _direction_input(
    config: RenderConfig, data: pl.QuestionData, score: float | None
) -> dict[str, Any]:
    name = config.name("direction")
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
    context: dict[str, Any], *, template: Literal["main", "submission"]
) -> str:
    match template:
        case "main":
            stub = "pl-big-operator-input.mustache"
        case "submission":
            stub = "pl-big-operator-input-submission.mustache"
    return chevron.render(
        (HERE / stub).read_text(),
        context,
        partials_path=str(HERE / "partials"),
        partials_ext="mustache",
    )


def _question_mustache(config: RenderConfig, data: pl.QuestionData) -> str:
    index = sympy.latex(sympy.Symbol(config.index))
    component_scores = _component_scores(config, data)
    context: dict[str, Any] = {
        config.limits: True,
        "integral": config.operator == "integral",
        "operator_latex": config.operator_latex,
        "index_label": index,
        "body_size": config.body_size,
        "limit_size": config.limit_size,
        "body_field": _field(
            config,
            "body",
            "Operator body",
            config.body_size,
            data,
            score=component_scores.get("body"),
        ),
    }
    partial_score = data.get("partial_scores", {}).get(config.answer)
    if partial_score is not None:
        context["score_badge"] = _score_badge(float(partial_score.get("score") or 0))
    match config.limits:
        case "bounds":
            context["lower_field"] = _field(
                config,
                "lower",
                "Lower bound",
                config.limit_size,
                data,
                None if config.operator == "integral" else rf"\({index} = \)",
                score=component_scores.get("lower"),
            )
            context["upper_field"] = _field(
                config,
                "upper",
                "Upper bound",
                config.limit_size,
                data,
                score=component_scores.get("upper"),
            )
        case "domain":
            context["annotation_field"] = _field(
                config,
                "domain",
                "Integration domain"
                if config.operator == "integral"
                else "Index domain",
                config.limit_size,
                data,
                None if config.operator == "integral" else rf"\({index} \in \)",
                score=component_scores.get("domain"),
            )
        case "approach":
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
            context["annotation_field"] = _field(
                config,
                "target",
                "Approach target",
                config.limit_size,
                data,
                rf"\({index} \to \)",
                rf"\({{}}^{direction_suffix}\)" if direction_suffix else None,
                score=component_scores.get("target"),
            )
    return _render_mustache(context, template="main")


def _tex(config: RenderConfig, raw: dict[str, Any] | None) -> str:
    raw = raw or {}

    def get_comp(c: Component):
        return raw.get(config.name(c), "?")

    index = sympy.latex(sympy.Symbol(config.index))
    op = config.operator_latex
    if config.operator == "custom":
        op = rf"\mathop{{{op}}}\limits"
    match config.limits, config.operator:
        case "bounds", "integral":
            return rf"{op}_{{{get_comp('lower')}}}^{{{get_comp('upper')}}} {get_comp('body')}\,\mathrm{{d}}{index}"
        case "bounds", _:
            return rf"{op}_{{{index}={get_comp('lower')}}}^{{{get_comp('upper')}}} {get_comp('body')}"
        case "domain", "integral":
            return rf"{op}_{{{get_comp('domain')}}} {get_comp('body')}\,\mathrm{{d}}{index}"
        case "domain", _:
            return rf"{op}_{{{index}\in {get_comp('domain')}}} {get_comp('body')}"
        case "approach", _:
            direction_value = (
                str(raw.get(config.name("direction"), ""))
                if config.allow_direction_input
                else config.direction
            )
            direction = {
                "two-sided": "",
                "from-left": "^-",
                "from-right": "^+",
            }.get(direction_value, "^?")
            return rf"{op}_{{{index}\to {get_comp('target')}{direction}}} {get_comp('body')}"


def _structured_tex(config: RenderConfig, structured: dict[str, Any]) -> str:
    values = _values(config, structured)
    raw = {config.name(key): sympy.latex(value) for key, value in values.items()}
    if config.limits == "approach" and config.allow_direction_input:
        raw[config.name("direction")] = structured.get("direction", "")
    return _tex(config, raw)


def _submitted_tex(config: RenderConfig, data: pl.QuestionData) -> str:
    structured = data.get("submitted_answers", {}).get(config.answer)
    if isinstance(structured, dict):
        try:
            return _structured_tex(config, structured)
        except (KeyError, TypeError, ValueError):
            pass
    return _tex(config, data.get("raw_submitted_answers"))


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
            if correct is None:
                return ""
            return _render_mustache(
                {"tex": _structured_tex(config, correct)}, template="submission"
            )
        case "submission":
            context: dict[str, Any] = {"tex": _submitted_tex(config, data)}
            partial_score = data.get("partial_scores", {}).get(config.answer)
            if partial_score is not None:
                context.update(_score_badge(float(partial_score.get("score") or 0)))
            return _render_mustache(context, template="submission")


def _parse(
    source: str,
    variables: tuple[str, ...],
    custom_functions: tuple[str, ...] = (),
) -> sympy.Basic:
    source = re.sub(r"\binfinity\b", "infty", source)
    for name in ("sin", "cos", "tan", "sec", "csc", "cot"):
        source = re.sub(rf"\b{' *'.join(name)}\b", name, source)
    try:
        return psu.convert_string_to_sympy(
            source,
            variables,
            allow_hidden=True,
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


def _is_set_input(value: sympy.Basic) -> bool:
    # A bare symbol may denote a set whose members are not known at parse time.
    return isinstance(value, (sympy.Set, sympy.Symbol))


def _component_allows_blank(config: RenderConfig, component: ResponseComponent) -> bool:
    return config.allowed_blank == "all" or (
        config.allowed_blank == "body"
        if component == "body"
        else config.allowed_blank == "limits"
    )


def _parse_values(
    config: RenderConfig, data: pl.QuestionData
) -> dict[str, sympy.Basic] | None:
    submitted = data.setdefault("submitted_answers", {})
    result: dict[str, sympy.Basic] = {}
    raw_answers = data.get("raw_submitted_answers", {})
    for component in config.components:
        name = config.name(component)
        if not str(raw_answers.get(name, "")).strip() and _component_allows_blank(
            config, component
        ):
            submitted[name] = ""
            continue
        variables = (
            tuple(dict.fromkeys((*config.variables, config.index)))
            if component == "body"
            else config.variables
        )
        requires_set = _requires_set(config, component)
        allowed_types: set[psu.AllowedSympyType] = {
            "all" if requires_set else "expression"
        }
        parsed = psu.try_parse_symbolic_submission(
            cast(str | None, raw_answers.get(name)),
            variables,
            formula_editor=True,
            custom_functions=config.custom_functions,
            allowed_types=allowed_types,
            allow_complex=config.allow_complex,
        )
        if isinstance(parsed, psu.SympyParseFailure):
            data.setdefault("format_errors", {})[name] = parsed.error
            submitted[name] = None
            continue
        if parsed.expr == "":
            raise AssertionError("Component parsing does not allow blank values.")
        submitted[name] = parsed.json
        if requires_set and not _is_set_input(parsed.expr):
            data.setdefault("format_errors", {})[name] = "This field must be a set."
            continue
        result[component] = parsed.expr
        data.get("format_errors", {}).pop(name, None)
    return result if len(result) == len(config.components) else None


def parse(element_html: str, data: pl.QuestionData) -> None:
    config = _config(element_html, data)
    submitted = data.setdefault("submitted_answers", {})
    raw = data.get("raw_submitted_answers", {})
    blank_components: list[ResponseComponent] = [
        component
        for component in config.response_components
        if not str(raw.get(config.name(component), "")).strip()
    ]
    if blank_components and all(
        _component_allows_blank(config, component) for component in blank_components
    ):
        _parse_values(config, data)
        if "direction" in blank_components:
            direction_name = config.name("direction")
            submitted[direction_name] = ""
            data.get("format_errors", {}).pop(direction_name, None)
        errors = data.get("format_errors", {})
        has_component_error = any(
            config.name(component) in errors for component in config.response_components
        )
        submitted[config.answer] = None if has_component_error else ""
        return
    values = _parse_values(config, data)
    direction = config.direction
    if config.limits == "approach" and config.allow_direction_input:
        direction_name = config.name("direction")
        direction = str(raw.get(direction_name, "")).strip()
        if direction not in DIRECTION_SYMBOLS:
            data.setdefault("format_errors", {})[direction_name] = (
                "Select a valid limit direction."
            )
            submitted[direction_name] = None
            submitted[config.answer] = None
            return
        submitted[direction_name] = direction
        data.get("format_errors", {}).pop(direction_name, None)
    submitted[config.answer] = (
        _canonical(config, values, direction=direction) if values else None
    )


def _values(config: RenderConfig, structured: dict[str, Any]) -> dict[str, sympy.Basic]:
    if not all(key in structured for key in config.components):
        raise ValueError("Operator expression is missing mathematical components.")
    return {
        key: cast(
            sympy.Basic,
            _decode(
                structured[key],
                tuple(dict.fromkeys((*config.variables, config.index)))
                if key == "body"
                else config.variables,
            ),
        )
        for key in config.components
    }


def _construct(
    config: RenderConfig,
    values: dict[str, sympy.Basic],
    direction: DirectionName | None = None,
) -> sympy.Basic:
    index = sympy.Symbol(config.index)
    body = values["body"]
    match config.limits, config.operator:
        case "bounds", "custom":
            return sympy.Tuple(body, (index, values["lower"], values["upper"]))
        case "bounds", operator:
            bound_constructor = OP_METADATA[operator].bounds_constructor
            return bound_constructor(body, (index, values["lower"], values["upper"]))
        case "approach", _:
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
    left_values: dict[str, sympy.Basic],
    right_values: dict[str, sympy.Basic],
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
        left, right = left.doit(), right.doit()
        if left == right:
            return True
        difference = sympy.simplify(sympy.expand(cast(Any, left) - cast(Any, right)))
        return difference == 0 or difference.equals(0) is True
    except (TypeError, ValueError, ZeroDivisionError):
        return False


def grade(element_html: str, data: pl.QuestionData) -> None:
    config = _config(element_html, data)
    correct_json = _correct(config, data)
    if correct_json is None:
        return
    if data.get("submitted_answers", {}).get(config.answer) == "":
        score = 0.0
    else:
        submitted_json = data.get("submitted_answers", {}).get(config.answer)
        if not isinstance(submitted_json, dict):
            data.setdefault("partial_scores", {})[config.answer] = {
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
            data.setdefault("partial_scores", {})[config.answer] = {
                "score": 0.0,
                "weight": config.weight,
            }
            pl.set_weighted_score_data(data)
            return
        match config.grading:
            case "exact":
                score = float(submitted_json == correct_json)
            case "component":
                weights = [
                    config.body_weight if c == "body" else 1 for c in config.components
                ]
                earned = sum(
                    w
                    for c, w in zip(config.components, weights, strict=False)
                    if _expressions_equivalent(submitted[c], correct[c])
                )
                if config.limits == "approach" and config.allow_direction_input:
                    weights.append(1)
                    earned += int(
                        submitted_json.get("direction") == correct_json.get("direction")
                    )
                score = earned / sum(weights)
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
    data.setdefault("partial_scores", {})[config.answer] = {
        "score": score,
        "weight": config.weight,
    }
    pl.set_weighted_score_data(data)
