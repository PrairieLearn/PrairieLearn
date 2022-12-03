from typing import Callable, List, Tuple
import sympy
import python_helper_sympy as phs

BigOGradingFunctionT = Callable[[str, str, List[str]], Tuple[float, str]]


def grade_big_o_expression(
    a_true: str, a_sub: str, variables: List[str]
) -> Tuple[float, str]:
    if a_true == a_sub:
        return (1, "Correct!")

    sym_true = phs.convert_string_to_sympy(
        a_true, variables, allow_complex=False, allow_trig_functions=False
    )
    sym_sub = phs.convert_string_to_sympy(
        a_sub, variables, allow_complex=False, allow_trig_functions=False
    )

    if sym_true.equals(sym_sub):
        return (1, "Correct! Note that your expression may be unnecessarily complex.")

    if sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(0):
        return (0, "Your expression is negative.")

    L = sympy.limit(sym_true / sym_sub, sympy.Symbol(variables[0]), sympy.oo)

    if L < sympy.sympify(0):
        return (0, "Your expression is negative.")
    elif L == sympy.oo:
        return (0, "Your answer is incorrect.")
    elif L == sympy.sympify(0):
        return (0.25, "Your answer is correct, but too loose.")
    elif L == sympy.sympify(1):
        return (
            0.5,
            "Your answer is correct, but you have unnecessary lower order terms.",
        )

    return (0.5, "Your answer is correct but has unncessary constant factors.")


def grade_theta_expression(
    a_true: str, a_sub: str, variables: List[str]
) -> Tuple[float, str]:
    if a_true == a_sub:
        return (1, "Correct!")

    sym_true = phs.convert_string_to_sympy(
        a_true, variables, allow_complex=False, allow_trig_functions=False
    )
    sym_sub = phs.convert_string_to_sympy(
        a_sub, variables, allow_complex=False, allow_trig_functions=False
    )

    if sym_true.equals(sym_sub):
        return (1, "Correct! Note that your expression may be unnecessarily complex.")

    if sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(0):
        return (0, "Your expression is negative.")

    omega_L = sympy.limit(sym_sub / sym_true, sympy.Symbol(variables[0]), sympy.oo)
    bigo_L = sympy.limit(sym_true / sym_sub, sympy.Symbol(variables[0]), sympy.oo)

    if omega_L < sympy.sympify(0) or bigo_L < sympy.sympify(0):
        return (0, "Your expression is negative.")
    elif omega_L == sympy.oo or bigo_L == sympy.oo:
        return (0, "Your answer is incorrect.")
    elif omega_L == sympy.sympify(1) and bigo_L == sympy.sympify(1):
        return (0.25, "Incorrect, your answer has unnecessary lower order terms.")

    return (0.25, "Incorrect, your answer has unnecessary constant factors.")


def grade_omega_expression(
    a_true: str, a_sub: str, variables: List[str]
) -> Tuple[float, str]:
    if a_true == a_sub:
        return (1, "Correct!")

    sym_true = phs.convert_string_to_sympy(
        a_true, variables, allow_complex=False, allow_trig_functions=False
    )
    sym_sub = phs.convert_string_to_sympy(
        a_sub, variables, allow_complex=False, allow_trig_functions=False
    )

    if sym_true.equals(sym_sub):
        return (1, "Correct! Note that your expression may be unnecessarily complex.")

    if sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(0):
        return (0, "Your expression is negative.")

    L = sympy.limit(sym_true / sym_sub, sympy.Symbol(variables[0]), sympy.oo)

    if L < sympy.sympify(0):
        return (0, "Your expression is negative.")
    elif L == sympy.oo:
        return (0.25, "Your answer is correct, but too loose.")
    elif L == sympy.sympify(0):
        return (0, "Your answer is incorrect.")
    elif L == sympy.sympify(1):
        return (
            0.5,
            "Your answer is correct, but you have unnecessary lower order terms.",
        )

    return (0.5, "Your answer is correct but has unncessary constant factors.")


def grade_little_o_expression(
    a_true: str, a_sub: str, variables: List[str]
) -> Tuple[float, str]:
    if a_true == a_sub:
        return (1, "Correct!")

    sym_true = phs.convert_string_to_sympy(
        a_true, variables, allow_complex=False, allow_trig_functions=False
    )
    sym_sub = phs.convert_string_to_sympy(
        a_sub, variables, allow_complex=False, allow_trig_functions=False
    )

    if sym_true.equals(sym_sub):
        return (1, "Correct! Note that your expression may be unnecessarily complex.")

    if sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(0):
        return (0, "Your expression is negative.")

    L = sympy.limit(sym_true / sym_sub, sympy.Symbol(variables[0]), sympy.oo)

    if L < sympy.sympify(0):
        return (0, "Your expression is negative.")
    elif L == sympy.oo:
        return (0, "Your answer is incorrect.")
    elif L == sympy.sympify(0):
        return (0.25, "Your answer is correct, but too loose.")
    elif L == sympy.sympify(1):
        return (
            0.5,
            "Your answer is correct, but you have unnecessary lower order terms.",
        )

    return (0.5, "Your answer is correct but has unncessary constant factors.")


def grade_little_omega_expression(
    a_true: str, a_sub: str, variables: List[str]
) -> Tuple[float, str]:
    if a_true == a_sub:
        return (1, "Correct!")

    sym_true = phs.convert_string_to_sympy(
        a_true, variables, allow_complex=False, allow_trig_functions=False
    )
    sym_sub = phs.convert_string_to_sympy(
        a_sub, variables, allow_complex=False, allow_trig_functions=False
    )

    if sym_true.equals(sym_sub):
        return (1, "Correct! Note that your expression may be unnecessarily complex.")

    if sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(0):
        return (0, "Your expression is negative.")

    L = sympy.limit(sym_true / sym_sub, sympy.Symbol(variables[0]), sympy.oo)

    if L < sympy.sympify(0):
        return (0, "Your expression is negative.")
    elif L == sympy.oo:
        return (0.25, "Your answer is correct, but too loose.")
    elif L == sympy.sympify(0):
        return (0, "Your answer is incorrect.")
    elif L == sympy.sympify(1):
        return (
            0.5,
            "Your answer is correct, but you have unnecessary lower order terms.",
        )

    return (0.5, "Your answer is correct but has unncessary constant factors.")
