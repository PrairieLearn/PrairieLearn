import itertools
from collections.abc import Callable

import prairielearn.sympy_utils as psu
import sympy

BigOGradingFunctionT = Callable[[str, str, list[str]], tuple[float, str]]

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
    "Your answer is correct but has unnecessary constant factors."
)

THETA_CONSTANT_FACTORS_FEEDBACK = (
    "Incorrect, your answer has unnecessary constant factors."
)
THETA_LOWER_ORDER_TERMS_FEEDBACK = (
    "Incorrect, your answer has unnecessary lower order terms."
)


def grade_o_expression(
    a_true: str, a_sub: str, variables: list[str]
) -> tuple[float, str]:
    if a_true == "" or a_sub == "":
        return grade_blank_expression(a_true, a_sub)

    sym_true, sym_true_source = psu.convert_string_to_sympy_with_source(
        a_true,
        variables,
        allow_complex=False,
        allow_trig_functions=False,
        assumptions={var: {"positive": True} for var in variables},
    )

    sym_sub, sym_sub_source = psu.convert_string_to_sympy_with_source(
        a_sub,
        variables,
        allow_complex=False,
        allow_trig_functions=False,
        assumptions={var: {"positive": True} for var in variables},
    )

    var_list = [
        sympy.Symbol(psu.greek_unicode_transform(var), positive=True)
        for var in variables
    ]

    if sym_true_source == sym_sub_source:
        return (1, CORRECT_UNCONDITIONAL_FEEDBACK)

    try:
        if sym_true.equals(sym_sub):
            # Sympy doesn't treat n*m and m*n the same in CodeTypes
            # So complex feedback needs to be disabled for multivariate
            if len(variables) == 1:
                return (1, CORRECT_COMPLEX_FEEDBACK)
            else:
                return (1, CORRECT_UNCONDITIONAL_FEEDBACK)

        if len(var_list) == 1 and sympy.limit(
            sym_sub, var_list[0], sympy.oo
        ) < sympy.sympify(0):
            return (0.0, NEGATIVE_FEEDBACK)

        limit_res = []
        for perm in itertools.permutations(var_list):
            limit = sym_true / sym_sub
            for var in perm:
                limit = sympy.limit(limit, var, sympy.oo)

            # Ignore unsolvable limits.
            if not isinstance(limit, sympy.Limit):
                limit_res.append(limit)

        if len(limit_res) == 0:
            return (0.0, TYPE_ERROR_FEEDBACK)

        if any(res < sympy.sympify(0) for res in limit_res):
            return (0.0, NEGATIVE_FEEDBACK)
        elif any(res == sympy.oo for res in limit_res):
            return (0, INCORRECT_FEEDBACK)
        elif any(res == sympy.sympify(0) for res in limit_res):
            return (0.25, TOO_LOOSE_FEEDBACK)
        elif all(res == sympy.sympify(1) for res in limit_res):
            return (0.5, LOWER_ORDER_TERMS_FEEDBACK)
        else:
            return (0.5, CONSTANT_FACTORS_FEEDBACK)
    # There's a chance that some fringe function inputs cannot have their sign evalutated
    # We need to catch NotImplementedError because of this.
    except (TypeError, NotImplementedError):
        return (0.0, TYPE_ERROR_FEEDBACK)


def grade_theta_expression(
    a_true: str, a_sub: str, variables: list[str]
) -> tuple[float, str]:
    if a_true == "" or a_sub == "":
        return grade_blank_expression(a_true, a_sub)

    sym_true, sym_true_source = psu.convert_string_to_sympy_with_source(
        a_true,
        variables,
        allow_complex=False,
        allow_trig_functions=False,
        assumptions={var: {"positive": True} for var in variables},
    )

    sym_sub, sym_sub_source = psu.convert_string_to_sympy_with_source(
        a_sub,
        variables,
        allow_complex=False,
        allow_trig_functions=False,
        assumptions={var: {"positive": True} for var in variables},
    )

    var_list = [
        sympy.Symbol(psu.greek_unicode_transform(var), positive=True)
        for var in variables
    ]

    if sym_true_source == sym_sub_source:
        return (1, CORRECT_UNCONDITIONAL_FEEDBACK)

    try:
        if sym_true.equals(sym_sub):
            if len(variables) == 1:
                return (1, CORRECT_COMPLEX_FEEDBACK)
            else:
                return (1, CORRECT_UNCONDITIONAL_FEEDBACK)

        if len(var_list) == 1 and sympy.limit(
            sym_sub, var_list[0], sympy.oo
        ) < sympy.sympify(0):
            return (0.0, NEGATIVE_FEEDBACK)

        limit_res = []
        for perm in itertools.permutations(var_list):
            omega_limit = sym_sub / sym_true
            bigo_limit = sym_true / sym_sub
            for var in perm:
                omega_limit = sympy.limit(omega_limit, var, sympy.oo)
                bigo_limit = sympy.limit(bigo_limit, var, sympy.oo)

            if not isinstance(omega_limit, sympy.Limit) and not isinstance(
                bigo_limit, sympy.Limit
            ):
                limit_res.append((omega_limit, bigo_limit))

        if len(limit_res) == 0:
            return (0.0, TYPE_ERROR_FEEDBACK)

        if any(
            res[0] < sympy.sympify(0) or res[1] < sympy.sympify(0) for res in limit_res
        ):
            return (0.0, NEGATIVE_FEEDBACK)
        elif any(sympy.oo in res for res in limit_res):
            return (0.0, INCORRECT_FEEDBACK)
        elif all(
            res[0] == sympy.sympify(1) and res[1] == sympy.sympify(1)
            for res in limit_res
        ):
            return (0.25, THETA_LOWER_ORDER_TERMS_FEEDBACK)
        else:
            return (0.25, THETA_CONSTANT_FACTORS_FEEDBACK)

    except (TypeError, NotImplementedError):
        return (0.0, TYPE_ERROR_FEEDBACK)


def grade_omega_expression(
    a_true: str, a_sub: str, variables: list[str]
) -> tuple[float, str]:
    if a_true == "" or a_sub == "":
        return grade_blank_expression(a_true, a_sub)

    sym_true, sym_true_source = psu.convert_string_to_sympy_with_source(
        a_true,
        variables,
        allow_complex=False,
        allow_trig_functions=False,
        assumptions={var: {"positive": True} for var in variables},
    )

    sym_sub, sym_sub_source = psu.convert_string_to_sympy_with_source(
        a_sub,
        variables,
        allow_complex=False,
        allow_trig_functions=False,
        assumptions={var: {"positive": True} for var in variables},
    )

    var_list = [
        sympy.Symbol(psu.greek_unicode_transform(var), positive=True)
        for var in variables
    ]

    if sym_true_source == sym_sub_source:
        return (1, CORRECT_UNCONDITIONAL_FEEDBACK)

    try:
        if sym_true.equals(sym_sub):
            if len(variables) == 1:
                return (1, CORRECT_COMPLEX_FEEDBACK)
            else:
                return (1, CORRECT_UNCONDITIONAL_FEEDBACK)

        if len(var_list) == 1 and sympy.limit(
            sym_sub, var_list[0], sympy.oo
        ) < sympy.sympify(0):
            return (0.0, NEGATIVE_FEEDBACK)

        limit_res = []
        for perm in itertools.permutations(var_list):
            limit = sym_true / sym_sub
            for var in perm:
                limit = sympy.limit(limit, var, sympy.oo)

            if not isinstance(limit, sympy.Limit):
                limit_res.append(limit)

        if len(limit_res) == 0:
            return (0.0, TYPE_ERROR_FEEDBACK)

        if any(res < sympy.sympify(0) for res in limit_res):
            return (0.0, NEGATIVE_FEEDBACK)
        elif any(res == sympy.sympify(0) for res in limit_res):
            return (0, INCORRECT_FEEDBACK)
        elif any(res == sympy.oo for res in limit_res):
            return (0.25, TOO_LOOSE_FEEDBACK)
        elif all(res == sympy.sympify(1) for res in limit_res):
            return (0.5, LOWER_ORDER_TERMS_FEEDBACK)
        else:
            return (0.5, CONSTANT_FACTORS_FEEDBACK)

    except (TypeError, NotImplementedError):
        return (0.0, TYPE_ERROR_FEEDBACK)


def grade_blank_expression(a_true: str, a_sub: str) -> tuple[float, str]:
    if a_true == "" and a_sub == "":
        return (1, CORRECT_UNCONDITIONAL_FEEDBACK)
    return (0, INCORRECT_FEEDBACK)
