import importlib
import json
from pathlib import Path
from typing import Any, cast

import lxml.html
import prairielearn.sympy_utils as psu
import pytest
import sympy
from mathjson import MathJsonExpression

symbolic_input = importlib.import_module("pl-symbolic-input")


def build_element_html(*attributes: str, answers_name: str = "test") -> str:
    return "\n".join([
        "<pl-symbolic-input",
        f'    answers-name="{answers_name}"',
        *[f"    {attribute}" for attribute in attributes],
        "></pl-symbolic-input>",
    ])


def make_question_data(
    *,
    submitted_answers: dict[str, Any] | None = None,
    raw_submitted_answers: dict[str, Any] | None = None,
    correct_answers: dict[str, Any] | None = None,
    answers_names: dict[str, Any] | None = None,
    panel: str = "question",
    editable: bool = True,
) -> dict[str, Any]:
    submitted_answers = submitted_answers or {}
    return {
        "submitted_answers": submitted_answers,
        "raw_submitted_answers": (
            raw_submitted_answers
            if raw_submitted_answers is not None
            else submitted_answers
        ),
        "correct_answers": correct_answers or {},
        "answers_names": answers_names or {},
        "format_errors": {},
        "partial_scores": {},
        "panel": panel,
        "editable": editable,
    }


def test_config_defaults() -> None:
    element = lxml.html.fragment_fromstring(build_element_html())
    config = symbolic_input._get_config(element)

    assert config == symbolic_input._SymbolicInputConfig(
        name="test",
        weight=1,
        variables=[],
        variables_from_element=False,
        custom_functions=[],
        label=None,
        aria_label=None,
        suffix=None,
        display=symbolic_input.DisplayType.INLINE,
        allow_complex=False,
        allowed_types={"expression"},
        display_log_as_ln=False,
        simplify_expression=True,
        imaginary_unit="i",
        allow_trig=True,
        additional_simplifications=[],
        size=35,
        formula_editor=False,
        show_info=True,
        allow_blank=False,
        blank_value="0",
        placeholder="symbolic expression",
        show_score=True,
        initial_value=None,
        correct_answer=None,
    )
    assert not config.supports_set_syntax


def test_config_custom_values() -> None:
    element = lxml.html.fragment_fromstring(
        build_element_html(
            'weight="3"',
            'variables="x, y"',
            'custom-functions="f, g"',
            'label="value"',
            'aria-label="answer"',
            'suffix="units"',
            'display="block"',
            'allow-complex="true"',
            'allowed-types="finite-set, interval"',
            'display-log-as-ln="true"',
            'display-simplified-expression="false"',
            'imaginary-unit-for-display="j"',
            'allow-trig-functions="false"',
            'additional-simplifications="expand, powsimp"',
            'size="12"',
            'formula-editor="true"',
            'show-help-text="false"',
            'allow-blank="true"',
            'blank-value=""',
            'placeholder="answer"',
            'show-score="false"',
            'initial-value="x + 1"',
            'correct-answer="x + 2"',
            answers_name="custom",
        )
    )

    config = symbolic_input._get_config(element)

    assert config == symbolic_input._SymbolicInputConfig(
        name="custom",
        weight=3,
        variables=["x", "y"],
        variables_from_element=True,
        custom_functions=["f", "g"],
        label="value",
        aria_label="answer",
        suffix="units",
        display=symbolic_input.DisplayType.BLOCK,
        allow_complex=True,
        allowed_types={"finite-set", "interval"},
        display_log_as_ln=True,
        simplify_expression=False,
        imaginary_unit="j",
        allow_trig=False,
        additional_simplifications=["expand", "powsimp"],
        size=12,
        formula_editor=True,
        show_info=False,
        allow_blank=True,
        blank_value="",
        placeholder="answer",
        show_score=False,
        initial_value="x + 1",
        correct_answer="x + 2",
    )
    assert config.supports_set_syntax


@pytest.mark.parametrize(
    ("allow_sets", "allowed_types", "supports_set_syntax"),
    [
        ("true", {"all"}, True),
        ("false", {"expression"}, False),
    ],
)
def test_config_maps_legacy_allow_sets(
    allow_sets: str,
    allowed_types: set[psu.AllowedSympyType],
    *,
    supports_set_syntax: bool,
) -> None:
    element = lxml.html.fragment_fromstring(
        build_element_html(f'allow-sets="{allow_sets}"')
    )

    config = symbolic_input._get_config(element)

    assert config.allowed_types == allowed_types
    assert config.supports_set_syntax is supports_set_syntax


def test_set_union_submission_parses_when_set_notation_is_enabled() -> None:
    element_html = build_element_html(
        'allow-sets="true"',
        'correct-answer="{1} | {2}"',
    )
    data = make_question_data(submitted_answers={"test": "{1} | {2}"})

    symbolic_input.prepare(element_html, data)
    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert isinstance(data["submitted_answers"]["test"], dict)
    assert psu.json_to_sympy(
        data["submitted_answers"]["test"], allow_sets=True
    ) == sympy.FiniteSet(1, 2)


def test_parse_rejects_accumulation_bounds_without_storing_an_answer() -> None:
    element_html = build_element_html()
    data = make_question_data(submitted_answers={"test": "sin(infty)"})

    symbolic_input.parse(element_html, data)

    assert data["submitted_answers"]["test"] is None
    assert (
        "simplifies to a range of possible values, which is not supported"
        in data["format_errors"]["test"]
    )


@pytest.mark.parametrize(
    ("submission", "used_type"),
    [
        ("{1, 2}", "finite-set"),
        ("[1, 2]", "interval"),
        ("Reals", "set"),
    ],
)
def test_set_notation_is_rejected_by_default(submission: str, used_type: str) -> None:
    element_html = build_element_html()
    data = make_question_data(submitted_answers={"test": submission})

    symbolic_input.parse(element_html, data)

    assert data["submitted_answers"]["test"] is None
    assert data["format_errors"]["test"] == (
        f"Your answer uses {used_type}, which this input does not accept. "
        "Allowed types: expression."
    )


@pytest.mark.parametrize("operator", ["U", "|", "&"])
def test_set_operators_reject_declared_scalar_variables(operator: str) -> None:
    element_html = build_element_html(
        'variables="x, y"',
        'allowed-types="all"',
    )
    submission = f"x {operator} y"
    data = make_question_data(submitted_answers={"test": submission})

    symbolic_input.parse(element_html, data)

    assert data["submitted_answers"]["test"] is None
    assert "expecting a set, but got a number" in data["format_errors"]["test"]
    assert (
        psu.point_to_error(submission, submission.index(operator))
        in data["format_errors"]["test"]
    )


def test_malformed_set_syntax_reports_a_syntax_error() -> None:
    element_html = build_element_html()
    data = make_question_data(submitted_answers={"test": "{1, 2"})

    symbolic_input.parse(element_html, data)

    assert data["submitted_answers"]["test"] is None
    assert "syntax error" in data["format_errors"]["test"]


@pytest.mark.parametrize(
    ("allowed_types", "submission"),
    [
        ("finite-set, expression", "{1, 2}"),
        ("finite-set, expression", "x + 1"),
        ("set", "[0, 5] - {x}"),
        ("all", "[1, 2]"),
    ],
)
def test_parse_accepts_allowed_value_types(allowed_types: str, submission: str) -> None:
    element_html = build_element_html(
        'variables="x"',
        f'allowed-types="{allowed_types}"',
    )
    data = make_question_data(submitted_answers={"test": submission})

    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert isinstance(data["submitted_answers"]["test"], dict)


def test_parse_rejects_disallowed_value_types() -> None:
    element_html = build_element_html(
        'variables="x"',
        'allowed-types="finite-set"',
    )
    data = make_question_data(submitted_answers={"test": "x + 1"})

    symbolic_input.parse(element_html, data)

    assert data["submitted_answers"]["test"] is None
    assert data["format_errors"]["test"] == (
        "Your answer uses expression, which this input does not accept. "
        "Allowed types: finite-set."
    )


def test_prepare_rejects_allow_sets_with_allowed_types() -> None:
    element_html = build_element_html(
        'allow-sets="true"',
        'allowed-types="all"',
    )

    with pytest.raises(ValueError, match=r"'allow-sets'.*'allowed-types'"):
        symbolic_input.prepare(element_html, make_question_data())


@pytest.mark.parametrize(
    ("attributes", "correct_answers"),
    [
        (['correct-answer="{1, 2}"'], None),
        ([], {"test": "{1, 2}"}),
        ([], {"test": psu.sympy_to_json(sympy.FiniteSet(1, 2), allow_sets=True)}),
    ],
)
def test_prepare_rejects_disallowed_correct_answer_type(
    attributes: list[str], correct_answers: dict[str, Any] | None
) -> None:
    element_html = build_element_html('allowed-types="interval"', *attributes)
    data = make_question_data(correct_answers=correct_answers)

    with pytest.raises(
        ValueError,
        match=r"Parsing correct answer.*uses finite-set.*Allowed types: interval",
    ):
        symbolic_input.prepare(element_html, data)


def test_prepare_accepts_allowed_correct_answer_type() -> None:
    element_html = build_element_html(
        'allowed-types="interval"',
        'correct-answer="[1, 2] U [3, 4]"',
    )
    data = make_question_data()

    symbolic_input.prepare(element_html, data)

    assert data["correct_answers"]["test"] == "[1, 2] U [3, 4]"


@pytest.mark.parametrize(
    ("allowed_types", "correct_answer", "expected_type"),
    [
        ("all", "5", sympy.Expr),
        ("expression", "infty", sympy.Expr),
        ("finite-set", "{5}", sympy.FiniteSet),
        ("interval", "(5, 6)", sympy.Interval),
    ],
)
def test_incorrect_answer_uses_an_allowed_type_and_avoids_collision(
    monkeypatch: pytest.MonkeyPatch,
    allowed_types: str,
    correct_answer: str,
    expected_type: type[sympy.Basic],
) -> None:
    monkeypatch.setattr(symbolic_input.random, "randint", lambda _start, _end: 5)
    element_html = build_element_html(f'allowed-types="{allowed_types}"')
    data = make_question_data(correct_answers={"test": correct_answer})
    data["test_type"] = "incorrect"

    symbolic_input.test(element_html, data)
    data["submitted_answers"] = data["raw_submitted_answers"].copy()
    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    submitted_answer = psu.json_to_sympy(
        data["submitted_answers"]["test"], allow_sets=True
    )
    assert isinstance(submitted_answer, expected_type)
    assert submitted_answer != psu.convert_string_to_sympy(
        correct_answer, allow_sets=True
    )


def test_correct_answer_generation_round_trips_set_domains() -> None:
    element_html = build_element_html('allow-sets="true"')
    data = make_question_data(
        correct_answers={
            "test": psu.sympy_to_json(sympy.S.Reals, allow_sets=True),
        }
    )
    data["test_type"] = "correct"

    symbolic_input.test(element_html, data)
    data["submitted_answers"] = data["raw_submitted_answers"].copy()
    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert (
        psu.json_to_sympy(data["submitted_answers"]["test"], allow_sets=True)
        == sympy.S.Reals
    )


@pytest.mark.parametrize(
    "a_sub",
    [
        # Reported as containing set notation: 4^{csc(9x)}·(-9·ln 4)·cot(9x)csc(9x)
        pytest.param(
            "4^(c s c (9x)) * (-9∙l n 4) * c o t (9x)c s c (9x)",
            id="report-set-notation",
        ),
        # Reported as graded incorrect: the editor submits `{\ln 4}\cdot` as "ln 4 *",
        # which would otherwise be parsed as ln(4*cot(9x)*csc(9x))
        pytest.param(
            "-9 * 4^(c s c (9x)) * l n 4 * c o t (9x) * c s c (9x)",
            id="report-graded-incorrect",
        ),
        # Pasting "4^(csc(9x))(-9*ln4)*cot(9x)csc(9x)" into the editor
        pytest.param(
            "4^(c s c(9x))(-9∗l n4)∗c o t(9x)c s c(9x)",  # ruff:ignore[ambiguous-unicode-character-string]
            id="pasted-asterisk-operator",
        ),
    ],
)
def test_formula_editor_reported_chain_rule_answers(a_sub: str) -> None:
    """Regression test for correct answers rejected as set notation or graded incorrect.

    The submissions are the plain text the formula editor sends for the reported answers.
    """
    x = sympy.Symbol("x")
    expected = (
        -9 * 4 ** sympy.csc(9 * x) * sympy.log(4) * sympy.cot(9 * x) * sympy.csc(9 * x)
    )
    element_html = build_element_html('variables="x"', 'formula-editor="true"')
    data = make_question_data(
        submitted_answers={"test": a_sub},
        correct_answers={"test": psu.sympy_to_json(expected)},
    )

    symbolic_input.parse(element_html, data)
    assert "test" not in data["format_errors"]
    assert psu.json_to_sympy(data["submitted_answers"]["test"]) == expected

    symbolic_input.grade(element_html, data)
    assert data["partial_scores"]["test"]["score"] == 1


def test_formula_editor_bare_argument_before_implicit_multiplication() -> None:
    r"""The editor displays `\ln 8\left(...\right)` as ln(8)·(...)."""
    x = sympy.Symbol("x")
    element_html = build_element_html('variables="x"', 'formula-editor="true"')
    data = make_question_data(submitted_answers={"test": "l n 8(x+1)"})

    symbolic_input.parse(element_html, data)
    assert "test" not in data["format_errors"]
    assert psu.json_to_sympy(data["submitted_answers"]["test"]) == sympy.log(8) * (
        x + 1
    )


def test_formula_editor_bare_argument_with_unsimplified_set_grading() -> None:
    element_html = build_element_html(
        'variables="x"',
        'formula-editor="true"',
        'allow-sets="true"',
        'display-simplified-expression="false"',
        'correct-answer="{ln(8)*(x+1)}"',
    )
    data = make_question_data(submitted_answers={"test": "{l n 8(x+1)}"})

    symbolic_input.prepare(element_html, data)
    symbolic_input.parse(element_html, data)
    assert "test" not in data["format_errors"]

    symbolic_input.grade(element_html, data)
    assert data["partial_scores"]["test"]["score"] == 1


def test_formula_editor_set_constructor_is_recognized() -> None:
    element_html = build_element_html(
        'formula-editor="true"',
        'allow-sets="true"',
        'display-simplified-expression="false"',
        'correct-answer="{1} - {2}"',
    )
    data = make_question_data(
        submitted_answers={"test": "C o m p l e m e n t ({1},{2})"}
    )

    symbolic_input.prepare(element_html, data)
    symbolic_input.parse(element_html, data)
    assert "test" not in data["format_errors"]

    symbolic_input.grade(element_html, data)
    assert data["partial_scores"]["test"]["score"] == 1


def test_formula_editor_function_ending_in_digit_stays_in_bare_argument() -> None:
    x, y = sympy.symbols("x y")
    element_html = build_element_html('variables="x,y"', 'formula-editor="true"')
    data = make_question_data(submitted_answers={"test": "ln atan2(y,x)"})

    symbolic_input.parse(element_html, data)
    assert "test" not in data["format_errors"]
    assert psu.json_to_sympy(data["submitted_answers"]["test"]) == sympy.log(
        sympy.atan2(y, x)
    )


def test_formula_editor_plus_minus_is_distinguished_from_typed_plus_minus() -> None:
    element_html = build_element_html('variables="a"', 'formula-editor="true"')
    data = make_question_data(
        submitted_answers={"test": "2+-a"},
        raw_submitted_answers={"test": "2+-a", "test-latex": r"2\pm a"},
    )
    symbolic_input.parse(element_html, data)
    assert 'invalid symbol "±"' in data["format_errors"]["test"]

    data = make_question_data(
        submitted_answers={"test": "2+-a"},
        raw_submitted_answers={"test": "2+-a", "test-latex": "2+-a"},
    )
    symbolic_input.parse(element_html, data)
    assert "test" not in data["format_errors"]
    assert psu.json_to_sympy(data["submitted_answers"]["test"]) == 2 - sympy.Symbol("a")


def test_formula_editor_deeply_nested_bare_arguments() -> None:
    depth = 1200
    submission = "s i n f(" * depth + "x" + ")(y)" * depth
    element_html = build_element_html(
        'variables="x,y"', 'custom-functions="f"', 'formula-editor="true"'
    )
    data = make_question_data(submitted_answers={"test": submission})
    symbolic_input.parse(element_html, data)
    assert "syntax error" in data["format_errors"]["test"]


def test_parse_without_variables_attribute_with_assumptions() -> None:
    """Test that parse works when no variables attribute is specified but correct answer has assumptions.

    This is a regression test for https://github.com/PrairieLearn/PrairieLearn/issues/12053
    where using pl-symbolic-input without a variables attribute would fail with
    HasInvalidAssumptionError when the correct answer had variable assumptions.
    """
    # Create a sympy expression with assumptions (like an instructor would in server.py)
    x = sympy.Symbol("x", real=True)
    y = sympy.Symbol("y", real=True)
    correct_expr = x + y

    # Convert to JSON (this is what gets stored and later retrieved)
    correct_json = psu.sympy_to_json(correct_expr)

    # Simulate element HTML without variables attribute
    element_html = build_element_html()

    # Create mock data structure (simulating what the system passes to parse)
    data = make_question_data(
        submitted_answers={"test": "x + y"},
        correct_answers={"test": correct_json},
    )

    # This should NOT raise HasInvalidAssumptionError
    symbolic_input.parse(element_html, data)

    # Verify the submission was parsed successfully
    assert "test" not in data["format_errors"]
    assert data["submitted_answers"]["test"] is not None
    # The submitted answer should be a valid SympyJson dict
    assert isinstance(data["submitted_answers"]["test"], dict)
    assert data["submitted_answers"]["test"]["_type"] == "sympy"


@pytest.mark.parametrize("a_sub", ["sqrt(-2)", "sqrt(-1)", "(-2)^(1/2)"])
def test_implicit_complex_rejected_with_no_simplify(a_sub: str) -> None:
    """Submitting an implicitly complex expression like sqrt(-2) must produce a
    format error during parse, even when display-simplified-expression is false.
    """
    correct_answer = psu.sympy_to_json(sympy.Integer(42))

    element_html = build_element_html(
        'variables="x"', 'display-simplified-expression="false"'
    )

    data = make_question_data(
        submitted_answers={"test": a_sub},
        correct_answers={"test": correct_answer},
    )

    symbolic_input.parse(element_html, data)

    assert "test" in data["format_errors"]
    assert "complex number" in data["format_errors"]["test"]


def test_unevaluated_real_subexpression_ignores_false_complex_assumption(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_is_disallowed_complex = psu._is_disallowed_complex

    def is_disallowed_complex(item: sympy.Basic) -> bool:
        # SymPy can intermittently report this unevaluated product as non-real.
        if isinstance(item, sympy.Mul) and item.args == (
            sympy.Integer(1),
            sympy.Integer(0),
        ):
            return True
        return original_is_disallowed_complex(item)

    monkeypatch.setattr(psu, "_is_disallowed_complex", is_disallowed_complex)

    element_html = build_element_html(
        'variables="x"', 'display-simplified-expression="false"'
    )
    data = make_question_data(
        submitted_answers={"test": "(x-0)/6"},
        correct_answers={
            "test": psu.sympy_to_json(sympy.Symbol("x") / sympy.Integer(6))
        },
    )

    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert data["submitted_answers"]["test"]["_value"] == "(x - 1*0)/6"


@pytest.mark.parametrize("simplify_expression", [True, False])
def test_adjacent_decimal_points_report_source(*, simplify_expression: bool) -> None:
    element_html = build_element_html(
        'variables="x"',
        f'display-simplified-expression="{str(simplify_expression).lower()}"',
    )
    data = make_question_data(
        submitted_answers={"test": "|x+1| + 2..3"},
        correct_answers={"test": psu.sympy_to_json(sympy.Integer(42))},
    )

    symbolic_input.parse(element_html, data)

    error = data["format_errors"]["test"]
    assert "invalid expression" in error
    assert "2..3" in error
    assert data["submitted_answers"]["test"] is None


@pytest.mark.parametrize("a_sub", ["log(-x^2)", "sqrt(-x^2)"])
def test_complex_from_real_assumptions_produces_format_error(a_sub: str) -> None:
    """When a correct answer has real variable assumptions, submitting an
    expression that becomes complex (e.g. log(-x^2)) should produce a format
    error, not an unhandled exception.

    Regression test for https://github.com/PrairieLearn/PrairieLearn/issues/14442
    """
    x = sympy.Symbol("x", real=True)
    correct_answer = psu.sympy_to_json(x ** (-1) - 1)

    element_html = build_element_html('variables="x"')

    data = make_question_data(
        submitted_answers={"test": a_sub},
        correct_answers={"test": correct_answer},
    )

    symbolic_input.parse(element_html, data)

    assert "test" in data["format_errors"]
    assert "complex number" in data["format_errors"]["test"]


@pytest.mark.parametrize(
    "a_sub",
    [
        "sec(0)",
        "(16-9*(sec(0)^2))/3",
        "csc(1)",
    ],
)
def test_trig_no_crash_with_no_simplify(a_sub: str) -> None:
    """Submitting expressions with sec/csc must not crash when
    display-simplified-expression is false. Regression test for a sympy
    bug where is_extended_real on unevaluated sec(0) raises AttributeError.
    """
    correct_answer = psu.sympy_to_json(sympy.Integer(2))

    element_html = build_element_html(
        'variables="x"', 'display-simplified-expression="false"'
    )

    data = make_question_data(
        submitted_answers={"test": a_sub},
        correct_answers={"test": correct_answer},
    )

    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"], (
        f"Unexpected format error: {data['format_errors'].get('test')}"
    )
    assert data["submitted_answers"]["test"] is not None


def test_formula_editor_test_submission_includes_mathjson() -> None:
    x = sympy.Symbol("x")
    # pyright is not smart enough here
    expected = cast(
        sympy.Basic, sympy.Function("test")(sympy.sqrt(sympy.exp(x) / x**2))
    )
    element_html = build_element_html(
        'formula-editor="true"',
        'variables="x"',
        'custom-functions="test"',
    )
    data = make_question_data(correct_answers={"test": psu.sympy_to_json(expected)})
    data["test_type"] = "correct"

    symbolic_input.test(element_html, data)

    raw_submitted_answers = data["raw_submitted_answers"]
    assert raw_submitted_answers["test"] == str(expected)
    assert isinstance(raw_submitted_answers["test-json"], str)

    parse_data = make_question_data(
        submitted_answers=raw_submitted_answers,
        correct_answers={"test": psu.sympy_to_json(expected)},
    )
    symbolic_input.parse(element_html, parse_data)

    assert "test" not in parse_data["format_errors"]
    assert (
        psu.json_to_sympy(parse_data["submitted_answers"]["test"], allow_sets=True)
        == expected
    )


@pytest.mark.parametrize("simplify_expression", [False, True])
@pytest.mark.parametrize(
    ("submission", "mathjson"),
    [
        ("x+x", ["Add", "x", "x"]),
        ("x*x", ["Multiply", "x", "x"]),
        ("x*x", ["InvisibleOperator", "x", "x"]),
        ("x-x", ["Subtract", "x", "x"]),
        ("x/x", ["Divide", "x", "x"]),
        ("x^0", ["Power", "x", 0]),
        ("x-(x+x)", ["Subtract", "x", ["Add", "x", "x"]]),
        ("-(x+x)", ["Negate", ["Add", "x", "x"]]),
        ("sin(pi)", ["Sin", "Pi"]),
        ("sqrt(4)", ["Sqrt", 4]),
        ("log(1)", ["Log", 1]),
        ("1/2", ["Divide", 1, 2]),
        ("sqrt(x+x)", ["Sqrt", ["Add", "x", "x"]]),
        ("f(x+x)", ["f", ["Add", "x", "x"]]),
    ],
)
def test_mathjson_submission_respects_simplification(
    submission: str, mathjson: MathJsonExpression, simplify_expression: bool
) -> None:
    attributes = (
        'variables="x"',
        'custom-functions="f"',
        f'display-simplified-expression="{str(simplify_expression).lower()}"',
    )
    text_data = make_question_data(submitted_answers={"test": submission})
    symbolic_input.parse(build_element_html(*attributes), text_data)
    assert text_data["format_errors"] == {}

    formula_data = make_question_data(
        submitted_answers={"test": submission, "test-json": json.dumps(mathjson)},
        correct_answers={"test": text_data["submitted_answers"]["test"]},
    )
    element_html = build_element_html(*attributes, 'formula-editor="true"')
    symbolic_input.parse(element_html, formula_data)

    assert formula_data["format_errors"] == {}
    assert (
        formula_data["submitted_answers"]["test"]["_value"]
        == text_data["submitted_answers"]["test"]["_value"]
    )
    symbolic_input.grade(element_html, formula_data)
    assert formula_data["partial_scores"]["test"]["score"] == 1


@pytest.mark.parametrize("simplify_expression", [False, True])
def test_mathjson_submission_reapplies_variable_checks(
    simplify_expression: bool,
) -> None:
    element_html = build_element_html(
        'formula-editor="true"',
        'variables="x"',
        f'display-simplified-expression="{str(simplify_expression).lower()}"',
    )
    data = make_question_data(submitted_answers={"test": "y", "test-json": '"y"'})

    symbolic_input.parse(element_html, data)

    assert "test" in data["format_errors"]
    assert data["submitted_answers"]["test"] is None


@pytest.mark.parametrize("simplify_expression", [False, True])
def test_mathjson_submission_reapplies_custom_function_checks(
    simplify_expression: bool,
) -> None:
    element_html = build_element_html(
        'formula-editor="true"',
        'variables="x"',
        f'display-simplified-expression="{str(simplify_expression).lower()}"',
    )
    data = make_question_data(
        submitted_answers={"test": "f(x)", "test-json": '["Apply", "f", "x"]'}
    )

    symbolic_input.parse(element_html, data)

    assert "test" in data["format_errors"]
    assert data["submitted_answers"]["test"] is None


@pytest.mark.parametrize(
    ("simplify_expression", "expected_latex"), [(False, "x + x"), (True, "2 x")]
)
def test_mathjson_submission_display_respects_simplification(
    monkeypatch: pytest.MonkeyPatch,
    simplify_expression: bool,
    expected_latex: str,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element_html = build_element_html(
        'formula-editor="true"',
        'variables="x"',
        f'display-simplified-expression="{str(simplify_expression).lower()}"',
    )
    data = make_question_data(
        submitted_answers={"test": "x+x", "test-json": '["Add", "x", "x"]'},
        panel="submission",
    )

    symbolic_input.parse(element_html, data)

    assert data["format_errors"] == {}
    assert f"${expected_latex}$" in symbolic_input.render(element_html, data)


@pytest.mark.parametrize("raw_mathjson", ["", "   "])
def test_blank_mathjson_submission_falls_back_to_string_parser(
    raw_mathjson: str,
) -> None:
    element_html = build_element_html('formula-editor="true"', 'variables="x"')
    data = make_question_data(
        submitted_answers={"test": "x + 1", "test-json": raw_mathjson}
    )

    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert psu.json_to_sympy(data["submitted_answers"]["test"]) == sympy.Symbol("x") + 1


@pytest.mark.parametrize(
    ("submission", "expected"),
    [
        (
            "{:s i n(x) + t i m e + m y f u n(x) + f2(x) + x2:}",
            "sin(x)+time+myfun(x)+f2(x)+x*2",
        ),
        ("max(x,1)", "max(x,1)"),
        ("[0,1]", "[0,1]"),
        ("x+x", "x+x"),
    ],
)
def test_legacy_formula_editor_submission_populates_reusable_mathjson(
    monkeypatch: pytest.MonkeyPatch,
    submission: str,
    expected: str,
) -> None:
    attributes = (
        'variables="time,x"',
        'custom-functions="myfun,f2"',
        'allow-sets="true"',
        'display-simplified-expression="false"',
    )
    expected_data = make_question_data(submitted_answers={"test": expected})
    symbolic_input.parse(build_element_html(*attributes), expected_data)
    assert expected_data["format_errors"] == {}

    raw_answers = {"test": submission}
    data = make_question_data(
        submitted_answers=raw_answers.copy(),
        raw_submitted_answers=raw_answers.copy(),
    )
    element_html = build_element_html(*attributes, 'formula-editor="true"')

    symbolic_input.parse(element_html, data)

    assert data["format_errors"] == {}
    assert data["raw_submitted_answers"] == raw_answers
    assert (
        data["submitted_answers"]["test"] == expected_data["submitted_answers"]["test"]
    )

    def fail_legacy_normalization(*args: object) -> None:
        pytest.fail("The saved MathJSON should bypass legacy normalization")

    monkeypatch.setattr(psu, "try_parse_symbolic_submission", fail_legacy_normalization)
    symbolic_input.parse(element_html, data)

    assert data["format_errors"] == {}
    actual_answer = data["submitted_answers"]["test"]
    expected_answer = expected_data["submitted_answers"]["test"]
    assert set(actual_answer["_variables"]) == set(expected_answer["_variables"])
    assert (
        actual_answer | {"_variables": expected_answer["_variables"]} == expected_answer
    )


def test_legacy_formula_editor_submission_uses_inferred_variables() -> None:
    x, time = sympy.symbols("x time")
    expected = psu.sympy_to_json(x + time)
    data = make_question_data(
        submitted_answers={"test": "t i m e + x"},
        correct_answers={"test": expected},
    )

    symbolic_input.parse(build_element_html('formula-editor="true"'), data)

    assert data["format_errors"] == {}
    assert data["submitted_answers"]["test"] == expected
    assert "test-json" in data["submitted_answers"]


def test_legacy_formatting_wrappers_respect_allow_blank() -> None:
    data = make_question_data(submitted_answers={"test": "{::}"})
    element_html = build_element_html(
        'formula-editor="true"', 'allow-blank="true"', 'blank-value="0"'
    )

    symbolic_input.parse(element_html, data)

    assert data["format_errors"] == {}
    assert psu.json_to_sympy(data["submitted_answers"]["test"]) == 0
    assert json.loads(data["submitted_answers"]["test-json"]) == 0


def test_raw_input_ignores_mathjson_submission() -> None:
    element_html = build_element_html('variables="x"')
    data = make_question_data(submitted_answers={"test": "x", "test-json": '"y"'})

    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert psu.json_to_sympy(data["submitted_answers"]["test"]) == sympy.Symbol("x")


def test_mathjson_student_errors_are_shown_directly() -> None:
    element_html = build_element_html('formula-editor="true"', 'allow-sets="true"')
    data = make_question_data(
        submitted_answers={"test": "{1} + 2", "test-json": '["Add", ["Set", 1], 2]'}
    )

    symbolic_input.parse(element_html, data)

    assert (
        data["format_errors"]["test"] == "Parse error: Expected a numeric expression."
    )
    assert data["submitted_answers"]["test"] is None


def test_unexpected_mathjson_composition_errors_use_generic_message() -> None:
    element_html = build_element_html('formula-editor="true"', 'variables="x"')
    data = make_question_data(
        submitted_answers={"test": "x", "test-json": '["Rational", "x"]'}
    )

    symbolic_input.parse(element_html, data)

    assert data["format_errors"]["test"] == (
        "Parse error: Could not parse submitted answer."
    )
    assert "invalid input" not in data["format_errors"]["test"]
    assert data["submitted_answers"]["test"] is None


def test_mathjson_submission_respects_blank_value() -> None:
    element_html = build_element_html(
        'formula-editor="true"', 'allow-blank="true"', 'blank-value="0"'
    )
    data = make_question_data(submitted_answers={"test": "", "test-json": '"x"'})

    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert psu.json_to_sympy(data["submitted_answers"]["test"]) == 0


def test_formula_editor_set_test_submission_includes_mathjson() -> None:
    expected = sympy.Union(
        sympy.Interval(-sympy.oo, sympy.Rational(-1, 2)),
        sympy.Interval(sympy.Rational(1, 2), sympy.oo),
    )
    element_html = build_element_html(
        'formula-editor="true"',
        'allow-sets="true"',
        'correct-answer="(-infty, -1/2] U [1/2, infty)"',
    )
    data = make_question_data()
    data["test_type"] = "correct"

    symbolic_input.prepare(element_html, data)
    symbolic_input.test(element_html, data)

    raw_submitted_answers = data["raw_submitted_answers"]
    assert raw_submitted_answers["test"] == str(expected)
    assert isinstance(raw_submitted_answers["test-json"], str)

    parse_data = make_question_data(
        submitted_answers=raw_submitted_answers,
        correct_answers=data["correct_answers"],
    )
    symbolic_input.parse(element_html, parse_data)

    assert "test" not in parse_data["format_errors"]
    assert (
        psu.json_to_sympy(parse_data["submitted_answers"]["test"], allow_sets=True)
        == expected
    )


@pytest.mark.parametrize(
    ("answer", "expected_expr"),
    [
        (
            "[sin(x), cos(y)]",
            sympy.Interval(sympy.sin(sympy.Symbol("x")), sympy.cos(sympy.Symbol("y"))),
        ),
        (
            "[x^2 + 2*x - 1, y^2 - 3*y + 4]",
            sympy.Interval(
                sympy.Symbol("x") ** 2 + 2 * sympy.Symbol("x") - 1,
                sympy.Symbol("y") ** 2 - 3 * sympy.Symbol("y") + 4,
            ),
        ),
    ],
)
def test_interval_endpoints_support_trig_and_arithmetic_expressions(
    answer: str, expected_expr: sympy.Basic
) -> None:
    element_html = build_element_html(
        'allow-sets="true"',
        'variables="x,y"',
        f'correct-answer="{answer}"',
    )
    data = make_question_data(submitted_answers={"test": answer})

    symbolic_input.prepare(element_html, data)
    assert data["correct_answers"]["test"] == answer

    symbolic_input.parse(element_html, data)
    assert "test" not in data["format_errors"]
    assert isinstance(data["submitted_answers"]["test"], dict)
    assert data["submitted_answers"]["test"]["_type"] == "sympy"
    assert (
        psu.json_to_sympy(data["submitted_answers"]["test"], allow_sets=True)
        == expected_expr
    )

    symbolic_input.grade(element_html, data)
    assert data["partial_scores"]["test"]["score"] == 1


def test_interval_correct_answer_renders(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element_html = build_element_html(
        'allow-sets="true"',
        'correct-answer="[1, 2] U [3, 4]"',
    )
    data = make_question_data(panel="answer", editable=False)

    symbolic_input.prepare(element_html, data)
    rendered = symbolic_input.render(element_html, data)

    assert "\\left[1, 2\\right] \\cup \\left[3, 4\\right]" in rendered


def test_empty_set_submission_round_trips_when_set_notation_is_enabled() -> None:
    element_html = build_element_html(
        'allow-sets="true"',
        'correct-answer="{}"',
    )
    data = make_question_data(submitted_answers={"test": "{}"})

    symbolic_input.prepare(element_html, data)
    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert isinstance(data["submitted_answers"]["test"], dict)
    assert (
        psu.json_to_sympy(data["submitted_answers"]["test"], allow_sets=True)
        == sympy.EmptySet
    )

    symbolic_input.grade(element_html, data)
    assert data["partial_scores"]["test"]["score"] == 1


@pytest.mark.parametrize(
    ("correct_answer", "submission", "variables", "expected_score"),
    [
        ("{x + 1, x - 1}", "{x + 1, x - 1}", "x", 1),
        ("{x}", "{x + 0, x - 0}", "x", 1),
        ("{x, 1}", "{x + 0, x - 0}", "x", 0),
        (
            "[0, (x + 1)^2] U {y}",
            "[0, x^2 + 2*x + 1] U {y}",
            "x,y",
            1,
        ),
        ("[0, x] U {y}", "(0, x + 0] U {y}", "x,y", 0),
        ("{x} - {y}", "{x} - {y}", "x,y", 1),
    ],
)
def test_unsimplified_set_grading(
    correct_answer: str,
    submission: str,
    variables: str,
    expected_score: int,
) -> None:
    element_html = build_element_html(
        'allow-sets="true"',
        'display-simplified-expression="false"',
        f'variables="{variables}"',
        f'correct-answer="{correct_answer}"',
    )
    data = make_question_data(submitted_answers={"test": submission})

    symbolic_input.prepare(element_html, data)
    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert isinstance(data["submitted_answers"]["test"], dict)

    symbolic_input.grade(element_html, data)
    assert data["partial_scores"]["test"]["score"] == expected_score


def test_custom_complement_function_round_trips_with_set_notation() -> None:
    element_html = build_element_html(
        'allow-sets="true"',
        'variables="x"',
        'custom-functions="Complement"',
        'correct-answer="Complement(x)"',
    )
    data = make_question_data(submitted_answers={"test": "Complement(x)"})

    symbolic_input.prepare(element_html, data)
    symbolic_input.parse(element_html, data)

    assert "test" not in data["format_errors"]
    assert isinstance(data["submitted_answers"]["test"], dict)
    assert data["submitted_answers"]["test"]["_custom_functions"] == ["Complement"]

    symbolic_input.grade(element_html, data)
    assert data["partial_scores"]["test"]["score"] == 1


def test_legacy_custom_complement_submission_remains_readable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    legacy_json: psu.SympyJson = {
        "_type": "sympy",
        "_value": "Complement(x)",
        "_variables": ["x"],
        "_custom_functions": ["Complement"],
    }
    element_html = build_element_html(
        'allow-sets="true"',
        'variables="x"',
        'custom-functions="Complement"',
    )
    data = make_question_data(
        submitted_answers={"test": legacy_json},
        raw_submitted_answers={"test": "Complement(x)"},
        correct_answers={"test": legacy_json},
        panel="submission",
        editable=False,
    )

    symbolic_input.prepare(element_html, data)
    symbolic_input.render(element_html, data)
    symbolic_input.grade(element_html, data)

    assert data["partial_scores"]["test"]["score"] == 1


@pytest.mark.parametrize("operator", ["|", "&"])
def test_legacy_scalar_set_operator_submission_remains_readable(
    monkeypatch: pytest.MonkeyPatch, operator: str
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    legacy_json: psu.SympyJson = {
        "_type": "sympy",
        "_value": f"x {operator} y",
        "_variables": ["x", "y"],
    }
    element_html = build_element_html(
        'allow-sets="true"',
        'display-simplified-expression="false"',
        'variables="x,y"',
    )
    data = make_question_data(
        submitted_answers={"test": legacy_json},
        raw_submitted_answers={"test": f"x {operator} y"},
        correct_answers={"test": legacy_json},
        panel="submission",
        editable=False,
    )

    symbolic_input.render(element_html, data)
    symbolic_input.grade(element_html, data)

    assert data["partial_scores"]["test"]["score"] == 1


def test_legacy_boolean_expressions_are_graded_by_symbolic_equivalence() -> None:
    correct_answer: psu.SympyJson = {
        "_type": "sympy",
        "_value": "x | (y & z)",
        "_variables": ["x", "y", "z"],
    }
    submitted_answer: psu.SympyJson = {
        "_type": "sympy",
        "_value": "(x | y) & (x | z)",
        "_variables": ["x", "y", "z"],
    }
    element_html = build_element_html(
        'allow-sets="true"',
        'display-simplified-expression="false"',
        'variables="x,y,z"',
    )
    data = make_question_data(
        submitted_answers={"test": submitted_answer},
        correct_answers={"test": correct_answer},
    )

    symbolic_input.grade(element_html, data)

    assert data["partial_scores"]["test"]["score"] == 1


def test_additional_simplifications_cannot_be_used_with_set_notation() -> None:
    element_html = build_element_html(
        'allow-sets="true"',
        'additional-simplifications="expand"',
        'correct-answer="1"',
    )
    data = make_question_data(submitted_answers={"test": "1"})

    with pytest.raises(
        ValueError, match=(r"'additional-simplifications'.*'allowed-types'")
    ):
        symbolic_input.prepare(element_html, data)
