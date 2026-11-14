import re

import prairielearn.sympy_utils as psu
import pytest
import sympy
from prairielearn.internal import set_expression


def _caret_template(template: str) -> tuple[str, str]:
    match template.split("!", maxsplit=2):
        case [left, right]:
            expression = left + right
            return expression, psu.point_to_error(expression, len(left))
        case _:
            raise pytest.UsageError("caret template must have exactly one marker")


def parse_success(
    submission: str,
    variables: list[str] | None = None,
    *,
    syntax: set_expression.SetSyntax = set_expression.SetSyntax.INTERVAL,
) -> set_expression.SetParseSuccess:
    result = set_expression.try_parse_set_submission(
        submission, variables or [], syntax=syntax
    )
    assert isinstance(result, set_expression.SetParseSuccess)
    return result


@pytest.mark.parametrize(
    ("submission", "expected"),
    [
        ("{}", sympy.S.EmptySet),
        ("{1, 2, x + 1}", sympy.FiniteSet(1, 2, sympy.Symbol("x") + 1)),
        ("[0, 1)", sympy.Interval.Ropen(0, 1)),
        ("(0, 1)", sympy.Interval.open(0, 1)),
        (
            "[0, 1] U (2, 3)",
            sympy.Union(sympy.Interval(0, 1), sympy.Interval.open(2, 3)),
        ),
        (
            "[0, 1] cup (2, 3)",
            sympy.Union(sympy.Interval(0, 1), sympy.Interval.open(2, 3)),
        ),
        (
            "[0, 1] ∪ (2, 3)",  # ruff:ignore[ambiguous-unicode-character-string]
            sympy.Union(sympy.Interval(0, 1), sympy.Interval.open(2, 3)),
        ),
        (
            "[0, 1] | (2, 3)",
            sympy.Union(sympy.Interval(0, 1), sympy.Interval.open(2, 3)),
        ),
        (
            "[0, 1] + (2, 3)",
            sympy.Union(sympy.Interval(0, 1), sympy.Interval.open(2, 3)),
        ),
        ("R cap Q", sympy.Intersection(sympy.S.Reals, sympy.S.Rationals)),
        ("R ∩ Q", sympy.Intersection(sympy.S.Reals, sympy.S.Rationals)),
        ("R & Q", sympy.Intersection(sympy.S.Reals, sympy.S.Rationals)),
        ("R - Q", sympy.Complement(sympy.S.Reals, sympy.S.Rationals)),
        ("{{1}, {2}}", sympy.FiniteSet(sympy.FiniteSet(1), sympy.FiniteSet(2))),
    ],
)
def test_set_syntax(submission: str, expected: sympy.Set) -> None:
    result = parse_success(submission, ["x"])
    assert result.expr.doit(deep=True) == expected
    assert psu.json_to_sympy(result.json, allow_sets=True).doit(deep=True) == expected


@pytest.mark.parametrize(
    ("submission", "expected"),
    [
        ("R", sympy.S.Reals),
        ("Q", sympy.S.Rationals),
        ("Z", sympy.S.Integers),
        ("N", sympy.S.Naturals),
        ("C", sympy.S.Complexes),
    ],
)
def test_named_sets(submission: str, expected: sympy.Set) -> None:
    result = parse_success(submission)
    assert result.expr is expected
    assert psu.json_to_sympy(result.json, allow_sets=True) is expected


def test_named_sets_round_trip_through_json_deserialization() -> None:
    stored = psu.SympyJson(
        _type="sympy",
        _value="Union(Reals, Rationals)",
        _variables=[],
    )
    assert psu.json_to_sympy(stored, allow_sets=True) == sympy.S.Reals


@pytest.mark.parametrize(
    ("submission", "expected"),
    [
        (
            "{(1, 2), (x + 1, sin(y), pi)}",
            sympy.FiniteSet(
                sympy.Tuple(1, 2),
                sympy.Tuple(
                    sympy.Symbol("x") + 1,
                    sympy.sin(sympy.Symbol("y")),
                    sympy.pi,
                ),
            ),
        ),
        (
            "{(1, 2)} U {(3, 4)}",
            sympy.FiniteSet(sympy.Tuple(1, 2), sympy.Tuple(3, 4)),
        ),
        (
            "{{(1, 2)}, {(3, 4)}}",
            sympy.FiniteSet(
                sympy.FiniteSet(sympy.Tuple(1, 2)),
                sympy.FiniteSet(sympy.Tuple(3, 4)),
            ),
        ),
    ],
)
def test_tuple_syntax_is_default(submission: str, expected: sympy.Set) -> None:
    result = set_expression.try_parse_set_submission(submission, ["x", "y"])

    assert isinstance(result, set_expression.SetParseSuccess)
    assert result.expr.doit(deep=True) == expected
    assert psu.json_to_sympy(result.json, allow_sets=True).doit(deep=True) == expected


@pytest.mark.parametrize("submission", ["[0, 1]", "[0, 1)", "(0, 1]"])
def test_tuple_syntax_rejects_intervals(submission: str) -> None:
    result = set_expression.try_parse_set_submission(submission, [])

    assert isinstance(result, set_expression.SetParseFailure)
    assert "Interval notation is not allowed" in result.error


@pytest.mark.parametrize("submission", ["(1, 2)", "{()}", "{(1,)}"])
def test_tuple_syntax_requires_a_set_of_two_or_more_coordinates(
    submission: str,
) -> None:
    result = set_expression.try_parse_set_submission(submission, [])

    assert isinstance(result, set_expression.SetParseFailure)


def test_interval_syntax_rejects_tuple_arity() -> None:
    result = set_expression.try_parse_set_submission(
        "{(1, 2, 3)}", [], syntax=set_expression.SetSyntax.INTERVAL
    )

    assert isinstance(result, set_expression.SetParseFailure)
    assert "exactly two endpoints" in result.error


@pytest.mark.parametrize("name", ["R", "Q", "Z", "N", "C"])
def test_named_sets_are_reserved(name: str) -> None:
    with pytest.raises(ValueError, match="Named sets cannot be used as variable names"):
        set_expression.validate_names([name], [])
    with pytest.raises(
        ValueError, match="Named sets cannot be used as custom function names"
    ):
        set_expression.validate_names([], [name])


@pytest.mark.parametrize(
    "submission",
    [
        "x + 1",
        "Interval(0, 1)",
        "FiniteSet(1, 2)",
        "Reals",
        "R.foo",
    ],
)
def test_rejects_non_set_and_constructor_syntax(submission: str) -> None:
    result = set_expression.try_parse_set_submission(submission, ["x"])
    assert isinstance(result, set_expression.SetParseFailure)


@pytest.mark.parametrize(
    "caret_template",
    [
        "{1, 2!",
        "{1,!, 2}",
        "[0 1!)",
        "[0,!]",
        "[0, 1!",
        "[0, 1!}",
        "!U R",
        "R U!",
        "{x^2} U !U Q",
        "R !* Q",
        "(R U Q!",
        "R U Q!)",
    ],
)
def test_syntax_error_caret_output(caret_template: str) -> None:
    submission, expected_caret = _caret_template(caret_template)
    result = set_expression.try_parse_set_submission(
        submission, [], syntax=set_expression.SetSyntax.INTERVAL
    )
    assert isinstance(result, set_expression.SetParseFailure)
    match = re.search(r"<code>(.*?)</code>", result.error, re.DOTALL)
    assert match is not None
    assert match.group(1) == expected_caret


def test_scalar_members_use_symbolic_parser_configuration() -> None:
    result = set_expression.try_parse_set_submission(
        "{f(x), sin(x), i}",
        ["x"],
        allow_complex=True,
        custom_functions=["f"],
    )
    assert isinstance(result, set_expression.SetParseSuccess)
    assert result.expr == sympy.FiniteSet(
        sympy.Function("f")("x"), sympy.sin(sympy.Symbol("x")), sympy.I
    )


def test_formula_editor_normalization_preserves_set_syntax() -> None:
    result = set_expression.try_parse_set_submission(
        "[0, 1] U (2, 3)",
        [],
        formula_editor=True,
        syntax=set_expression.SetSyntax.INTERVAL,
    )
    assert isinstance(result, set_expression.SetParseSuccess)
    assert result.expr.doit(deep=True) == sympy.Union(
        sympy.Interval(0, 1), sympy.Interval.open(2, 3)
    )


def test_formula_editor_normalization_preserves_scalar_spans() -> None:
    result = set_expression.try_parse_set_submission(
        "{s i n ( x )}",
        ["x"],
        formula_editor=True,
    )
    assert isinstance(result, set_expression.SetParseSuccess)
    assert result.expr == sympy.FiniteSet(sympy.sin(sympy.Symbol("x")))


@pytest.mark.parametrize(
    "value",
    [
        sympy.Range(5),
        sympy.ConditionSet(sympy.Symbol("x"), sympy.Symbol("x") > 0),
        sympy.ImageSet(
            sympy.Lambda(sympy.Symbol("x"), sympy.Symbol("x") + 1), sympy.S.Integers
        ),
        sympy.ProductSet(sympy.S.Integers, sympy.S.Integers),
        sympy.S.UniversalSet,
    ],
)
def test_rejects_unrepresentable_correct_answer_classes(value: sympy.Set) -> None:
    assert not set_expression.is_representable_set(
        value, syntax=set_expression.SetSyntax.INTERVAL
    )


def test_accepts_representable_correct_answer_classes() -> None:
    value = sympy.Union(
        sympy.Interval(0, 1),
        sympy.Complement(sympy.S.Reals, sympy.FiniteSet(2), evaluate=False),
        evaluate=False,
    )
    assert set_expression.is_representable_set(
        value, syntax=set_expression.SetSyntax.INTERVAL
    )


def test_representable_sets_follow_syntax() -> None:
    point_set = sympy.FiniteSet(sympy.Tuple(1, 2))
    interval = sympy.Interval(0, 1)

    assert set_expression.is_representable_set(point_set)
    assert not set_expression.is_representable_set(
        point_set, syntax=set_expression.SetSyntax.INTERVAL
    )
    assert not set_expression.is_representable_set(interval)
    assert set_expression.is_representable_set(
        interval, syntax=set_expression.SetSyntax.INTERVAL
    )
