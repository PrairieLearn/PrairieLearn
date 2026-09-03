from __future__ import annotations

import importlib
import re
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal, Never

import lxml.html
import pytest
import sympy

if TYPE_CHECKING:
    from collections.abc import Callable

    from prairielearn import QuestionData

ELEMENT_DIR = Path(__file__).parent
CSS_PATH = ELEMENT_DIR / "pl-big-operator-input.css"
README_PATH = ELEMENT_DIR / "README.md"
SCHEMA_PATH = ELEMENT_DIR / "schemas" / "pl-big-operator-input.json"
big_operator_input = importlib.import_module("pl-big-operator-input")


def html(**attrs: object) -> str:
    values = {"answers-name": "op", "index-variable": "k", **attrs}
    text = " ".join(
        f'{key}="{value}"' for key, value in values.items() if value is not None
    )
    return f"<pl-big-operator-input {text}></pl-big-operator-input>"


def data(
    correct: object | None = None,
    raw: dict[str, str] | None = None,
    panel: Literal["answer", "submission", "question"] = "question",
) -> dict[str, Any]:
    return {
        "params": {},
        "correct_answers": {} if correct is None else {"op": correct},
        "raw_submitted_answers": raw or {},
        "panel": panel,
    }


@pytest.mark.parametrize(
    ("operator", "limits"),
    [
        ("sum", "bounds"),
        ("product", "bounds"),
        ("integral", "bounds"),
        ("limit", "approach"),
        ("union", "domain"),
        ("intersection", "domain"),
        ("disjoint-union", "domain"),
        ("min", "domain"),
        ("max", "domain"),
    ],
)
def test_auto_limits(operator: str, limits: str) -> None:
    assert big_operator_input._config(html(operator=operator)).limits == limits


def test_operator_metadata_defaults_are_valid() -> None:
    for metadata in big_operator_input.OP_METADATA.values():
        assert metadata.default_limit in metadata.valid_limits


@pytest.mark.parametrize(
    "operator",
    [
        "Sum",
        "Product",
        "Integral",
        "Limit",
        "Union",
        "Intersection",
        "Disjoint-union",
        "Min",
        "Max",
    ],
)
def test_operator_attribute_accepts_initial_capital(operator: str) -> None:
    config = big_operator_input._config(html(operator=operator))
    assert config.operator == operator[:1].lower() + operator[1:]


def test_custom_operator_attribute_accepts_initial_capital() -> None:
    config = big_operator_input._config(
        html(operator="Custom", limits="bounds", **{"operator-latex": r"\star"})
    )
    assert config.operator == "custom"


def test_operator_attribute_rejects_other_capitalization() -> None:
    with pytest.raises(ValueError, match=r"Unknown operator \"sUM\""):
        big_operator_input._config(html(operator="SUM"))


@pytest.mark.parametrize("operator", ["and", "or", "And", "Or"])
def test_operator_attribute_rejects_boolean_operators(operator: str) -> None:
    with pytest.raises(ValueError, match="Unknown operator"):
        big_operator_input._config(html(operator=operator))


@pytest.mark.parametrize("correct", ["And(k, (k, {1, 2}))", "Or(k, (k, {1, 2}))"])
def test_whole_answers_do_not_infer_boolean_operators(correct: str) -> None:
    markup = html(**{"correct-answer": correct})

    with pytest.raises(ValueError, match='The "operator" attribute is required'):
        big_operator_input.prepare(markup, data())


@pytest.mark.parametrize(
    ("operator", "correct", "limits"),
    [
        ("sum", "Sum(k**2, (k, 1, 4))", "bounds"),
        ("product", "Product(k, (k, 1, 4))", "bounds"),
        ("integral", "Integral(k, (k, 0, 1))", "bounds"),
        ("limit", "Limit(sin(k) / k, (k, 0, '+-'))", "approach"),
        ("union", "Union({k}, (k, {1, 2}))", "domain"),
        ("intersection", "Intersection({k}, (k, {1, 2}))", "domain"),
        ("disjoint-union", "DisjointUnion({k}, (k, {1, 2}))", "domain"),
        ("min", "Min(k**2, (k, {1, 2}))", "domain"),
        ("max", "Max(k**2, (k, {1, 2}))", "domain"),
    ],
)
def test_infers_operator_from_whole_answer_strings(
    operator: str, correct: str, limits: str
) -> None:
    markup = html(**{"correct-answer": correct, "index-variable": None})
    state = data()
    big_operator_input.prepare(markup, state)
    assert state["correct_answers"]["op"]["operator"] == operator
    assert state["correct_answers"]["op"]["limits"] == limits
    assert big_operator_input._config(markup, state).index == "k"
    assert big_operator_input._config(markup, state).operator == operator
    assert big_operator_input.OP_METADATA[operator].tex in big_operator_input.render(
        markup, state
    )


@pytest.mark.parametrize(
    ("operator", "function_name"),
    [
        ("sum", "Sum"),
        ("product", "Product"),
        ("integral", "Integral"),
        ("union", "Union"),
        ("intersection", "Intersection"),
        ("disjoint-union", "DisjointUnion"),
        ("min", "Min"),
        ("max", "Max"),
        ("custom", "Custom"),
    ],
)
def test_sympy_string_forms_are_parseable(operator: str, function_name: str) -> None:
    k = sympy.Symbol("k")
    if operator == "sum":
        correct = sympy.Sum(k**2, (k, 1, 4))
    elif operator == "product":
        correct = sympy.Product(k**2, (k, 1, 4))
    elif operator == "integral":
        correct = sympy.Integral(k**2, (k, 1, 4))
    elif operator in {"union", "intersection", "disjoint-union"}:
        correct = sympy.Function(function_name)(sympy.FiniteSet(k), (k, 1, 4))
    else:
        correct = sympy.Function(function_name)(k**2, (k, 1, 4))
    attributes = {"correct-answer": str(correct), "index-variable": None}
    if operator == "custom":
        attributes.update({"operator-latex": r"\star", "grading-method": "component"})
    state = data()

    big_operator_input.prepare(html(**attributes), state)

    assert state["correct_answers"]["op"]["operator"] == operator


def test_sympy_limit_string_form_is_parseable() -> None:
    k = sympy.Symbol("k")
    correct = sympy.Limit(sympy.sin(k) / k, k, 0, dir="+")
    state = data()

    big_operator_input.prepare(
        html(**{"correct-answer": str(correct), "index-variable": None}), state
    )

    answer = state["correct_answers"]["op"]
    assert answer["operator"] == "limit"
    assert answer["direction"] == "from-right"


def test_parse_normalizes_prairielearn_parser_errors() -> None:
    with pytest.raises(big_operator_input._ParseError) as exc_info:
        big_operator_input._unchecked_parse("bad@", ())

    assert exc_info.value.__cause__ is None
    assert isinstance(exc_info.value._src, big_operator_input.psu.BaseSympyError)


def test_parse_does_not_normalize_unexpected_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail(*args: object, **kwargs: object) -> Never:
        raise RuntimeError("unexpected parser failure")

    monkeypatch.setattr(big_operator_input.psu, "convert_string_to_sympy", fail)

    with pytest.raises(RuntimeError, match="unexpected parser failure"):
        big_operator_input._unchecked_parse("1", ())


def test_formatted_answer_normalizes_parse_errors() -> None:
    markup = html(operator="sum", **{"correct-answer": "Sum(bad@, (k, 1, 2))"})

    with pytest.raises(ValueError, match="invalid SymPy data") as exc_info:
        big_operator_input.prepare(markup, data())

    assert isinstance(exc_info.value.__cause__, big_operator_input.psu.BaseSympyError)


@pytest.mark.parametrize(
    ("operator", "correct"),
    [
        ("sum", sympy.Sum(sympy.Symbol("k") ** 2, (sympy.Symbol("k"), 1, 4))),
        ("product", sympy.Product(sympy.Symbol("k"), (sympy.Symbol("k"), 1, 4))),
        ("integral", sympy.Integral(sympy.Symbol("k"), (sympy.Symbol("k"), 0, 1))),
        (
            "limit",
            sympy.Limit(
                sympy.sin(sympy.Symbol("k")) / sympy.Symbol("k"),
                sympy.Symbol("k"),
                0,
                dir="+-",
            ),
        ),
    ],
)
def test_infers_operator_from_sympy_json(operator: str, correct: sympy.Basic) -> None:
    state = data(big_operator_input.psu.sympy_to_json(correct))
    big_operator_input.prepare(html(**{"index-variable": None}), state)
    assert state["correct_answers"]["op"]["operator"] == operator
    assert (
        big_operator_input._config(html(**{"index-variable": None}), state).index == "k"
    )


@pytest.mark.parametrize(
    "correct",
    [
        {"_value": "Sum(k, (k, 1, 4))"},
        {"_type": "not-sympy", "_value": "Sum(k, (k, 1, 4))"},
        {"_type": "sympy"},
        {"_type": "sympy", "_value": None},
        {"_type": "sympy", "_value": 1},
    ],
)
def test_does_not_infer_from_invalid_sympy_json_like_dictionary(
    correct: dict[str, object],
) -> None:
    assert big_operator_input._infer_spec(correct) == (None, None, None)


def test_infers_operator_from_canonical_dictionary() -> None:
    state = data(canonical())
    big_operator_input.prepare(html(**{"index-variable": None}), state)
    assert state["correct_answers"]["op"]["operator"] == "union"
    assert (
        big_operator_input._config(html(**{"index-variable": None}), state).index == "k"
    )


def test_omitted_index_requires_inferable_whole_answer() -> None:
    with pytest.raises(ValueError, match='"index-variable" attribute is required'):
        big_operator_input._config(html(operator="sum", **{"index-variable": None}))
    with pytest.raises(ValueError, match='"index-variable" attribute is required'):
        big_operator_input._config(
            html(
                operator="sum",
                **{
                    "index-variable": None,
                    "correct-answer-start": "1",
                    "correct-answer-end": "4",
                    "correct-answer-body": "k",
                },
            )
        )


def test_omitted_operator_requires_inferable_whole_answer() -> None:
    with pytest.raises(ValueError, match='"operator" attribute is required'):
        big_operator_input._config(html())
    markup = html(
        **{
            "correct-answer-start": "1",
            "correct-answer-end": "4",
            "correct-answer-body": "k",
        },
    )
    with pytest.raises(ValueError, match='"operator" attribute is required'):
        big_operator_input._config(markup)


@pytest.mark.parametrize(
    "correct",
    [
        "NotAnOperator(k, (k, 1, 4))",
        {"_type": "operator_expression", "_version": 1},
        {"_type": "operator_expression", "operator": "custom"},
        {"_type": "sympy", "_value": "k + 1"},
    ],
)
def test_uninferable_string_or_dictionary_requires_operator(correct: object) -> None:
    with pytest.raises(ValueError, match='"operator" attribute is required'):
        big_operator_input.prepare(html(), data(correct))


def test_explicit_operator_remains_authoritative() -> None:
    with pytest.raises(TypeError, match="matching formatted object"):
        big_operator_input.prepare(html(operator="sum"), data("Product(k, (k, 1, 4))"))


def test_raw_sympy_object_does_not_trigger_inference() -> None:
    correct = sympy.Product(sympy.Symbol("k"), (sympy.Symbol("k"), 1, 4))
    with pytest.raises(ValueError, match='"operator" attribute is required'):
        big_operator_input.prepare(html(), data(correct))
    state = data(correct)
    big_operator_input.prepare(html(operator="product"), state)
    assert state["correct_answers"]["op"]["operator"] == "product"


def test_inferred_operator_validates_explicit_limits() -> None:
    with pytest.raises(ValueError, match='does not support limits="bounds"'):
        big_operator_input.prepare(
            html(
                limits="bounds",
                **{"correct-answer": "Limit(k, (k, 0, '+-'))"},
            ),
            data(),
        )


def test_inferred_limit_validates_and_preserves_direction() -> None:
    markup = html(**{"correct-answer": "Limit(sin(k) / k, (k, 0, '+'))"})
    state = data()
    big_operator_input.prepare(markup, state)
    assert state["correct_answers"]["op"]["direction"] == "from-right"


def test_limit_infers_index_and_direction_from_whole_answer() -> None:
    markup = """<pl-big-operator-input
        answers-name="op"
        correct-answer="Limit(sin(x) / x, (x, 0, '+'))"
        allowed-blank="all"
    ></pl-big-operator-input>"""
    state = data()

    big_operator_input.prepare(markup, state)

    answer = state["correct_answers"]["op"]
    assert big_operator_input._decode(answer["index"]) == sympy.Symbol("x")
    assert answer["direction"] == "from-right"


def test_explicit_limit_direction_still_rejects_mismatch() -> None:
    markup = html(**{
        "correct-answer": "Limit(k, (k, 0, '+'))",
        "limit-direction": "from-left",
    })
    with pytest.raises(ValueError, match="does not match limit-direction"):
        big_operator_input.prepare(markup, data())


@pytest.mark.parametrize(
    ("direction", "public_direction"),
    [("+", "from-right"), ("-", "from-left"), ("+-", "two-sided")],
)
def test_formatted_limit_accepts_documented_directions(
    direction: str, public_direction: str
) -> None:
    markup = html(**{
        "correct-answer": f"Limit(k**2, (k, 0, '{direction}'))",
        "limit-direction": public_direction,
    })
    state = data()

    big_operator_input.prepare(markup, state)

    assert state["correct_answers"]["op"]["direction"] == public_direction


@pytest.mark.parametrize(
    "correct",
    [
        "Limit(k, (k, 0, 'sideways'))",
        "Limit(k, k, 0, dir='sideways')",
    ],
)
def test_limit_rejects_unknown_direction_in_either_string_form(correct: str) -> None:
    with pytest.raises(
        ValueError, match=r"Limit direction must be|invalid Limit wrapper"
    ):
        big_operator_input.prepare(html(**{"correct-answer": correct}), data())


def test_infers_domain_integral_from_two_item_binder() -> None:
    markup = html(
        variables="Gamma",
        **{"correct-answer": "Integral(z, (z, Gamma))", "index-variable": "z"},
    )
    state = data()

    big_operator_input.prepare(markup, state)

    inferred = state["correct_answers"]["op"]
    values = big_operator_input._values(
        big_operator_input._config(markup, state), inferred
    )
    assert inferred["operator"] == "integral"
    assert inferred["limits"] == "domain"
    assert values == {"domain": sympy.Symbol("Gamma"), "body": sympy.Symbol("z")}


def test_infers_domain_integral_from_sympy_json() -> None:
    z, gamma = sympy.symbols("z Gamma")
    state = data(big_operator_input.psu.sympy_to_json(sympy.Integral(z, (z, gamma))))

    big_operator_input.prepare(
        html(variables="Gamma", **{"index-variable": "z"}), state
    )

    assert state["correct_answers"]["op"]["operator"] == "integral"
    assert state["correct_answers"]["op"]["limits"] == "domain"


def test_infers_bounds_from_three_item_variadic_binder() -> None:
    markup = html(**{"correct-answer": "Max(k**2, (k, 1, 4))"})
    state = data()

    big_operator_input.prepare(markup, state)

    assert state["correct_answers"]["op"]["operator"] == "max"
    assert state["correct_answers"]["op"]["limits"] == "bounds"


def test_whole_domain_integral_matches_component_answer() -> None:
    whole_markup = html(
        variables="Gamma",
        **{"correct-answer": "Integral(z, (z, Gamma))", "index-variable": "z"},
    )
    component_markup = html(
        operator="integral",
        limits="domain",
        variables="Gamma",
        **{
            "index-variable": "z",
            "correct-answer-domain": "Gamma",
            "correct-answer-body": "z",
        },
    )
    whole_state, component_state = data(), data()

    big_operator_input.prepare(whole_markup, whole_state)
    big_operator_input.prepare(component_markup, component_state)

    assert (
        whole_state["correct_answers"]["op"] == component_state["correct_answers"]["op"]
    )


@pytest.mark.parametrize("limits", ["bounds", "domain"])
def test_custom_operator_requires_explicit_supported_limits(limits: str | None) -> None:
    config = big_operator_input._config(
        html(operator="custom", limits=limits, **{"operator-latex": r"\mathbb{E}"})
    )

    assert config.operator == "custom"
    assert config.operator_latex == r"\mathbb{E}"
    assert config.limits == limits


def test_custom_operator_rejects_auto_limits() -> None:
    with pytest.raises(ValueError, match="explicit limits"):
        big_operator_input.prepare(
            html(operator="custom", **{"operator-latex": r"\star"}), data()
        )


def test_custom_operator_requires_nonempty_latex() -> None:
    with pytest.raises(ValueError, match="required"):
        big_operator_input.prepare(html(operator="custom", limits="bounds"), data())


def test_builtin_operator_accepts_custom_latex() -> None:
    markup = html(operator="sum", **{"operator-latex": r"\star"})
    config = big_operator_input._config(markup)

    assert config.operator == "sum"
    assert config.operator_latex == r"\star"
    assert r"\(\displaystyle \star\)" in big_operator_input.render(markup, data())


def test_inferred_builtin_operator_accepts_custom_latex() -> None:
    markup = html(**{
        "index-variable": None,
        "correct-answer": "Sum(k, (k, 1, 2))",
        "operator-latex": r"\Sigma",
    })

    config = big_operator_input._config(markup, data())

    assert config.operator == "sum"
    assert config.operator_latex == r"\Sigma"


@pytest.mark.parametrize(
    "operator",
    [
        "sum",
        "product",
        "integral",
        "union",
        "intersection",
        "disjoint-union",
        "min",
        "max",
    ],
)
@pytest.mark.parametrize("limits", ["bounds", "domain"])
def test_flexible_operator_limit_forms(operator: str, limits: str) -> None:
    assert (
        big_operator_input._config(html(operator=operator, limits=limits)).limits
        == limits
    )


@pytest.mark.parametrize(
    ("operator", "limits"),
    [
        ("integral", "approach"),
        ("limit", "bounds"),
        ("limit", "domain"),
        ("sum", "approach"),
    ],
)
def test_invalid_limit_forms(operator: str, limits: str) -> None:
    with pytest.raises(ValueError, match="does not support"):
        big_operator_input.prepare(html(operator=operator, limits=limits), data())


@pytest.mark.parametrize(
    ("operator", "correct"),
    [
        ("sum", sympy.Sum(sympy.Symbol("k") ** 2, (sympy.Symbol("k"), 1, 4))),
        ("product", sympy.Product(sympy.Symbol("k"), (sympy.Symbol("k"), 1, 4))),
        ("integral", sympy.Integral(sympy.Symbol("k"), (sympy.Symbol("k"), 0, 1))),
    ],
)
def test_prepare_normalizes_binders(operator: str, correct: str) -> None:
    state = data(correct)
    big_operator_input.prepare(html(operator=operator), state)
    answer = state["correct_answers"]["op"]
    assert answer["_type"] == "operator_expression"
    assert answer["_version"] == 1
    assert answer["operator"] == operator
    assert set(answer) == {
        "_type",
        "_version",
        "operator",
        "limits",
        "index",
        "lower",
        "upper",
        "body",
    }
    assert all(
        answer[key]["_type"] == "sympy" for key in ("index", "lower", "upper", "body")
    )


def test_prepare_does_not_populate_params_with_correct_answer() -> None:
    k = sympy.Symbol("k")
    state = data(sympy.Sum(k**2, (k, 1, 4)))

    big_operator_input.prepare(html(operator="sum"), state)

    assert state["params"] == {}


def test_prepare_does_not_use_correct_answer_backup_from_params() -> None:
    k = sympy.Symbol("k")
    state = data()
    state["params"]["_pl_big_operator_input_correct_op"] = sympy.Sum(k**2, (k, 1, 4))

    big_operator_input.prepare(html(operator="sum"), state)

    assert state["correct_answers"] == {}


@pytest.mark.parametrize(
    ("operator", "correct"),
    [
        ("sum", sympy.Sum(sympy.Symbol("k") ** 2, (sympy.Symbol("k"), 1, 4))),
        ("product", sympy.Product(sympy.Symbol("k"), (sympy.Symbol("k"), 1, 4))),
        ("integral", sympy.Integral(sympy.Symbol("k"), (sympy.Symbol("k"), 0, 1))),
    ],
)
def test_prepare_decodes_serialized_binders_without_interval_parsing(
    operator: str, correct: sympy.Basic
) -> None:
    state = data(big_operator_input.psu.sympy_to_json(correct))
    big_operator_input.prepare(html(operator=operator), state)
    assert state["correct_answers"]["op"]["operator"] == operator


@pytest.mark.parametrize(
    ("operator", "function", "body"),
    [
        ("union", "Union", "{k}"),
        ("intersection", "Intersection", "{k}"),
        ("disjoint-union", "DisjointUnion", "{k}"),
        ("min", "Min", "k**2"),
        ("max", "Max", "k**2"),
    ],
)
def test_prepare_normalizes_function_domain_binders(
    operator: str, function: str, body: str
) -> None:
    state = data()
    markup = html(
        operator=operator,
        grading_method="exact",
        **{"correct-answer": f"{function}({body}, (k, {{1, 2}}))"},
    )

    big_operator_input.prepare(markup, state)

    answer = state["correct_answers"]["op"]
    values = big_operator_input._values(big_operator_input._config(markup), answer)
    assert answer["operator"] == operator
    assert values["domain"] == sympy.FiniteSet(1, 2)
    expected_body = (
        sympy.FiniteSet(sympy.Symbol("k")) if body == "{k}" else sympy.Symbol("k") ** 2
    )
    assert values["body"] == expected_body


def test_prepare_normalizes_function_bounds_binder() -> None:
    state = data()
    markup = html(
        operator="max",
        limits="bounds",
        grading_method="exact",
        **{"correct-answer": "Max(k**2, (k, 1, 4))"},
    )

    big_operator_input.prepare(markup, state)

    values = big_operator_input._values(
        big_operator_input._config(markup), state["correct_answers"]["op"]
    )
    k = sympy.Symbol("k")
    assert values == {"lower": 1, "upper": 4, "body": k**2}


@pytest.mark.parametrize(
    ("direction", "sympy_direction"),
    [("two-sided", "+-"), ("from-left", "-"), ("from-right", "+")],
)
def test_limit_directions(direction: str, sympy_direction: str) -> None:
    k = sympy.Symbol("k")
    state = data(sympy.Limit(sympy.sin(k) / k, k, 0, dir=sympy_direction))
    big_operator_input.prepare(
        html(operator="limit", **{"limit-direction": direction}), state
    )
    assert state["correct_answers"]["op"]["direction"] == direction
    rendered = big_operator_input.render(
        html(operator="limit", **{"limit-direction": direction}), state
    )
    assert 'name="op-target"' in rendered
    assert 'name="op-body"' in rendered
    assert "Approach target" in rendered
    assert "Operator body" in rendered
    assert 'name="op-direction"' in rendered
    tree = lxml.html.fragment_fromstring(rendered)
    options = tree.xpath('//select[@name="op-direction"]/option')
    select = tree.xpath('//select[@name="op-direction"]')[0]
    assert [(option.get("value"), option.text.strip()) for option in options] == [
        ("", "?"),
        ("two-sided", "±"),
        ("from-right", "+"),
        ("from-left", "-"),
    ]
    # Native constraint validation must not block Save or Save & Grade. An
    # empty selection makes a round trip and is rejected by parse() instead.
    assert "required" not in select.attrib
    assert "pl-big-operator-input__suffix" not in rendered


def test_limit_direction_input_defaults_true_and_can_be_disabled() -> None:
    enabled = big_operator_input._config(html(operator="limit"))
    disabled_markup = html(
        operator="limit",
        **{
            "limit-direction": "from-left",
            "allow-limit-direction-input": "false",
        },
    )

    assert enabled.allow_direction_input is True
    assert big_operator_input._config(disabled_markup).allow_direction_input is False
    rendered = big_operator_input.render(disabled_markup, data())
    assert 'name="op-direction"' not in rendered
    assert '-suffix"' in rendered


def test_fixed_two_sided_limit_has_no_target_suffix() -> None:
    markup = html(
        operator="limit",
        **{
            "limit-direction": "two-sided",
            "allow-limit-direction-input": "false",
        },
    )

    rendered = big_operator_input.render(markup, data())

    assert 'name="op-direction"' not in rendered
    assert 'id="pl-symbolic-input-op-target-suffix"' not in rendered


@pytest.mark.parametrize("value", ["true", "false"])
def test_limit_direction_input_schema_values_are_valid(value: str) -> None:
    markup = html(operator="limit", **{"allow-limit-direction-input": value})
    big_operator_input.pl.validate_element(
        lxml.html.fragment_fromstring(markup),
        SCHEMA_PATH,
    )
    assert big_operator_input._config(markup).allow_direction_input is (value == "true")


def test_limit_direction_input_rejects_invalid_boolean() -> None:
    markup = html(operator="limit", **{"allow-limit-direction-input": "sometimes"})
    with pytest.raises(ValueError, match='Attribute "allow-limit-direction-input"'):
        big_operator_input.pl.validate_element(
            lxml.html.fragment_fromstring(markup),
            SCHEMA_PATH,
        )
    with pytest.raises(ValueError, match="must be a boolean value"):
        big_operator_input._config(markup)


def test_limit_direction_input_rejects_non_approach_form() -> None:
    with pytest.raises(ValueError, match="can only be used"):
        big_operator_input._config(
            html(operator="sum", **{"allow-limit-direction-input": "false"})
        )


def test_limit_direction_input_preserves_raw_selection() -> None:
    rendered = big_operator_input.render(
        html(operator="limit"), data(raw={"op-direction": "from-right"})
    )
    tree = lxml.html.fragment_fromstring(rendered)
    selected = tree.xpath('//select[@name="op-direction"]/option[@selected]')
    assert [option.get("value") for option in selected] == ["from-right"]


def test_limit_direction_input_two_sided_option_has_accessible_text() -> None:
    rendered = big_operator_input.render(html(operator="limit"), data())
    tree = lxml.html.fragment_fromstring(rendered)
    options = tree.xpath('//select[@name="op-direction"]/option[@value="two-sided"]')

    assert len(options) == 1
    assert options[0].text_content().strip() == "±"


def test_limit_direction_input_is_a_red_single_character_monospace_control() -> None:
    css = CSS_PATH.read_text()
    assert "width: 1ch" in css
    assert "font-family: ui-monospace" in css
    assert "color: var(--bs-danger)" in css
    assert "background-image: none" in css
    direction_rule = css.split(".pl-big-operator-input__direction-input {")[1].split(
        "}", 1
    )[0]
    assert "flex-direction: column" in direction_rule


@pytest.mark.parametrize(
    ("submitted_direction", "badge_class", "icon_class", "label"),
    [
        ("from-right", "text-bg-success", "fa-check", "Correct"),
        ("from-left", "text-bg-danger", "fa-times", "Incorrect"),
    ],
)
def test_limit_direction_input_uses_binary_score_badge(
    submitted_direction: str, badge_class: str, icon_class: str, label: str
) -> None:
    markup = html(
        operator="limit",
        **{
            "grading-method": "component",
            "correct-answer": "Limit(1/k, (k, 0, '+'))",
        },
    )
    state = data(
        raw={
            "op-target": "0",
            "op-body": "1/k",
            "op-direction": submitted_direction,
        }
    )
    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)

    rendered = big_operator_input.render(markup, state)
    tree = lxml.html.fragment_fromstring(rendered)
    badge = tree.xpath(
        '//span[contains(@class, "pl-big-operator-input__direction-score")]/span'
    )[0]

    assert badge_class in badge.get("class")
    assert icon_class in badge.xpath("./i")[0].get("class")
    assert badge.get("aria-label") == label
    assert "%" not in badge.text_content()


@pytest.mark.parametrize("direction", ["two-sided", "from-left", "from-right"])
def test_limit_direction_input_parses_into_canonical_answer(direction: str) -> None:
    state = data(
        raw={
            "op-target": "0",
            "op-body": "1/k",
            "op-direction": direction,
        }
    )
    big_operator_input.parse(html(operator="limit"), state)
    assert state["submitted_answers"]["op"]["direction"] == direction
    assert state["submitted_answers"]["op-direction"] == direction


@pytest.mark.parametrize("direction", ["", "sideways"])
def test_limit_direction_input_rejects_missing_or_invalid_selection(
    direction: str,
) -> None:
    state = data(
        raw={
            "op-target": "0",
            "op-body": "1/k",
            "op-direction": direction,
        }
    )
    big_operator_input.parse(html(operator="limit"), state)
    assert state["submitted_answers"]["op"] is None
    assert state["format_errors"]["op-direction"] == "Select a valid limit direction."
    rendered = big_operator_input.render(html(operator="limit"), state)
    assert "is-invalid" in rendered
    assert "Select a valid limit direction." in rendered


def test_limit_direction_input_clears_stale_format_error_after_valid_selection() -> (
    None
):
    markup = html(operator="limit")
    state = data(
        raw={
            "op-target": "0",
            "op-body": "1/k",
            "op-direction": "sideways",
        }
    )
    big_operator_input.parse(markup, state)
    assert "op-direction" in state["format_errors"]

    state["raw_submitted_answers"]["op-direction"] = "from-right"
    big_operator_input.parse(markup, state)

    assert "op-direction" not in state.get("format_errors", {})
    assert "is-invalid" not in big_operator_input.render(markup, state)


def test_limit_direction_input_honors_allowed_blank_limits() -> None:
    state = data(raw={"op-target": "0", "op-body": "1/k", "op-direction": ""})
    big_operator_input.parse(
        html(operator="limit", **{"allowed-blank": "limits"}), state
    )
    assert state["submitted_answers"]["op"] == ""
    assert "op-direction" not in state.get("format_errors", {})


def test_limit_direction_input_clears_stale_submission_when_blank_is_allowed() -> None:
    markup = html(operator="limit", **{"allowed-blank": "limits"})
    state = data(
        raw={
            "op-target": "0",
            "op-body": "1/k",
            "op-direction": "from-right",
        }
    )
    big_operator_input.parse(markup, state)
    assert state["submitted_answers"]["op-direction"] == "from-right"

    state["raw_submitted_answers"]["op-direction"] = ""
    big_operator_input.parse(markup, state)

    assert state["submitted_answers"]["op"] == ""
    assert state["submitted_answers"]["op-direction"] == ""


def test_fixed_limit_direction_is_injected_without_raw_field() -> None:
    markup = html(
        operator="limit",
        **{
            "limit-direction": "from-left",
            "allow-limit-direction-input": "false",
        },
    )
    state = data(raw={"op-target": "0", "op-body": "1/k"})
    big_operator_input.parse(markup, state)
    assert state["submitted_answers"]["op"]["direction"] == "from-left"
    assert "op-direction" not in state["submitted_answers"]


@pytest.mark.parametrize(
    ("grading", "submitted_direction", "expected"),
    [
        ("exact", "from-right", 1.0),
        ("exact", "from-left", 0.0),
        ("component", "from-right", 1.0),
        ("component", "from-left", 0.8),
        ("equivalent", "from-right", 1.0),
        ("equivalent", "from-left", 0.0),
    ],
)
def test_student_limit_direction_participates_in_grading(
    grading: str, submitted_direction: str, expected: float
) -> None:
    markup = html(**{
        "correct-answer": "Limit(1/k, (k, 0, '+'))",
        "grading-method": grading,
    })
    state = data(
        raw={
            "op-target": "0",
            "op-body": "1/k",
            "op-direction": submitted_direction,
        }
    )
    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)
    assert state["partial_scores"]["op"]["score"] == pytest.approx(expected)


def test_direction_component_feedback_is_rendered() -> None:
    markup = html(**{
        "correct-answer": "Limit(1/k, (k, 0, '+'))",
        "grading-method": "component",
    })
    state = data(
        raw={
            "op-target": "0",
            "op-body": "1/k",
            "op-direction": "from-left",
        }
    )
    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)
    rendered = big_operator_input.render(markup, state)
    assert 'name="op-direction"' in rendered
    assert "0%" in rendered


def test_submission_and_answer_panels_use_their_own_limit_directions() -> None:
    markup = html(**{"correct-answer": "Limit(1/k, (k, 0, '+'))"})
    state = data(
        raw={
            "op-target": "0",
            "op-body": "1/k",
            "op-direction": "from-left",
        }
    )
    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    state["panel"] = "submission"
    assert r"0^-" in big_operator_input.render(markup, state)
    state["panel"] = "answer"
    assert r"0^+" in big_operator_input.render(markup, state)


def canonical(operator: str = "union", limits: str = "domain") -> dict[str, Any]:
    k = sympy.Symbol("k")
    return {
        "_type": "operator_expression",
        "_version": 1,
        "operator": operator,
        "limits": limits,
        "index": big_operator_input._json(k),
        "domain": big_operator_input._json(sympy.FiniteSet(1, 2)),
        "body": big_operator_input._json(sympy.FiniteSet(k)),
    }


def test_canonical_custom_answer_infers_operator_and_limits() -> None:
    answer = canonical(operator="custom")
    answer["operator_latex"] = r"\star"
    state = data(answer)
    markup = html(**{
        "index-variable": None,
        "operator-latex": r"\star",
        "grading-method": "component",
    })

    big_operator_input.prepare(markup, state)

    config = big_operator_input._config(markup, state)
    assert config.operator == "custom"
    assert config.limits == "domain"
    assert config.index == "k"


def test_domain_structured_answer_and_rendering() -> None:
    state = data(canonical())
    big_operator_input.prepare(html(operator="union"), state)
    rendered = big_operator_input.render(html(operator="union"), state)
    assert r"\bigcup" in rendered
    assert 'name="op-domain"' in rendered
    assert 'name="op-body"' in rendered
    assert 'name="op-start"' not in rendered
    assert "Index domain" in rendered
    assert "Big operator expression input" in rendered


def test_prepare_parses_basic_component_correct_answer_strings() -> None:
    state = data()
    markup = html(
        operator="sum",
        variables="n",
        **{
            "correct-answer-start": "1",
            "correct-answer-end": "n",
            "correct-answer-body": "k^2 + sin(n)",
        },
    )

    big_operator_input.prepare(markup, state)

    answer = state["correct_answers"]["op"]
    values = big_operator_input._values(big_operator_input._config(markup), answer)
    k, n = sympy.symbols("k n")
    assert values == {"lower": 1, "upper": n, "body": k**2 + sympy.sin(n)}


def test_prepare_parses_set_component_correct_answer_strings() -> None:
    state = data()
    markup = html(
        operator="union",
        **{"correct-answer-domain": "{1, 2}", "correct-answer-body": "{k}"},
    )

    big_operator_input.prepare(markup, state)

    answer = state["correct_answers"]["op"]
    values = big_operator_input._values(big_operator_input._config(markup), answer)
    k = sympy.Symbol("k")
    assert values == {
        "domain": sympy.FiniteSet(1, 2),
        "body": sympy.FiniteSet(k),
    }


def test_prepare_accepts_symbolic_integral_domain() -> None:
    state = data(panel="answer")
    markup = html(
        operator="integral",
        limits="domain",
        variables="Gamma",
        **{"correct-answer-domain": "Gamma", "correct-answer-body": "k"},
    )

    big_operator_input.prepare(markup, state)
    rendered = big_operator_input.render(markup, state)

    values = big_operator_input._values(
        big_operator_input._config(markup), state["correct_answers"]["op"]
    )
    assert values == {
        "domain": sympy.Symbol("Gamma"),
        "body": sympy.Symbol("k"),
    }
    assert r"\Gamma" in rendered


def test_prepare_component_correct_answer_requires_every_visible_attribute() -> None:
    with pytest.raises(ValueError, match="missing correct-answer-end"):
        big_operator_input.prepare(
            html(
                operator="sum",
                **{"correct-answer-start": "1", "correct-answer-body": "k"},
            ),
            data(),
        )


def test_prepare_component_correct_answer_enforces_set_fields() -> None:
    with pytest.raises(ValueError, match='component "domain" must be a set'):
        big_operator_input.prepare(
            html(
                operator="union",
                **{"correct-answer-domain": "1", "correct-answer-body": "{k}"},
            ),
            data(),
        )


@pytest.mark.parametrize(
    ("correct", "component"),
    [
        ("Union(k + 1, (k, {1, 2}))", "body"),
        ("Union({k}, (k, 1))", "domain"),
    ],
)
def _test_whole_set_correct_answer_enforces_set_fields(
    correct: str, component: str
) -> None:
    with pytest.raises(ValueError, match=rf'component "{component}" must be a set'):
        big_operator_input.prepare(
            html(operator="union", **{"correct-answer": correct}), data()
        )


def _test_structured_correct_answer_rejects_disallowed_complex_value() -> None:
    config = big_operator_input._config(html(operator="sum"))
    answer = big_operator_input._canonical(
        config, {"lower": sympy.Integer(1), "upper": sympy.Integer(2), "body": sympy.I}
    )
    with pytest.raises(ValueError, match="complex"):
        big_operator_input.prepare(
            html(operator="sum", **{"allow-complex": "false"}), data(answer)
        )


def _test_structured_correct_answer_rejects_undeclared_symbol() -> None:
    config = big_operator_input._config(html(operator="sum"))
    answer = big_operator_input._canonical(
        config,
        {
            "lower": sympy.Integer(1),
            "upper": sympy.Integer(2),
            "body": sympy.Symbol("undeclared"),
        },
    )
    with pytest.raises(ValueError, match="undeclared"):
        big_operator_input.prepare(html(operator="sum"), data(answer))


def test_prepare_rejects_irrelevant_component_correct_answer_attribute() -> None:
    with pytest.raises(ValueError, match="cannot be used"):
        big_operator_input.prepare(
            html(operator="sum", **{"correct-answer-domain": "{1}"}), data()
        )


def test_prepare_rejects_combined_whole_and_component_correct_answers() -> None:
    with pytest.raises(ValueError, match="either"):
        big_operator_input.prepare(
            html(
                operator="sum",
                **{
                    "correct-answer": "Sum(k, (k, 1, 2))",
                    "correct-answer-start": "1",
                    "correct-answer-end": "2",
                    "correct-answer-body": "k",
                },
            ),
            data(),
        )


@pytest.mark.parametrize("operator", ["min", "max"])
def test_min_max_correct_answer_rendering(operator: str) -> None:
    answer = canonical(operator=operator)
    answer["body"] = big_operator_input._json(sympy.Symbol("k") ** 2)
    state = data(answer, panel="answer")

    rendered = big_operator_input.render(html(operator=operator), state)

    assert rf"\{operator}_{{k\in \left\{{1, 2\right\}}}} k^{{2}}" in rendered
    assert ">?</span>" not in rendered
    assert "badge" not in rendered


@pytest.mark.parametrize("operator", ["min", "max"])
def test_min_max_answer_rendering_uses_prepared_answer(operator: str) -> None:
    answer = canonical(operator=operator)
    answer["body"] = big_operator_input._json(sympy.Symbol("k") ** 2)
    state = data(answer)
    markup = html(operator=operator)
    big_operator_input.prepare(markup, state)
    state["panel"] = "answer"

    rendered = big_operator_input.render(markup, state)

    assert rf"\{operator}_{{k\in \left\{{1, 2\right\}}}} k^{{2}}" in rendered
    assert "?" not in rendered
    assert "badge" not in rendered


@pytest.mark.parametrize("operator", ["min", "max"])
def test_min_max_answer_panel_never_renders_question_mark_fallback(
    operator: str,
) -> None:
    rendered = big_operator_input.render(html(operator=operator), data(panel="answer"))

    assert "?" not in rendered


@pytest.mark.parametrize(
    "operator", ["union", "intersection", "disjoint-union", "min", "max"]
)
def test_variadic_operators_require_structured_answers(operator: str) -> None:
    with pytest.raises(TypeError, match="canonical structured"):
        big_operator_input.prepare(html(operator=operator), data(sympy.Integer(1)))


@pytest.mark.parametrize(
    "mutation",
    [
        lambda x: x.pop("body"),
        lambda x: x.update(_version=2),
        lambda x: x.update(operator="intersection"),
        lambda x: x.update(index={"_type": "sympy", "_value": "j"}),
        lambda x: x.update(extra=1),
    ],
)
def test_rejects_malformed_structured_answers(
    mutation: Callable[[dict[str, Any]], None],
) -> None:
    answer = canonical()
    mutation(answer)
    with pytest.raises(ValueError, match=r"well-formed|does not match"):
        big_operator_input.prepare(html(operator="union"), data(answer))


def test_parse_only_relevant_fields_and_allows_index_in_body() -> None:
    state = data(
        raw={"op-domain": "FiniteSet(1,2)", "op-body": "FiniteSet(k)", "op-start": "99"}
    )
    big_operator_input.parse(html(operator="union"), state)
    answer = state["submitted_answers"]["op"]
    assert answer["limits"] == "domain"
    assert "domain" in answer
    assert "lower" not in answer
    assert "op-start" not in state["submitted_answers"]


def _test_component_parse_clears_stale_format_error_after_valid_reparse() -> None:
    markup = html(operator="sum")
    state = data(raw={"op-start": "bad@", "op-end": "2", "op-body": "k"})
    big_operator_input.parse(markup, state)
    assert "op-start" in state["format_errors"]

    state["raw_submitted_answers"]["op-start"] = "1"
    big_operator_input.parse(markup, state)

    assert "op-start" not in state["format_errors"]
    assert state["submitted_answers"]["op"] is not None


def _test_invalid_reparse_replaces_previous_partial_score_with_zero() -> None:
    markup = html(operator="sum", **{"correct-answer": "Sum(k, (k, 1, 2))"})
    state = data(raw={"op-start": "1", "op-end": "2", "op-body": "k"})
    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)
    assert state["partial_scores"]["op"]["score"] == 1

    state["raw_submitted_answers"]["op-body"] = "bad@"
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)

    assert state["partial_scores"]["op"] == {"score": 0.0, "weight": 1}


def _test_component_score_badge_uses_grading_equivalence() -> None:
    markup = html(
        operator="sum",
        **{
            "grading-method": "component",
            "correct-answer-start": "1",
            "correct-answer-end": "2",
            "correct-answer-body": "(k+1)^2",
        },
    )
    state = data(raw={"op-start": "1", "op-end": "2", "op-body": "k^2+2*k+1"})
    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)

    assert state["partial_scores"]["op"]["score"] == 1
    assert (
        big_operator_input._component_scores(
            big_operator_input._config(markup, state), state
        )["body"]
        == 1
    )


@pytest.mark.parametrize("operator", ["sum", "product", "integral", "union", "min"])
def test_domain_fields_reject_non_sets_at_parse_time(operator: str) -> None:
    state = data(raw={"op-domain": "1", "op-body": "FiniteSet(k)"})
    big_operator_input.parse(html(operator=operator, limits="domain"), state)

    assert state["submitted_answers"]["op"] is None
    assert state["format_errors"]["op-domain"] == "This field must be a set."


@pytest.mark.parametrize("operator", ["union", "intersection", "disjoint-union"])
def test_set_combinator_bodies_reject_non_sets_at_parse_time(operator: str) -> None:
    state = data(raw={"op-domain": "FiniteSet(1, 2)", "op-body": "k + 1"})
    big_operator_input.parse(html(operator=operator), state)

    assert state["submitted_answers"]["op"] is None
    assert state["format_errors"]["op-body"] == "This field must be a set."


def test_bare_variables_are_accepted_as_symbolic_sets() -> None:
    integral = data(raw={"op-domain": "Gamma", "op-body": "z"})
    integral_markup = html(
        operator="integral",
        limits="domain",
        **{"index-variable": "z", "variables": "Gamma"},
    )
    big_operator_input.parse(integral_markup, integral)

    union = data(raw={"op-domain": "I", "op-body": "A"})
    union_markup = html(operator="union", variables="I,A")
    big_operator_input.parse(union_markup, union)

    assert integral["submitted_answers"]["op"] is not None
    assert union["submitted_answers"]["op"] is not None
    assert not integral.get("format_errors")
    assert not union.get("format_errors")


def test_allow_complex_is_delegated_to_symbolic_inputs() -> None:
    markup = html(operator="sum", variables="j", **{"allow-complex": "false"})
    state = data(raw={"op-start": "1", "op-end": "4", "op-body": "j^2"})

    big_operator_input.parse(markup, state)

    assert state["submitted_answers"]["op"] is not None
    assert not state.get("format_errors")
    assert big_operator_input._config(markup).allow_complex is False


def test_custom_functions_are_used_to_parse_component_correct_answers() -> None:
    markup = html(
        operator="custom",
        limits="approach",
        **{
            "operator-latex": r"\operatorname{eval}",
            "custom-functions": "f",
            "grading-method": "component",
            "correct-answer-target": "0",
            "correct-answer-body": "f(k)",
        },
    )
    state = data()

    big_operator_input.pl.validate_element(
        lxml.html.fragment_fromstring(markup),
        SCHEMA_PATH,
    )
    big_operator_input.prepare(markup, state)

    answer = state["correct_answers"]["op"]
    assert big_operator_input._config(markup).custom_functions == ("f",)
    assert big_operator_input._decode(answer["body"]) == sympy.Function("f")(
        sympy.Symbol("k")
    )


def test_custom_functions_are_delegated_to_student_body_input() -> None:
    markup = html(operator="sum", **{"custom-functions": "f"})
    state = data(raw={"op-start": "1", "op-end": "4", "op-body": "f(k)"})

    big_operator_input.parse(markup, state)

    answer = state["submitted_answers"]["op"]
    assert not state.get("format_errors")
    assert big_operator_input._decode(answer["body"]) == sympy.Function("f")(
        sympy.Symbol("k")
    )


@pytest.mark.parametrize(
    ("invalid_field", "valid_field"),
    [("op-domain", "op-body"), ("op-body", "op-domain")],
)
def test_parse_errors_are_rendered_with_their_fields(
    invalid_field: str, valid_field: str
) -> None:
    raw = {"op-domain": "FiniteSet(1, 2)", "op-body": "FiniteSet(k)"}
    raw[invalid_field] = "1"
    state = data(raw=raw)
    markup = html(operator="union")
    big_operator_input.parse(markup, state)

    rendered = big_operator_input.render(markup, state)
    assert f'id="symbolic-input-{invalid_field}"' in rendered
    assert 'aria-invalid="true"' in rendered
    assert "Invalid" in rendered
    assert "More info…" in rendered
    assert "This field must be a set." in rendered
    valid_field_markup = rendered[
        rendered.index(f'id="symbolic-input-{valid_field}"') :
    ]
    assert 'aria-invalid="true"' not in valid_field_markup.split("</math-field>", 1)[0]


def test_partially_blank_submission_has_a_descriptive_field_error() -> None:
    state = data(raw={"op-domain": "FiniteSet(1, 2)", "op-body": ""})
    markup = html(operator="union")
    big_operator_input.parse(markup, state)

    assert state["format_errors"]["op-body"] == "No submitted answer."
    rendered = big_operator_input.render(markup, state)
    assert "No submitted answer." in rendered
    assert 'id="symbolic-input-op-body"' in rendered
    assert 'aria-invalid="true"' in rendered


def test_wholly_blank_required_submission_marks_every_field_invalid() -> None:
    state = data(raw={"op-start": "", "op-end": "", "op-body": ""})
    markup = html(operator="sum")

    big_operator_input.parse(markup, state)

    assert state["submitted_answers"]["op"] is None
    assert state["format_errors"] == {
        "op-start": "No submitted answer.",
        "op-end": "No submitted answer.",
        "op-body": "No submitted answer.",
    }
    rendered = big_operator_input.render(markup, state)
    assert rendered.count('aria-invalid="true"') == 3
    assert rendered.count("No submitted answer.") == 3


def test_initial_latex_is_stored_outside_math_fields() -> None:
    state = data(
        raw={
            "op-domain-latex": r"\emptyset",
            "op-body-latex": r"\emptyset",
        }
    )

    document = lxml.html.fragment_fromstring(
        big_operator_input.render(html(operator="union"), state)
    )

    for name in ("op-domain", "op-body"):
        math_field = document.get_element_by_id(f"symbolic-input-{name}")
        latex_input = document.get_element_by_id(f"symbolic-input-latex-{name}")
        assert (math_field.text or "").strip() == ""
        assert latex_input.get("value") == r"\emptyset"


def test_question_fields_are_rendered_by_symbolic_input() -> None:
    rendered = big_operator_input.render(html(operator="sum"), data())

    assert rendered.count("pl-symbolic-input") >= 3
    assert "window.PLSymbolicInput" in rendered
    assert "window.PLBigOperatorInput" not in rendered
    assert 'aria-label="Lower bound"' in rendered
    assert 'aria-label="Upper bound"' in rendered
    assert 'aria-label="Operator body"' in rendered
    assert rendered.count('title="Symbolic"') == 1


@pytest.mark.parametrize(
    ("operator", "expected_limit_size"),
    [("sum", 7), ("union", 10), ("limit", 10)],
)
def test_symbolic_input_width_defaults_preserve_existing_layout(
    operator: str, expected_limit_size: int
) -> None:
    config = big_operator_input._config(html(operator=operator))
    rendered = big_operator_input.render(html(operator=operator), data())

    assert config.body_size == 16
    assert config.limit_size == expected_limit_size
    assert "--pl-big-operator-input-body-size: 16ch" in rendered
    assert f"--pl-big-operator-input-limit-size: {expected_limit_size}ch" in rendered


def test_custom_widths_are_forwarded_to_rendered_symbolic_inputs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fields: list[tuple[str, int]] = []
    original_render = big_operator_input.symbolic_input_adapter.render

    def capture_render(
        state: QuestionData,
        *,
        name: str,
        variables: tuple[str, ...],
        custom_functions: tuple[str, ...],
        aria_label: str,
        size: int,
        allowed_types: set[str],
        allow_complex: bool,
        show_help_text: bool = False,
        show_score: bool = False,
        prefix: str | None = None,
        suffix: str | None = None,
        score: float | None = None,
    ) -> str:
        fields.append((name, size))
        return original_render(
            state,
            name=name,
            variables=variables,
            custom_functions=custom_functions,
            aria_label=aria_label,
            size=size,
            allowed_types=allowed_types,
            allow_complex=allow_complex,
            show_help_text=show_help_text,
            show_score=show_score,
            prefix=prefix,
            suffix=suffix,
            score=score,
        )

    monkeypatch.setattr(
        big_operator_input.symbolic_input_adapter, "render", capture_render
    )
    markup = html(operator="sum", **{"body-size": "24", "limit-size": "9"})
    rendered = big_operator_input.render(markup, data())

    assert dict(fields) == {"op-start": 9, "op-end": 9, "op-body": 24}
    assert "--pl-big-operator-input-body-size: 24ch" in rendered
    assert "--pl-big-operator-input-limit-size: 9ch" in rendered


@pytest.mark.parametrize(
    ("operator", "expected"),
    [
        (
            "sum",
            {"op-start": "expression", "op-end": "expression", "op-body": "expression"},
        ),
        ("union", {"op-domain": "all", "op-body": "all"}),
    ],
)
def test_allowed_types_are_forwarded_to_rendered_symbolic_inputs(
    monkeypatch: pytest.MonkeyPatch,
    operator: str,
    expected: dict[str, str],
) -> None:
    fields: list[tuple[str, set[str]]] = []
    original_render = big_operator_input.symbolic_input_adapter.render

    def capture_render(
        state: QuestionData,
        *,
        name: str,
        variables: tuple[str, ...],
        custom_functions: tuple[str, ...],
        aria_label: str,
        size: int,
        allowed_types: set[str],
        allow_complex: bool,
        show_help_text: bool = False,
        show_score: bool = False,
        prefix: str | None = None,
        suffix: str | None = None,
        score: float | None = None,
    ) -> str:
        fields.append((name, allowed_types))
        return original_render(
            state,
            name=name,
            variables=variables,
            custom_functions=custom_functions,
            aria_label=aria_label,
            size=size,
            allowed_types=allowed_types,
            allow_complex=allow_complex,
            show_help_text=show_help_text,
            show_score=show_score,
            prefix=prefix,
            suffix=suffix,
            score=score,
        )

    monkeypatch.setattr(
        big_operator_input.symbolic_input_adapter, "render", capture_render
    )
    big_operator_input.render(html(operator=operator), data())
    assert {name: next(iter(allowed)) for name, allowed in fields} == expected


@pytest.mark.parametrize("attribute", ["body-size", "limit-size"])
def test_symbolic_input_width_schema_accepts_integers(attribute: str) -> None:
    markup = html(operator="sum", **{attribute: "12"})
    big_operator_input.pl.validate_element(
        lxml.html.fragment_fromstring(markup),
        SCHEMA_PATH,
    )


@pytest.mark.parametrize("attribute", ["body-size", "limit-size"])
def test_symbolic_input_width_schema_rejects_non_integers(attribute: str) -> None:
    markup = html(operator="sum", **{attribute: "wide"})
    with pytest.raises(ValueError, match=f'Attribute "{attribute}".*integer'):
        big_operator_input.pl.validate_element(
            lxml.html.fragment_fromstring(markup),
            SCHEMA_PATH,
        )


@pytest.mark.parametrize("attribute", ["body-size", "limit-size"])
@pytest.mark.parametrize("value", ["0", "-1"])
def test_symbolic_input_widths_must_be_positive(attribute: str, value: str) -> None:
    with pytest.raises(ValueError, match=f'Attribute "{attribute}" must be positive'):
        big_operator_input._config(html(operator="sum", **{attribute: value}))


def test_symbolic_input_width_css_uses_wrapper_properties() -> None:
    css = CSS_PATH.read_text()

    assert "min-width: var(--pl-big-operator-input-body-size)" in css
    assert css.count("min-width: var(--pl-big-operator-input-limit-size)") == 2


def test_body_help_text_can_be_disabled() -> None:
    rendered = big_operator_input.render(
        html(operator="sum", **{"show-help-text": "false"}), data()
    )

    assert 'title="Symbolic"' not in rendered

    document = lxml.html.fragment_fromstring(rendered)
    body = document.get_element_by_id("symbolic-input-op-body")
    assert body.getnext() is None


def test_body_right_edge_is_rounded_only_when_it_has_no_trailing_control() -> None:
    css = CSS_PATH.read_text()

    assert ".pl-big-operator-input__body math-field {" in css
    assert "border-radius: var(--bs-border-radius) !important" not in css
    assert ".pl-big-operator-input__body .input-group > math-field:last-child" in css
    assert "border-top-right-radius: var(--bs-border-radius) !important" in css
    assert "border-bottom-right-radius: var(--bs-border-radius) !important" in css


def test_parse_does_not_add_render_or_grade_phase_data_keys() -> None:
    state: dict[str, Any] = {
        "params": {},
        "correct_answers": {},
        "submitted_answers": {
            "op-start": "1",
            "op-end": "4",
            "op-body": "k^2",
        },
        "feedback": {},
        "format_errors": {},
        "raw_submitted_answers": {
            "op-start": "1",
            "op-end": "4",
            "op-body": "k^2",
        },
        "variant_seed": 1,
        "options": {},
        "preferences": {},
        "gradable": True,
    }

    big_operator_input.parse(html(operator="sum"), state)

    assert state["submitted_answers"]["op"]["_type"] == "operator_expression"
    assert "partial_scores" not in state
    assert "panel" not in state


def test_component_grading_weights_body() -> None:
    k = sympy.Symbol("k")
    correct = sympy.Sum(k**2, (k, 1, 4))
    state = data(correct, {"op-start": "1", "op-end": "5", "op-body": "k^2"})
    markup = html(
        operator="sum",
        **{"grading-method": "component", "body-relative-weight": "2"},
    )
    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)
    assert state["partial_scores"]["op"]["score"] == pytest.approx(0.75)


def test_component_grading_uses_equivalence_for_each_field() -> None:
    k = sympy.Symbol("k")
    correct = sympy.Sum(2 * k, (k, 2, 4))
    state = data(
        correct,
        {"op-start": "1 + 1", "op-end": "8 / 2", "op-body": "k + k"},
    )
    markup = html(operator="sum", **{"grading-method": "component"})

    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)

    assert state["partial_scores"]["op"] == {"score": 1.0, "weight": 1}


def test_correct_element_test_submission_round_trips_through_grading() -> None:
    markup = html(
        operator="sum",
        **{"correct-answer": "Sum(k**2, (k, 1, 4))"},
    )
    state = data()
    big_operator_input.prepare(markup, state)
    state.update(
        test_type="correct",
        raw_submitted_answers={},
        partial_scores={},
        format_errors={},
    )

    big_operator_input.test(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)

    assert state["raw_submitted_answers"] == {
        "op-start": "1",
        "op-end": "4",
        "op-body": "k**2",
    }
    assert state["partial_scores"]["op"] == {"score": 1.0, "weight": 1}


def test_equivalent_grading_avoids_evaluating_structurally_equivalent_sums(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    k = sympy.Symbol("k")
    expanded_body = sympy.expand((k + 1) ** 8)
    submitted = sympy.Sum(expanded_body, (k, 1, 100))
    correct = sympy.Sum((k + 1) ** 8, (k, 1, 100))

    def unexpected_doit(self: sympy.Sum, **hints: Any) -> sympy.Basic:
        raise AssertionError("equivalence should be established before calling doit()")

    monkeypatch.setattr(sympy.Sum, "doit", unexpected_doit)

    assert big_operator_input._expressions_equivalent(submitted, correct)


def test_component_grading_shows_icon_only_badges_on_symbolic_inputs() -> None:
    k = sympy.Symbol("k")
    markup = html(operator="sum", **{"grading-method": "component"})
    state = data(
        sympy.Sum(k**2, (k, 1, 4)),
        {"op-start": "1", "op-end": "5", "op-body": "k^2"},
    )
    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)

    rendered = big_operator_input.render(markup, state)

    assert rendered.count("fa-check") == 2
    assert rendered.count("fa-times") == 1
    assert "100%</span>" not in rendered
    assert "0%</span>" not in rendered


@pytest.mark.parametrize("grading", ["exact", "equivalent"])
def _test_exact_and_equivalent_grading(grading: str) -> None:
    k = sympy.Symbol("k")
    state = data(
        sympy.Sum(k**2, (k, 1, 4)), {"op-start": "1", "op-end": "4", "op-body": "k^2"}
    )
    markup = html(operator="sum", **{"grading-method": grading})
    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)
    assert state["partial_scores"]["op"] == {"score": 1.0, "weight": 1}


def _test_equivalent_grading_domain_sum() -> None:
    markup = html(**{
        "index-variable": None,
        "correct-answer": "Sum(k, (k, {1, 2}))",
    })
    state = data(raw={"op-domain": "{1, 2}", "op-body": "k"})

    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)

    assert state["partial_scores"]["op"] == {"score": 1.0, "weight": 1}


def test_symbolic_domain_named_like_sympy_function_renders_as_a_symbol() -> None:
    markup = html(**{
        "index-variable": None,
        "correct-answer": "Sum(k**-2, (k, N))",
        "variables": "N",
        "grading-method": "exact",
    })
    state = data(raw={"op-domain": "N", "op-body": "k^-2"})

    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)
    state["panel"] = "answer"
    rendered = big_operator_input.render(markup, state)

    assert r"\sum_{k\in N} \frac{1}{k^{2}}" in rendered
    assert "&lt;function N at" not in rendered
    assert state["partial_scores"]["op"] == {"score": 1.0, "weight": 1}


def test_allowed_blank_and_independent_parse_errors() -> None:
    blank = data(raw={"op-start": "", "op-end": "", "op-body": ""})
    big_operator_input.parse(html(operator="sum", **{"allowed-blank": "all"}), blank)
    assert blank["submitted_answers"]["op"] == ""
    broken = data(raw={"op-start": "1", "op-end": "@", "op-body": "k"})
    big_operator_input.parse(html(operator="sum"), broken)
    assert "op-start" in broken["submitted_answers"]
    assert "op-body" in broken["submitted_answers"]
    assert "op-end" in broken["format_errors"]
    assert broken["submitted_answers"]["op"] is None


def test_allowed_blank_submission_is_gradable_as_incorrect() -> None:
    k = sympy.Symbol("k")
    state = data(sympy.Sum(k**2, (k, 1, 4)))
    markup = html(operator="sum", **{"allowed-blank": "all"})

    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)

    assert not state.get("format_errors")
    assert state["submitted_answers"]["op"] == ""
    assert state["partial_scores"]["op"] == {"score": 0.0, "weight": 1}


def test_ungraded_submission_is_parsed_but_not_scored() -> None:
    state = data(raw={"op-start": "1", "op-end": "4", "op-body": "k^2"})
    markup = html(operator="sum")

    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)

    assert "op" not in state["correct_answers"]
    assert state["submitted_answers"]["op"]["_type"] == "operator_expression"
    assert state.get("partial_scores", {}) == {}


def test_ungraded_submission_panel_shows_response_without_score_badge() -> None:
    markup = html(operator="sum")
    state = data(raw={"op-start": "1", "op-end": "4", "op-body": "k^2"})
    big_operator_input.parse(markup, state)
    state["panel"] = "submission"

    rendered = big_operator_input.render(markup, state)

    assert r"\sum_{k=1}^{4} k^{2}" in rendered
    assert "badge" not in rendered


def test_ungraded_answer_panel_is_empty() -> None:
    assert big_operator_input.render(html(operator="sum"), data(panel="answer")) == ""


def test_ungraded_blank_submission_still_requires_allowed_blank() -> None:
    state = data(raw={"op-start": "", "op-end": "", "op-body": ""})

    big_operator_input.parse(html(operator="sum"), state)

    assert state["submitted_answers"]["op"] is None
    assert set(state["format_errors"]) == {"op-start", "op-end", "op-body"}


@pytest.mark.parametrize(
    ("allowed_blank", "raw", "blank_field"),
    [
        ("limits", {"op-start": "1", "op-end": "", "op-body": "k^2"}, "op-end"),
        ("limits", {"op-start": "", "op-end": "4", "op-body": "k^2"}, "op-start"),
        ("limits", {"op-start": "", "op-end": "", "op-body": "k^2"}, "op-start"),
        ("body", {"op-start": "1", "op-end": "4", "op-body": ""}, "op-body"),
        ("all", {"op-start": "", "op-end": "4", "op-body": ""}, "op-body"),
        ("all", {"op-start": "4", "op-end": "4", "op-body": ""}, "op-body"),
        ("all", {"op-start": "4", "op-end": "", "op-body": ""}, "op-body"),
        ("all", {"op-start": "", "op-end": "", "op-body": ""}, "op-body"),
    ],
)
def test_allowed_blank_modes_accept_the_selected_fields(
    allowed_blank: str, raw: dict[str, str], blank_field: str
) -> None:
    state = data(raw=raw)

    big_operator_input.parse(
        html(operator="sum", **{"allowed-blank": allowed_blank}), state
    )

    assert state["submitted_answers"]["op"] == ""
    assert state["submitted_answers"][blank_field] == ""
    assert not state.get("format_errors")


@pytest.mark.parametrize(
    ("allowed_blank", "raw", "required_field"),
    [
        ("none", {"op-start": "", "op-end": "4", "op-body": "k^2"}, "op-start"),
        ("limits", {"op-start": "1", "op-end": "4", "op-body": ""}, "op-body"),
        ("body", {"op-start": "", "op-end": "4", "op-body": "k^2"}, "op-start"),
    ],
)
def test_allowed_blank_modes_reject_unselected_fields(
    allowed_blank: str, raw: dict[str, str], required_field: str
) -> None:
    state = data(raw=raw)

    big_operator_input.parse(
        html(operator="sum", **{"allowed-blank": allowed_blank}), state
    )

    assert state["submitted_answers"]["op"] is None
    assert state["format_errors"][required_field] == "No submitted answer."


def test_invalid_allowed_blank_value_is_rejected() -> None:
    with pytest.raises(ValueError, match='Attribute "allowed-blank"'):
        big_operator_input._config(html(operator="sum", **{"allowed-blank": "true"}))


@pytest.mark.parametrize(
    ("limits", "raw", "expected"),
    [
        (
            "bounds",
            {"op-start": "1", "op-end": "4", "op-body": "k^2"},
            r"\mathop{\mathbb{E}}\limits_{k=1}^{4} k^{2}",
        ),
        (
            "domain",
            {"op-domain": "{1, 2}", "op-body": "k^2"},
            r"\mathop{\mathbb{E}}\limits_{k\in \left\{1, 2\right\}} k^{2}",
        ),
    ],
)
def test_custom_operator_is_self_describing_ungraded_input(
    limits: str, raw: dict[str, str], expected: str
) -> None:
    markup = html(operator="custom", limits=limits, **{"operator-latex": r"\mathbb{E}"})
    state = data(raw=raw)

    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)
    state["panel"] = "submission"
    rendered = big_operator_input.render(markup, state)

    answer = state["submitted_answers"]["op"]
    assert answer["operator"] == "custom"
    assert answer["operator_latex"] == r"\mathbb{E}"
    assert expected in rendered
    assert state.get("partial_scores", {}) == {}
    assert "badge" not in rendered


def test_custom_operator_exact_grading() -> None:
    markup = html(
        operator="custom",
        limits="bounds",
        **{
            "operator-latex": r"\mathbb{E}",
            "grading-method": "exact",
            "correct-answer-start": "1",
            "correct-answer-end": "4",
            "correct-answer-body": "k^2",
        },
    )
    state = data(raw={"op-start": "1", "op-end": "4", "op-body": "k^2"})

    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)

    assert state["correct_answers"]["op"]["operator_latex"] == r"\mathbb{E}"
    assert state["partial_scores"]["op"] == {"score": 1.0, "weight": 1}


def test_custom_operator_component_grading() -> None:
    markup = html(
        operator="custom",
        limits="bounds",
        **{
            "operator-latex": r"\mathbb{E}",
            "grading-method": "component",
            "body-relative-weight": "2",
            "correct-answer-start": "1",
            "correct-answer-end": "4",
            "correct-answer-body": "k^2",
        },
    )
    state = data(raw={"op-start": "1", "op-end": "5", "op-body": "k^2"})

    big_operator_input.prepare(markup, state)
    big_operator_input.parse(markup, state)
    big_operator_input.grade(markup, state)

    assert state["partial_scores"]["op"] == {"score": pytest.approx(0.75), "weight": 1}


def test_operator_latex_implies_custom_operator_for_whole_answer() -> None:
    markup = html(
        **{
            "operator-latex": r"{ \Huge\bigstar{} }",
            "grading-method": "component",
            "correct-answer": "Custom(j**2, (j, 1, 4))",
            "index-variable": None,
        },
    )
    state = data()

    big_operator_input.prepare(markup, state)

    answer = state["correct_answers"]["op"]
    values = big_operator_input._values(
        big_operator_input._config(markup, state), answer
    )
    assert answer["operator"] == "custom"
    assert answer["operator_latex"] == r"{ \Huge\bigstar{} }"
    assert big_operator_input._config(markup, state).index == "j"
    assert values == {
        "lower": sympy.Integer(1),
        "upper": sympy.Integer(4),
        "body": sympy.Symbol("j") ** 2,
    }


def test_custom_operator_accepts_approach_syntax() -> None:
    markup = html(
        **{
            "operator-latex": r"\operatorname{eval}",
            "limit-direction": "from-left",
            "grading-method": "component",
            "correct-answer": "Custom(j**2, (j, 0, '-'))",
            "index-variable": "j",
        },
    )
    state = data()

    big_operator_input.prepare(markup, state)

    answer = state["correct_answers"]["op"]
    values = big_operator_input._values(
        big_operator_input._config(markup, state), answer
    )
    assert answer["operator"] == "custom"
    assert answer["limits"] == "approach"
    assert answer["direction"] == "from-left"
    assert values == {"target": sympy.Integer(0), "body": sympy.Symbol("j") ** 2}
    state["panel"] = "answer"
    assert (
        r"\mathop{\operatorname{eval}}\limits_{j\to 0^-} j^{2}"
        in big_operator_input.render(markup, state)
    )


def test_schema_accepts_implied_custom_operator() -> None:
    markup = html(
        limits="bounds",
        **{
            "operator-latex": r"{ \Huge\bigstar{} }",
            "grading-method": "component",
            "correct-answer": "Custom(j**2, (j, 1, 4))",
            "index-variable": "j",
            "allowed-blank": "all",
        },
    )

    big_operator_input.pl.validate_element(
        lxml.html.fragment_fromstring(markup),
        SCHEMA_PATH,
    )


def test_custom_operator_correct_answer_panel_renders_complete_notation() -> None:
    markup = html(
        operator="custom",
        limits="bounds",
        **{
            "operator-latex": r"\bigoplus",
            "grading-method": "exact",
            "correct-answer-start": "1",
            "correct-answer-end": "4",
            "correct-answer-body": "k^2",
        },
    )
    state = data(panel="answer")

    big_operator_input.prepare(markup, state)
    rendered = big_operator_input.render(markup, state)

    assert r"\mathop{\bigoplus}\limits_{k=1}^{4} k^{2}" in rendered
    assert "?" not in rendered
    assert "badge" not in rendered


def test_custom_operator_correct_answer_rejects_equivalent_grading() -> None:
    with pytest.raises(ValueError, match='"exact" or "component"'):
        big_operator_input.prepare(
            html(
                operator="custom",
                limits="bounds",
                **{
                    "operator-latex": r"\star",
                    "grading-method": "equivalent",
                    "correct-answer-start": "1",
                    "correct-answer-end": "4",
                    "correct-answer-body": "k^2",
                },
            ),
            data(),
        )


def test_custom_operator_correct_answer_data_rejects_equivalent_grading() -> None:
    with pytest.raises(ValueError, match='"exact" or "component"'):
        big_operator_input.prepare(
            html(operator="custom", limits="bounds", **{"operator-latex": r"\star"}),
            data(sympy.Integer(1)),
        )


def test_integral_and_submission_reconstruct_complete_notation() -> None:
    markup = html(operator="integral")
    state = data(
        raw={"op-start": "0", "op-end": "1", "op-body": "k^2"}, panel="submission"
    )
    state["partial_scores"] = {"op": {"score": 1}}
    rendered = big_operator_input.render(markup, state)
    assert r"\int_{0}^{1} k^2\,\mathrm{d}k" in rendered
    assert rendered.count("badge") == 1


@pytest.mark.parametrize(
    ("score", "badge_class", "label"),
    [
        (1, "text-bg-success", "100%"),
        (0.4, "text-bg-warning", "40%"),
        (0, "text-bg-danger", "0%"),
    ],
)
def test_question_view_shows_score_badge(
    score: float, badge_class: str, label: str
) -> None:
    state = data()
    state["partial_scores"] = {"op": {"score": score}}

    rendered = big_operator_input.render(html(operator="sum"), state)

    assert rendered.count("badge") == 1
    assert badge_class in rendered
    assert label in rendered


def test_set_submission_renders_literal_braces() -> None:
    markup = html(operator="union")
    state = data(raw={"op-domain": "{1, 2}", "op-body": "{k}"})
    big_operator_input.parse(markup, state)
    state["panel"] = "submission"

    rendered = big_operator_input.render(markup, state)

    assert r"\bigcup_{k\in \left\{1, 2\right\}} \left\{k\right\}" in rendered


def test_integral_bounds_use_a_column_between_operator_and_body() -> None:
    rendered = big_operator_input.render(html(operator="integral"), data())
    assert "pl-big-operator-input__operator-stack--integral" in rendered
    operator_position = rendered.index('pl-big-operator-input__operator"')
    limits_position = rendered.index('pl-big-operator-input__limits"')
    body_position = rendered.index('pl-big-operator-input__body"')
    assert operator_position < limits_position < body_position
    css = CSS_PATH.read_text()
    assert "operator-stack--integral {\n  flex-direction: row" in css
    assert ".pl-big-operator-input__limits {" in css
    assert "flex-direction: column" in css
    assert ".pl-big-operator-input__limits > .pl-big-operator-input__upper" in css
    assert ".pl-big-operator-input__limits > .pl-big-operator-input__lower" in css


def test_bounds_upper_field_restores_left_border_radius() -> None:
    rendered = big_operator_input.render(html(operator="sum", limits="bounds"), data())
    assert "pl-big-operator-input__range-upper-bound" in rendered

    integral_rendered = big_operator_input.render(
        html(operator="integral", limits="bounds"), data()
    )
    assert "pl-big-operator-input__range-upper-bound" not in integral_rendered

    css = CSS_PATH.read_text()
    selector = ".pl-big-operator-input__range-upper-bound .input-group > math-field"
    assert selector in css
    assert "border-top-left-radius: var(--bs-border-radius) !important" in css
    assert "border-bottom-left-radius: var(--bs-border-radius) !important" in css


def test_domain_integral_renders_only_a_subscript_field_between_operator_and_body() -> (
    None
):
    markup = html(operator="integral", limits="domain")
    rendered = big_operator_input.render(markup, data())
    operator_position = rendered.index('pl-big-operator-input__operator"')
    domain_position = rendered.index('name="op-domain"')
    body_position = rendered.index('name="op-body"')
    assert operator_position < domain_position < body_position
    assert 'name="op-start"' not in rendered
    assert 'name="op-end"' not in rendered
    assert "Integration domain" in rendered
    assert r"\mathrm d k" in rendered
    assert rendered.index("pl-big-operator-input__domain-spacer") < domain_position
    css = CSS_PATH.read_text()
    assert ".pl-big-operator-input__domain-spacer" in css
    assert "height: calc(1.5rem + 0.75rem + 2px)" in css


def test_domain_integral_parses_and_reconstructs_notation() -> None:
    markup = html(
        operator="integral",
        limits="domain",
        **{"index-variable": "z", "grading-method": "exact"},
    )
    state = data(
        raw={"op-domain": "Interval(0, 1)", "op-body": "z"}, panel="submission"
    )
    state["partial_scores"] = {"op": {"score": 1}}
    big_operator_input.parse(markup, state)
    assert state["submitted_answers"]["op"]["limits"] == "domain"
    assert set(state["submitted_answers"]["op"]) == {
        "_type",
        "_version",
        "operator",
        "limits",
        "index",
        "domain",
        "body",
    }
    rendered = big_operator_input.render(markup, state)
    assert r"\int_{\left[0, 1\right]} z\,\mathrm{d}z" in rendered


@pytest.mark.parametrize("operator", ["union", "limit"])
def test_annotated_operator_stack_has_vertical_offset(operator: str) -> None:
    rendered = big_operator_input.render(html(operator=operator), data())
    assert "pl-big-operator-input__operator-stack--annotated" in rendered
    css = CSS_PATH.read_text()
    assert ".pl-big-operator-input__operator-stack--annotated" in css
    assert "margin-top: 1.5rem" in css
    assert (
        ".pl-big-operator-input__annotation math-field::part(virtual-keyboard-toggle)"
        in css
    )


class TestCorrectAnswerRegressions:
    test_whole_set_correct_answer_enforces_set_fields = staticmethod(
        _test_whole_set_correct_answer_enforces_set_fields
    )
    test_structured_correct_answer_rejects_disallowed_complex_value = staticmethod(
        _test_structured_correct_answer_rejects_disallowed_complex_value
    )
    test_structured_correct_answer_rejects_undeclared_symbol = staticmethod(
        _test_structured_correct_answer_rejects_undeclared_symbol
    )


class TestLifecycleRegressions:
    test_component_parse_clears_stale_format_error_after_valid_reparse = staticmethod(
        _test_component_parse_clears_stale_format_error_after_valid_reparse
    )
    test_invalid_reparse_replaces_previous_partial_score_with_zero = staticmethod(
        _test_invalid_reparse_replaces_previous_partial_score_with_zero
    )
    test_component_score_badge_uses_grading_equivalence = staticmethod(
        _test_component_score_badge_uses_grading_equivalence
    )


class TestGradingSmoke:
    test_exact_and_equivalent_grading = staticmethod(_test_exact_and_equivalent_grading)
    test_equivalent_grading_domain_sum = staticmethod(
        _test_equivalent_grading_domain_sum
    )


class TestControllerUnits:
    """Unit contracts retained from the original controller test module."""


# Keep the large historical test inventory reviewable as functions above while
# exposing every unit contract to pytest through its marker-bearing suite class.
for _test_name in [name for name in globals() if name.startswith("test_")]:
    setattr(TestControllerUnits, _test_name, staticmethod(globals().pop(_test_name)))


class TestParserRegressions:
    @pytest.mark.parametrize("token", ["k+1", "1", "a.b", "__import__", "'k'"])
    def test_wrapper_index_is_lexically_validated(self, token: str) -> None:
        assert big_operator_input._identifier(token) is None

    def test_partial_canonical_submission_falls_back_for_render_and_grades_zero(
        self,
    ) -> None:
        markup = html(operator="sum", **{"correct-answer": "Sum(k, (k, 1, 2))"})
        state = data(panel="submission")
        big_operator_input.prepare(markup, state)
        state["submitted_answers"] = {"op": {}}

        assert big_operator_input.render(markup, state)
        big_operator_input.grade(markup, state)

        assert state["partial_scores"]["op"] == {"score": 0.0, "weight": 1}

    def test_malformed_correct_answer_container_has_descriptive_error(self) -> None:
        state = data()
        state["correct_answers"] = None
        with pytest.raises(TypeError, match="mapping"):
            big_operator_input.prepare(html(operator="sum"), state)


class TestParserUnits:
    @pytest.mark.parametrize(
        "value",
        [
            sympy.Symbol("x"),
            sympy.Integer(2) * sympy.Symbol("x") + 1,
            sympy.FiniteSet(1, 2),
            sympy.Interval(0, 1),
        ],
    )
    def test_public_sympy_json_round_trip(self, value: sympy.Basic) -> None:
        assert big_operator_input._decode(big_operator_input._json(value)) == value

    def test_decode_accepts_sympy_expression(self) -> None:
        value = sympy.Symbol("x") + 1

        assert big_operator_input._decode(value) == value

    @pytest.mark.parametrize("value", [None, 1, "x", [sympy.Symbol("x")]])
    def test_decode_rejects_non_expression_values(self, value: Any) -> None:
        with pytest.raises(
            TypeError,
            match="Mathematical values must be SymPy expressions or dictionaries",
        ):
            big_operator_input._decode(value)


README_EXAMPLES = re.findall(
    r"^```(?:html|xml)\s*\n(.*?)^```\s*$",
    README_PATH.read_text(),
    flags=re.MULTILINE | re.DOTALL,
)


class TestReadmeExamples:
    def test_readme_contains_markup_examples(self) -> None:
        assert README_EXAMPLES

    @pytest.mark.parametrize("example", README_EXAMPLES)
    def test_readme_markup_examples_validate_prepare_and_render(
        self, example: str
    ) -> None:
        elements = [
            fragment
            for fragment in lxml.html.fragments_fromstring(example)
            if getattr(fragment, "tag", None) == "pl-big-operator-input"
        ]
        assert len(elements) == 1
        markup = lxml.html.tostring(elements[0], encoding="unicode")  # type: ignore
        state = {
            "params": {},
            "correct_answers": {},
            "raw_submitted_answers": {},
            "panel": "question",
        }

        big_operator_input.pl.validate_element(
            elements[0],
            SCHEMA_PATH,
        )
        big_operator_input.prepare(markup, state)

        assert big_operator_input.render(markup, state)
