from dataclasses import dataclass, fields, is_dataclass
from tokenize import TokenError
from typing import Any, Literal, cast

import prairielearn.sympy_utils as psu
import pytest
import sympy
from prairielearn.internal import sympy_evaluation, sympy_source
from prairielearn.internal.sympy_expression import parse_and_evaluate


# This differential-oracle suite is temporary. PR #16069 removes it when the grammar
# evaluator replaces the legacy evaluation path.
@dataclass(frozen=True, slots=True)
class _OracleCase:
    expression: str
    variables: tuple[str, ...] = ("m", "n", "x", "y")
    custom_functions: tuple[str, ...] = ()
    allow_hidden: bool = False
    allow_complex: bool = False
    allow_sets: bool = False
    allow_trig_functions: bool = True
    allow_extra_symbols: bool = False
    assumptions: psu.AssumptionsDictT | None = None
    simplification: Literal["both", "enabled"] = "both"


@dataclass(frozen=True, slots=True)
class _OracleOutcome:
    accepted: bool
    exception: tuple[Any, ...] | None = None
    result_type: type[sympy.Basic] | None = None
    structure: str | None = None
    serialized: psu.SympyJson | None = None


_ORACLE_CASES = (
    _OracleCase("2x + sin x"),
    _OracleCase("n log^2 2n"),
    _OracleCase("n/(7*7*3)"),
    _OracleCase("(m*n + n)*m/9"),
    _OracleCase("m! + n"),
    _OracleCase("f(g(n), 1)", custom_functions=("f", "g")),
    _OracleCase("x^2", assumptions={"x": {"positive": True}}),
    _OracleCase("3jn + e^(pi*i)", allow_complex=True),
    _OracleCase("_Exp1 + _ImaginaryUnit", allow_hidden=True, allow_complex=True),
    _OracleCase("E"),
    _OracleCase("É"),
    _OracleCase("I"),
    _OracleCase("I", allow_complex=True),
    _OracleCase("Î", allow_complex=True),
    _OracleCase("Catalan"),
    _OracleCase("EulerGamma"),
    _OracleCase("GoldenRatio"),
    _OracleCase("TribonacciConstant"),
    _OracleCase("true"),
    _OracleCase("false"),
    _OracleCase("{}", allow_sets=True),
    _OracleCase("[0, 5]", allow_sets=True),
    _OracleCase("{1, 2, 3}", allow_sets=True),
    _OracleCase("[0, 5] - {2}", allow_sets=True, simplification="enabled"),
    _OracleCase("{1, 2} cup [2, 4]", allow_sets=True, simplification="enabled"),
    _OracleCase("Reals", allow_sets=True),
    _OracleCase("Naturals0"),
    _OracleCase("Naturals0", allow_extra_symbols=True),
    _OracleCase("UniversalSet"),
    _OracleCase("UniversalSet", allow_sets=True),
    _OracleCase("UniversalSet", allow_extra_symbols=True),
    _OracleCase("FiniteSet(EmptySet, {EmptySet})", allow_sets=True),
    _OracleCase("EmptySet"),
    _OracleCase("1 and 0"),
    _OracleCase("and(x)", custom_functions=("and",)),
    _OracleCase("n**"),
    _OracleCase("sin("),
    _OracleCase("sin(1, 2)"),
    _OracleCase("atan2(1)"),
    _OracleCase("atan2(1, 2, 3)"),
    _OracleCase("sqrt(1, 2)"),
    _OracleCase("g(n, 1)"),
    _OracleCase("sin"),
    _OracleCase("sin({1})", allow_sets=True),
    _OracleCase("[{1}, 2]", allow_sets=True),
    _OracleCase("˜ + 1"),  # ruff: ignore[ambiguous-unicode-character-string]
    _OracleCase("E + z", allow_extra_symbols=True),
    _OracleCase("I", allow_extra_symbols=True),
    _OracleCase("I", allow_complex=True, allow_extra_symbols=True),
    _OracleCase(
        "Catalan + EulerGamma + GoldenRatio + TribonacciConstant",
        allow_extra_symbols=True,
    ),
    _OracleCase("pq", allow_extra_symbols=True),
    _OracleCase("你", allow_extra_symbols=True),
    _OracleCase("E + Chi", variables=("E", "Chi")),
    _OracleCase("Chi(x)", variables=("x",), custom_functions=("Chi",)),
)


def _public_error_signature(error: psu.BaseSympyError) -> tuple[Any, ...]:
    if isinstance(error, psu.FunctionNameWithoutArgumentsError):
        return "function-without-arguments", error.text
    if isinstance(error, psu.HasInvalidSymbolError):
        return "invalid-symbol", error.symbol
    if isinstance(error, psu.HasInvalidFunctionError):
        return "invalid-function", error.text
    if isinstance(error, psu.HasInvalidExpressionError):
        return ("invalid-expression",)
    if isinstance(error, psu.HasParseError):
        return ("parse",)
    if isinstance(error, psu.HasSetNotationError):
        return ("set-notation",)
    if isinstance(error, psu.HasFunctionArityError):
        return "function-arity", error.fn, error.provided, error.expected
    if isinstance(error, psu.HasArgumentTypeError):
        return (
            "argument-type",
            error.fn,
            str(error.got),
            tuple(map(str, error.allowable_types)),
            error.arg_idx,
        )
    if type(error) is psu.BaseSympyError:
        return ("evaluation-failure",)
    if not is_dataclass(error):
        return type(error), str(error)
    semantic_fields = tuple(
        (field.name, getattr(error, field.name))
        for field in fields(error)
        if field.name != "offset"
    )
    return type(error), *semantic_fields


def _diagnostic_signature(
    diagnostic: sympy_evaluation.EvaluationDiagnostic,
) -> tuple[Any, ...]:
    if isinstance(diagnostic, sympy_evaluation.FunctionWithoutArgumentsDiagnostic):
        return "function-without-arguments", diagnostic.text
    if isinstance(diagnostic, sympy_evaluation.InvalidSymbolDiagnostic):
        return "invalid-symbol", diagnostic.symbol
    if isinstance(diagnostic, sympy_evaluation.InvalidFunctionDiagnostic):
        return "invalid-function", diagnostic.text
    if isinstance(diagnostic, sympy_evaluation.InvalidExpressionDiagnostic):
        return ("invalid-expression",)
    if isinstance(diagnostic, sympy_evaluation.ParseDiagnostic):
        return ("parse",)
    if isinstance(diagnostic, sympy_evaluation.SetNotationDiagnostic):
        return ("set-notation",)
    if isinstance(diagnostic, sympy_evaluation.FunctionArityDiagnostic):
        return (
            "function-arity",
            diagnostic.function,
            diagnostic.provided,
            diagnostic.expected,
        )
    if isinstance(diagnostic, sympy_evaluation.ArgumentTypeDiagnostic):
        return (
            "argument-type",
            diagnostic.function,
            str(diagnostic.got),
            tuple(map(str, diagnostic.allowable_types)),
            diagnostic.argument_index,
        )
    return ("evaluation-failure",)


def _evaluation_context(
    locals_for_eval: psu.LocalsForEval,
    *,
    allow_complex: bool = False,
    allow_sets: bool = False,
    simplify_expression: bool = True,
    allow_extra_symbols: bool = False,
) -> sympy_evaluation.EvaluationContext:
    return sympy_evaluation.EvaluationContext.from_locals_for_eval(
        locals_for_eval,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        simplify_expression=simplify_expression,
        allow_extra_symbols=allow_extra_symbols,
    )


def _legacy_evaluate_for_oracle(
    source: sympy_source.SourceText,
    locals_for_eval: psu.LocalsForEval,
    *,
    allow_complex: bool,
    allow_sets: bool,
    simplify_expression: bool,
    allow_extra_symbols: bool,
) -> psu.SympyValue:
    """Evaluate through the retired pipeline only for differential testing."""
    local_dict = {
        key: value
        for inner_dict in locals_for_eval.values()
        for key, value in cast(psu.SympyMapT, inner_dict).items()
    }
    if allow_extra_symbols and not allow_sets:
        for domain_name in psu._SET_DOMAIN_NAMES:
            local_dict.setdefault(domain_name, sympy.Symbol(domain_name))

    global_dict = dict(psu._SYMPY_GLOBALS)
    transformations = (
        *psu.sympy_parser.standard_transformations,
        psu.sympy_parser.implicit_multiplication_application,
    )
    if allow_sets:
        transformations = (
            psu._unmangle_infix_binops_transformation(
                psu._Constants.set_operators.keys()
            ),
            psu._set_literal_transformation,
            psu._set_operation_transformation,
            psu._interval_transformation,
            *transformations,
        )
    else:
        transformations = (
            psu._err_on_transform(
                psu._interval_transformation, psu.HasSetNotationError
            ),
            *transformations,
        )

    try:
        code = psu.sympy_parser.stringify_expr(
            source.text, local_dict, global_dict, transformations
        )
    except (TokenError, IndexError) as exc:
        raise psu.HasParseError(-1) from exc

    parsed_locals: psu.LocalsForEval = {
        "functions": locals_for_eval["functions"].copy(),
        "variables": locals_for_eval["variables"].copy(),
        "helpers": locals_for_eval["helpers"].copy(),
    }
    parsed_locals["functions"].update(
        Integer=sympy.Integer,
        Symbol=sympy.Symbol,
        Float=sympy.Float,
        Interval=sympy.Interval,
        Union=sympy.Union,
        Intersection=sympy.Intersection,
    )
    parsed_locals["variables"].update(I=sympy.I, oo=sympy.oo)
    psu.ast_check_str(code, parsed_locals, allow_sets=allow_sets)

    if not simplify_expression:
        try:
            code = compile(psu.sympy_parser.evaluateFalse(code), "<string>", "eval")
        except SyntaxError as exc:
            raise psu.HasParseError(exc.offset or -1) from exc

    try:
        result = psu.sympy_parser.eval_expr(code, local_dict, global_dict)
    except (TypeError, AttributeError) as exc:
        raise psu.BaseSympyError from exc
    except Exception as exc:
        raise psu.BaseSympyError from exc

    psu.sympy_check(
        result,
        locals_for_eval,
        allow_complex=allow_complex,
        allow_sets=allow_sets,
        allow_extra_symbols=allow_extra_symbols,
    )
    return result


def _capture_oracle_outcome(
    case: _OracleCase, *, grammar: bool, simplify_expression: bool
) -> _OracleOutcome:
    locals_for_eval = psu._prepare_locals_for_eval(
        case.variables,
        allow_hidden=case.allow_hidden,
        allow_complex=case.allow_complex,
        allow_sets=case.allow_sets,
        allow_trig_functions=case.allow_trig_functions,
        custom_functions=case.custom_functions,
        assumptions=case.assumptions,
    )
    source = psu._normalize_source(
        case.expression,
        allow_complex=case.allow_complex,
        allow_sets=case.allow_sets,
    )
    try:
        if grammar:
            result = parse_and_evaluate(
                source,
                _evaluation_context(
                    locals_for_eval,
                    allow_complex=case.allow_complex,
                    allow_sets=case.allow_sets,
                    simplify_expression=simplify_expression,
                    allow_extra_symbols=case.allow_extra_symbols,
                ),
            )
            psu.sympy_check(
                result,
                locals_for_eval,
                allow_complex=case.allow_complex,
                allow_sets=case.allow_sets,
                allow_extra_symbols=case.allow_extra_symbols,
            )
        else:
            result = _legacy_evaluate_for_oracle(
                source,
                locals_for_eval,
                allow_complex=case.allow_complex,
                allow_sets=case.allow_sets,
                simplify_expression=simplify_expression,
                allow_extra_symbols=case.allow_extra_symbols,
            )
    except sympy_evaluation.ExpressionEvaluationError as exc:
        return _OracleOutcome(
            accepted=False, exception=_diagnostic_signature(exc.diagnostic)
        )
    except psu._LocalizedSympyError as exc:
        return _OracleOutcome(
            accepted=False, exception=_public_error_signature(exc.error)
        )
    except psu.BaseSympyError as exc:
        return _OracleOutcome(accepted=False, exception=_public_error_signature(exc))

    return _OracleOutcome(
        accepted=True,
        result_type=type(result),
        structure=sympy.srepr(result),
        serialized=psu.sympy_to_json(result, allow_sets=case.allow_sets),
    )


@pytest.mark.parametrize("case", _ORACLE_CASES, ids=lambda case: case.expression)
def test_grammar_evaluator_matches_legacy(case: _OracleCase) -> None:
    simplification_modes = (True, False) if case.simplification == "both" else (True,)
    for simplify_expression in simplification_modes:
        legacy = _capture_oracle_outcome(
            case,
            grammar=False,
            simplify_expression=simplify_expression,
        )
        grammar = _capture_oracle_outcome(
            case,
            grammar=True,
            simplify_expression=simplify_expression,
        )
        assert grammar == legacy


@pytest.mark.parametrize(
    ("expression", "expected_error"),
    [
        ("Chi", sympy_evaluation.FunctionWithoutArgumentsDiagnostic),
        ("叱", sympy_evaluation.FunctionWithoutArgumentsDiagnostic),
        ("Chi(x)", sympy_evaluation.InvalidFunctionDiagnostic),
        ("S", sympy_evaluation.FunctionWithoutArgumentsDiagnostic),
        ("Q", sympy_evaluation.InvalidSymbolDiagnostic),
        ("O", sympy_evaluation.FunctionWithoutArgumentsDiagnostic),
        ("EmptySequence", sympy_evaluation.InvalidSymbolDiagnostic),
        ("Id", sympy_evaluation.FunctionWithoutArgumentsDiagnostic),
        ("ord0", sympy_evaluation.InvalidSymbolDiagnostic),
    ],
)
def test_extra_symbols_reject_unsupported_sympy_globals(
    expression: str,
    expected_error: type[object],
) -> None:
    source = psu._normalize_source(expression, allow_complex=False, allow_sets=False)
    locals_for_eval = psu._prepare_locals_for_eval(())

    with pytest.raises(sympy_evaluation.ExpressionEvaluationError) as exc_info:
        parse_and_evaluate(
            source,
            _evaluation_context(locals_for_eval, allow_extra_symbols=True),
        )

    assert isinstance(exc_info.value.diagnostic, expected_error)


def test_unsimplified_set_complement_uses_current_evaluated_structure() -> None:
    locals_for_eval = psu._prepare_locals_for_eval((), allow_sets=True)
    source = psu._normalize_source("[0, 5] - {2}", allow_complex=False, allow_sets=True)
    result = parse_and_evaluate(
        source,
        _evaluation_context(
            locals_for_eval, allow_sets=True, simplify_expression=False
        ),
    )

    assert result == sympy.Union(sympy.Interval.Ropen(0, 2), sympy.Interval.Lopen(2, 5))
    assert not isinstance(result, sympy.Complement)


@pytest.mark.parametrize(
    "expression",
    [
        "x.real",
        "__import__('os')",
        "'x'",
        "lambda x: x",
        "[x for x in y]",
        "x[0]",
        "x == 1",
        "sin(x=1)",
    ],
)
def test_python_only_constructs_are_outside_the_grammar(expression: str) -> None:
    locals_for_eval = psu._prepare_locals_for_eval(("x", "y"))

    def parse() -> psu.SympyValue:
        source = psu._normalize_source(
            expression, allow_complex=False, allow_sets=False
        )
        return parse_and_evaluate(
            source,
            _evaluation_context(locals_for_eval),
        )

    with pytest.raises((
        sympy_evaluation.ExpressionEvaluationError,
        psu.BaseSympyError,
    )):
        parse()


@pytest.mark.parametrize(
    (
        "expression",
        "formula_editor",
        "allow_sets",
        "expected_start",
        "expected_end",
    ),
    [
        ("x + theta + theta", False, False, 12, 17),
        ("x + λ + λ", False, False, 8, 9),
        ("{} cup bad", False, True, 3, 6),
        ("{:x:} + bad_name", True, False, 8, 16),
        ("s i n x + bad_name", True, False, 10, 18),
    ],
)
def test_error_spans_refer_to_raw_student_source(
    expression: str,
    *,
    formula_editor: bool,
    allow_sets: bool,
    expected_start: int,
    expected_end: int,
) -> None:
    source = psu._normalize_symbolic_input(
        expression,
        ("x",),
        (),
        formula_editor=formula_editor,
        latex=None,
        allow_trig_functions=True,
        allow_complex=False,
        allow_sets=allow_sets,
    )
    locals_for_eval = psu._prepare_locals_for_eval(("x",), allow_sets=allow_sets)

    with pytest.raises(sympy_evaluation.ExpressionEvaluationError) as exc_info:
        parse_and_evaluate(
            source,
            _evaluation_context(locals_for_eval, allow_sets=allow_sets),
        )

    assert exc_info.value.span == sympy_source.SourceSpan(expected_start, expected_end)


def test_end_of_input_error_has_zero_width_span() -> None:
    source = psu._normalize_source("x +", allow_complex=False, allow_sets=False)
    locals_for_eval = psu._prepare_locals_for_eval(("x",))

    with pytest.raises(sympy_evaluation.ExpressionEvaluationError) as exc_info:
        parse_and_evaluate(
            source,
            _evaluation_context(locals_for_eval),
        )

    assert exc_info.value.span == sympy_source.SourceSpan(3, 3)
