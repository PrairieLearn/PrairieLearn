import re
import string

import prairielearn.sympy_utils as psu
import pytest
import sympy
from prairielearn.internal import symbolic_input


def _normalize_symbolic_input(
    text: str,
    *,
    formula_editor: bool = False,
    allow_sets: bool = False,
) -> symbolic_input.SourceText:
    return symbolic_input.normalize_symbolic_input(
        text,
        ["alpha", "x", "y", "j"],
        [],
        formula_editor=formula_editor,
        latex=None,
        allow_trig_functions=True,
        allow_complex=False,
        allow_sets=allow_sets,
    )


def _format_absolute_values(submission: str, *, allow_sets: bool = False) -> str:
    source = symbolic_input.SourceText.from_text(
        submission.replace(
            "∣",  # ruff:ignore[ambiguous-unicode-character-string]
            "|",
        )
    )
    return symbolic_input._convert_absolute_values_source(
        source, allow_sets=allow_sets
    ).text


def _format_formula_editor_submission(
    submission: str,
    variables: list[str],
    custom_functions: list[str],
    *,
    allow_trig: bool,
) -> str:
    source = psu._normalize_unicode_source(
        symbolic_input.SourceText.from_text(submission), formula_editor=True
    )
    return symbolic_input._format_formula_editor_source(
        source,
        variables,
        custom_functions,
        allow_trig_functions=allow_trig,
    ).text


def _serialize_symbolic_submission_with_round_trip(
    expr: psu.SympyValue,
    *,
    allow_complex: bool,
    allow_sets: bool,
    simplify_expression: bool,
) -> psu.SympyJson:
    result = psu.sympy_to_json(
        expr,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
    )
    psu.json_to_sympy(
        result,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        simplify_expression=simplify_expression,
    )
    return result


@pytest.mark.parametrize(
    ("submission", "expected"),
    [
        ("|x|", "abs(x)"),
        ("||x|+y|", "abs(abs(x)+y)"),
        ("|a| + |b|", "abs(a) + abs(b)"),
        ("|||x|||", "abs(abs(abs(x)))"),
        ("x+y", "x+y"),
        ("|x+2|", "abs(x+2)"),
        ("|-x+2|", "abs(-x+2)"),
        ("|x!|", "abs(x!)"),
        ("|+4|", "abs(+4)"),
        ("|x + |y||", "abs(x + abs(y))"),
        ("|x+|-x+1+2+3+4||", "abs(x+abs(-x+1+2+3+4))"),
        ("|x+|x+1+2+3+4 ||", "abs(x+abs(x+1+2+3+4 ))"),
        ("", ""),
        ("2\u2223x\u2223", "2abs(x)"),
    ],
)
def test_format_absolute_values(submission: str, expected: str) -> None:
    assert _format_absolute_values(submission) == expected


@pytest.mark.parametrize(
    ("submission", "expected"),
    [
        ("{1} | {2}", "{1} | {2}"),
        ("{1, 2} | {3}", "{1, 2} | {3}"),
        ("[1, 2] | [3, 4]", "[1, 2] | [3, 4]"),
        ("|x| | {1}", "abs(x) | {1}"),
        ("[0,1] | (2,3) | [4,5]", "[0,1] | (2,3) | [4,5]"),
        ("(0,1) | (2,3)", "(0,1) | (2,3)"),
        ("{1} | (2,3) | [4,5]", "{1} | (2,3) | [4,5]"),
    ],
)
def test_format_absolute_values_preserves_set_union(
    submission: str, expected: str
) -> None:
    assert _format_absolute_values(submission, allow_sets=True) == expected


@pytest.mark.parametrize(
    ("submission", "allow_trig", "variables", "custom_functions", "expected"),
    [
        ("Α", False, ["Α"], [], " Alpha "),  # ruff:ignore[ambiguous-unicode-character-string]
        ("ΑΑ0Α0ΑΑ", False, ["Α", "Α0"], [], " Alpha  Alpha0 Alpha0 Alpha  Alpha "),  # ruff:ignore[ambiguous-unicode-character-string]
        (
            "t h e t a s i n t h e t a c o s t h e t a",
            True,
            ["theta"],
            [],
            "theta sin theta cos theta",
        ),
        (
            "a b a b l a b l a b l a a b l a",
            False,
            ["bla", "abla", "ab"],
            [],
            "ab abla bla bla abla",
        ),
        ("a b a b", False, ["ab", "aba"], [], "aba b"),
        ("a b c a b d", False, ["ab", "abc"], [], "abc ab d"),
        (
            "a b " * 1000,
            False,
            ["ab", *list(string.ascii_lowercase)[2:]],
            [],
            "ab " * 1000,
        ),
        ("s i n ( x )", True, ["x"], [], "sin ( x )"),
        ("s i n h ( s i n x )", True, ["x"], [], "sinh ( sin x )"),
        ("s i n ( x )", False, ["x"], [], "s i n ( x )"),
        ("s i n ( Α )", False, ["Α"], [], "s i n (  Alpha  )"),  # ruff:ignore[ambiguous-unicode-character-string]
        ("t i m e + x", True, ["time", "x"], [], "time + x"),
        ("a c o s h ( a c o s ( x ) )", True, ["x"], [], "acosh ( acos ( x ) )"),
        ("x2+x10", False, ["x"], [], "x 2+x 10"),
        ("e^x2", False, ["x"], [], "e^x 2"),
        ("m y f u n ( x )", False, ["x"], ["myfun"], "myfun ( x )"),
        ("f2(x) + x2", False, ["x"], ["f2"], "f2(x) + x 2"),
        ("Α(x) + x2", False, ["x"], ["Α"], " Alpha (x) + x 2"),  # ruff:ignore[ambiguous-unicode-character-string]
        ("x2 + x2 + f2(x)", False, ["x"], ["f2"], "x 2 + x 2 + f2(x)"),
        ("{:s i n ( x ):}", True, ["x"], [], "sin ( x )"),
        ("l n 4 * c o t (9x)", True, ["x"], [], "ln (4) * cot (9x)"),
        ("s i n c o s x * x", True, ["x"], [], "sin (cos x) * x"),
        ("l n 4 / x", False, ["x"], [], "ln 4 / x"),
        ("2 -: x", False, ["x"], [], "2 / x"),
        ("2 ** x", False, ["x"], [], "2 * x"),
        ("2 ** ** x", False, ["x"], [], "2 * ** x"),
        ("l n 4 *** x", False, ["x"], [], "ln 4 *** x"),
        ("2+-a -: x", False, ["a"], [], "2+-a / x"),
    ],
)
def test_format_formula_editor_submission(
    submission: str,
    variables: list[str],
    custom_functions: list[str],
    expected: str,
    *,
    allow_trig: bool,
) -> None:
    assert (
        _format_formula_editor_submission(
            submission,
            variables,
            custom_functions,
            allow_trig=allow_trig,
        )
        == expected
    )


@pytest.mark.parametrize(
    ("submission", "latex", "expected"),
    [
        ("2+-a+-b", r"2\pm a+-b", "2±a+-b"),
        (
            "(a+-b)+-sqrt(a+-b)",
            r"\left(a+-b\right)\pm\sqrt{a+-b}",
            "(a+-b)±sqrt(a+-b)",
        ),
        ("a+-b+-c", r"a+{-b}\pm c", "a+-b±c"),
        ("2+-a", "2+-a", "2+-a"),
        ("2+-a", r"2\pm a\pm b", None),
        ("2+-a+-b", "2+-a", None),
    ],
)
def test_restore_plus_minus(submission: str, latex: str, expected: str | None) -> None:
    source = symbolic_input._restore_plus_minus_source(
        symbolic_input.SourceText.from_text(submission), latex
    )
    assert (None if source is None else source.text) == expected


def test_format_formula_editor_deeply_nested_bare_arguments() -> None:
    depth = 1200
    submission = "s i n 2(" * depth + "x" + " * y)" * depth + " * z"
    expected = "sin (2(" * depth + "x" + " * y))" * depth + " * z"
    assert (
        _format_formula_editor_submission(
            submission, ["x", "y", "z"], [], allow_trig=True
        )
        == expected
    )


@pytest.mark.parametrize(
    ("text", "formula_editor", "expected_text", "expected_offsets"),
    [
        (
            "2×α^2",  # ruff:ignore[ambiguous-unicode-character-string]
            False,
            "2*alpha**2",
            (0, 1, 2, 2, 2, 2, 2, 3, 3, 4),
        ),
        (
            "{:s i n 2 * x:}",
            True,
            "sin (2) * x",
            (2, 4, 6, 7, 8, 8, 8, 9, 10, 11, 12),
        ),
        (
            "∣x∣^2 + 2e+3 + 3j",  # ruff:ignore[ambiguous-unicode-character-string]
            False,
            "abs(x)**2 + 2*e+3 + 3*j",
            (
                0,
                0,
                0,
                0,
                1,
                2,
                3,
                3,
                4,
                5,
                6,
                7,
                8,
                9,
                9,
                10,
                11,
                12,
                13,
                14,
                15,
                16,
                16,
            ),
        ),
        ("2 -: x", True, "2 / x", (0, 1, 2, 4, 5)),
        ("2 ** x", True, "2 * x", (0, 1, 2, 4, 5)),
        ("x2", True, "x 2", (0, 1, 1)),
    ],
)
def test_symbolic_input_normalization_preserves_source_offsets(
    text: str,
    *,
    formula_editor: bool,
    expected_text: str,
    expected_offsets: tuple[int, ...],
) -> None:
    source = _normalize_symbolic_input(text, formula_editor=formula_editor)
    assert source.raw_text == text
    assert source.text == expected_text
    assert tuple(token.raw_offset for token in source.tokens) == expected_offsets


def test_symbolic_input_normalization_combines_stages_in_order() -> None:
    raw = "∣l n 2 * x∣^2 + 2e+3 + 3j"  # ruff:ignore[ambiguous-unicode-character-string]
    source = _normalize_symbolic_input(raw, formula_editor=True)
    assert source.text == "abs(ln (2) * x)**2 + 2*e+3 + 3*j"

    result = symbolic_input._try_parse_normalized_source_as_sympy(
        source,
        ["x", "j"],
        allow_hidden=True,
    )
    assert isinstance(result, psu.SympyParseSuccess)
    x, j = sympy.symbols("x j")
    assert result.expr == sympy.Abs(sympy.log(2) * x) ** 2 + 2 * sympy.E + 3 + 3 * j


def test_formula_editor_does_not_merge_normalized_unicode_multiplication() -> None:
    result = symbolic_input.try_normalize_symbolic_input(
        "2 ×* x",  # ruff:ignore[ambiguous-unicode-character-string]
        ["x"],
        [],
        formula_editor=True,
        latex=None,
        allow_trig_functions=False,
        allow_complex=False,
        allow_sets=False,
    )
    assert isinstance(result, psu.SympyParseFailure)
    assert "invalid expression" in result.error
    assert "<pre>2 ×* x\n  ^" in result.error  # ruff:ignore[ambiguous-unicode-character-string]


def test_symbolic_input_normalization_preserves_set_unions() -> None:
    text = "[0,1] | (2,3) | [4,5]"
    source = _normalize_symbolic_input(text, allow_sets=True)
    assert source == symbolic_input.SourceText.from_text(text)


def test_parse_symbolic_submission_serializes_result() -> None:
    result = symbolic_input.try_parse_symbolic_submission(
        "|x|",
        ["x"],
    )
    assert isinstance(result, symbolic_input.SymbolicSubmissionParseSuccess)
    assert result.expr == sympy.Abs(sympy.Symbol("x"))
    assert result.expr != ""
    assert result.json != ""
    assert result.json == psu.sympy_to_json(result.expr)
    assert psu.json_to_sympy(result.json) == result.expr


def test_parse_symbolic_submission_does_not_reparse_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_json_parse(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("submission JSON should not be reparsed")

    monkeypatch.setattr(psu, "json_to_sympy", fail_json_parse)

    result = symbolic_input.try_parse_symbolic_submission("x + 1", ["x"])

    assert isinstance(result, symbolic_input.SymbolicSubmissionParseSuccess)


@pytest.mark.parametrize("simplify_expression", [True, False])
@pytest.mark.parametrize(
    ("expr", "allow_complex", "allow_sets", "legacy_error"),
    [
        (sympy.Symbol("x") + sympy.Rational(1, 2), False, False, None),
        (sympy.I, True, False, None),
        (sympy.zoo, False, False, None),
        (sympy.nan, False, False, None),
        (sympy.Max(sympy.Symbol("x"), 1), False, False, None),
        (sympy.Min(sympy.Symbol("x"), 1), False, False, None),
        (sympy.Function("f")(sympy.Symbol("x")), False, False, None),
        (sympy.EmptySet, False, True, None),
        (sympy.FiniteSet(sympy.Interval(0, 1)), False, True, None),
        (
            sympy.Union(sympy.Interval(0, 1), sympy.Interval(2, 3)),
            False,
            True,
            None,
        ),
        (
            sympy.Intersection(
                sympy.Interval(0, 2), sympy.Interval(1, 3), evaluate=False
            ),
            False,
            True,
            None,
        ),
        (
            sympy.Complement(sympy.Interval(0, 2), sympy.FiniteSet(sympy.Symbol("x"))),
            False,
            True,
            None,
        ),
        (sympy.S.Reals, False, True, None),
        (sympy.Set(sympy.Symbol("Reals")), False, True, None),
        (sympy.Float("1.25"), False, False, psu.HasFloatError),
        (
            sympy.AccumBounds(-1, 1),
            False,
            False,
            psu.HasInvalidFunctionError,
        ),
        (
            sympy.cot(sympy.oo, evaluate=False),
            False,
            False,
            psu.HasInvalidFunctionError,
        ),
        (
            sympy.Derivative(sympy.Function("f")(sympy.Symbol("x")), sympy.Symbol("x")),
            False,
            False,
            psu.HasInvalidFunctionError,
        ),
    ],
)
def test_symbolic_submission_validation_matches_json_round_trip(
    expr: psu.SympyValue,
    *,
    allow_complex: bool,
    allow_sets: bool,
    legacy_error: type[Exception] | None,
    simplify_expression: bool,
) -> None:
    if legacy_error is None:
        expected = _serialize_symbolic_submission_with_round_trip(
            expr,
            allow_complex=allow_complex,
            allow_sets=allow_sets,
            simplify_expression=simplify_expression,
        )
        assert (
            symbolic_input._serialize_symbolic_submission(
                expr,
                allow_complex=allow_complex,
                allow_sets=allow_sets,
            )
            == expected
        )
    else:
        with pytest.raises(legacy_error):
            _serialize_symbolic_submission_with_round_trip(
                expr,
                allow_complex=allow_complex,
                allow_sets=allow_sets,
                simplify_expression=simplify_expression,
            )
        with pytest.raises(symbolic_input._UnsupportedSympyJsonNodeError):
            symbolic_input._serialize_symbolic_submission(
                expr,
                allow_complex=allow_complex,
                allow_sets=allow_sets,
            )


@pytest.mark.parametrize(
    ("submission", "simplify_expression"),
    [("sin(infty)", True), ("cot(infty)", False)],
)
def test_parse_symbolic_submission_rejects_accumulation_bounds(
    submission: str, *, simplify_expression: bool
) -> None:
    result = symbolic_input.try_parse_symbolic_submission(
        submission,
        [],
        simplify_expression=simplify_expression,
    )

    assert isinstance(result, psu.SympyParseFailure)
    assert "simplifies to a range of possible values, which is not supported" in (
        result.error
    )


def test_parse_symbolic_submission_rejects_other_unsupported_nodes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    x = sympy.Symbol("x")

    def return_derivative(*_args: object, **_kwargs: object) -> psu.SympyParseResult:
        return psu.SympyParseSuccess(sympy.Derivative(sympy.Function("f")(x), x))

    monkeypatch.setattr(
        symbolic_input,
        "_try_parse_normalized_source_as_sympy",
        return_derivative,
    )

    result = symbolic_input.try_parse_symbolic_submission("x", ["x"])

    assert isinstance(result, psu.SympyParseFailure)
    assert "contains an unsupported expression" in result.error


@pytest.mark.parametrize(
    ("caret_spec", "variables", "expected_message"),
    [
        ("2 + !sin", [], 'mentions the function "sin"'),
        ("x ++!* 2", ["x"], "syntax error"),
        (
            "x + !α",  # ruff:ignore[ambiguous-unicode-character-string]
            ["x"],
            'invalid symbol "α"',  # ruff:ignore[ambiguous-unicode-character-string]
        ),
        ("|!sin|", [], 'mentions the function "sin"'),
    ],
)
def test_parse_errors_point_to_raw_submission(
    caret_spec: str,
    variables: list[str],
    expected_message: str,
) -> None:
    raw_index = caret_spec.index("!")
    submission = caret_spec.replace("!", "")
    result = symbolic_input.try_parse_symbolic_submission(submission, variables)
    assert isinstance(result, psu.SympyParseFailure)
    assert expected_message in result.error
    match = re.search(r"<pre>(.*?)</pre>", result.error, re.DOTALL)
    assert match is not None
    assert match.group(1) == psu.point_to_error(submission, raw_index)
