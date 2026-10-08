import importlib
from pathlib import Path
from typing import Any

import lxml.html
import prairielearn.sympy_utils as psu
import pytest
import sympy

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
    submission = "s i n 2(" * depth + "x" + " * y)" * depth + " * z"
    element_html = build_element_html('variables="x,y,z"', 'formula-editor="true"')
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


def test_formula_editor_initial_value_respects_display_log_as_ln(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(Path(__file__).parent)
    element_html = build_element_html(
        'variables="x"',
        'formula-editor="true"',
        'display-log-as-ln="true"',
        'initial-value="log(x)"',
    )
    data = make_question_data()

    symbolic_input.prepare(element_html, data)
    rendered = symbolic_input.render(element_html, data)

    assert "\\ln{\\left(x \\right)}" in rendered
    assert "\\log{\\left(x \\right)}" not in rendered


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
