from typing import Callable, List, Tuple

import python_helper_sympy as phs
import sympy

BigOGradingFunctionT = Callable[[str, str, List[str]], Tuple[float, str]]

TYPE_ERROR_FEEDBACK = (
    "Your answer could not be processed by the autograder. Did you divide by 0?"
)
CORRECT_UNCONDITIONAL_FEEDBACK = "Correct!"
CORRECT_COMPLEX_FEEDBACK = (
    "Correct! Note that your expression may be unnecessarily complex."
)
NEGATIVE_FEEDBACK = "Your expression is negative."
INCORRECT_FEEDBACK = "Your answer is incorrect."
TOO_LOOSE_FEEDBACK = "Your answer is correct, but too loose."
LOWER_ORDER_TERMS_FEEDBACK = (
    "Your answer is correct, but you have unnecessary lower order terms."
)
CONSTANT_FACTORS_FEEDBACK = (
    "Your answer is correct but has unncessary constant factors."
)

THETA_CONSTANT_FACTORS_FEEDBACK = (
    "Incorrect, your answer has unnecessary constant factors."
)
THETA_LOWER_ORDER_TERMS_FEEDBACK = (
    "Incorrect, your answer has unnecessary lower order terms."
)


def grade_o_expression(
    a_true: str, a_sub: str, variables: List[str]
) -> Tuple[float, str]:
    sym_true, sym_true_source = phs.convert_string_to_sympy_with_source(
        a_true, variables, allow_complex=False, allow_trig_functions=False
    )

    sym_sub, sym_sub_source = phs.convert_string_to_sympy_with_source(
        a_sub, variables, allow_complex=False, allow_trig_functions=False
    )

    if sym_true_source == sym_sub_source:
        return (1, CORRECT_UNCONDITIONAL_FEEDBACK)

    try:
        if sym_true.equals(sym_sub):
            return (1.0, CORRECT_COMPLEX_FEEDBACK)

        elif sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(
            0
        ):
            return (0.0, NEGATIVE_FEEDBACK)

        L = sympy.limit(
            sympy.simplify(sym_true / sym_sub), sympy.Symbol(variables[0]), sympy.oo
        )

        if L < sympy.sympify(0):
            return (0.0, NEGATIVE_FEEDBACK)
        elif L == sympy.oo:
            return (0.0, INCORRECT_FEEDBACK)
        elif L == sympy.sympify(0):
            return (0.25, TOO_LOOSE_FEEDBACK)
        elif L == sympy.sympify(1):
            return (0.5, LOWER_ORDER_TERMS_FEEDBACK)

        return (0.5, CONSTANT_FACTORS_FEEDBACK)
    except TypeError:
        return (0.0, TYPE_ERROR_FEEDBACK)


def grade_theta_expression(
    a_true: str, a_sub: str, variables: List[str]
) -> Tuple[float, str]:
    sym_true, sym_true_source = phs.convert_string_to_sympy_with_source(
        a_true, variables, allow_complex=False, allow_trig_functions=False
    )

    sym_sub, sym_sub_source = phs.convert_string_to_sympy_with_source(
        a_sub, variables, allow_complex=False, allow_trig_functions=False
    )

    if sym_true_source == sym_sub_source:
        return (1, CORRECT_UNCONDITIONAL_FEEDBACK)

    try:
        if sym_true.equals(sym_sub):
            return (1.0, CORRECT_COMPLEX_FEEDBACK)

        elif sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(
            0
        ):
            return (0.0, NEGATIVE_FEEDBACK)

        omega_L = sympy.limit(
            sympy.simplify(sym_sub / sym_true), sympy.Symbol(variables[0]), sympy.oo
        )
        bigo_L = sympy.limit(
            sympy.simplify(sym_true / sym_sub), sympy.Symbol(variables[0]), sympy.oo
        )

        if omega_L < sympy.sympify(0) or bigo_L < sympy.sympify(0):
            return (0.0, NEGATIVE_FEEDBACK)
        elif omega_L == sympy.oo or bigo_L == sympy.oo:
            return (0.0, INCORRECT_FEEDBACK)
        elif omega_L == sympy.sympify(1) and bigo_L == sympy.sympify(1):
            return (0.25, THETA_LOWER_ORDER_TERMS_FEEDBACK)

        return (0.25, THETA_CONSTANT_FACTORS_FEEDBACK)
    except TypeError:
        return (0.0, TYPE_ERROR_FEEDBACK)


def grade_omega_expression(
    a_true: str, a_sub: str, variables: List[str]
) -> Tuple[float, str]:
    sym_true, sym_true_source = phs.convert_string_to_sympy_with_source(
        a_true, variables, allow_complex=False, allow_trig_functions=False
    )

    sym_sub, sym_sub_source = phs.convert_string_to_sympy_with_source(
        a_sub, variables, allow_complex=False, allow_trig_functions=False
    )

    if sym_true_source == sym_sub_source:
        return (1, CORRECT_UNCONDITIONAL_FEEDBACK)

    try:
        if sym_true.equals(sym_sub):
            return (1, CORRECT_COMPLEX_FEEDBACK)

        elif sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(
            0
        ):
            return (0.0, NEGATIVE_FEEDBACK)

        L = sympy.limit(
            sympy.simplify(sym_true / sym_sub), sympy.Symbol(variables[0]), sympy.oo
        )

        if L < sympy.sympify(0):
            return (0.0, NEGATIVE_FEEDBACK)
        elif L == sympy.oo:
            return (0.25, TOO_LOOSE_FEEDBACK)
        elif L == sympy.sympify(0):
            return (0.0, INCORRECT_FEEDBACK)
        elif L == sympy.sympify(1):
            return (0.5, LOWER_ORDER_TERMS_FEEDBACK)

        return (0.5, CONSTANT_FACTORS_FEEDBACK)
    except TypeError:
        return (0.0, TYPE_ERROR_FEEDBACK)
