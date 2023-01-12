import math
from enum import Enum
from typing import Any, Callable, List, Optional, Tuple, Type, TypeVar, Union

import lxml
import prairielearn as pl
import python_helper_sympy as phs
import sympy
from typing_extensions import assert_never

BigOGradingFunctionT = Callable[[str, str, List[str]], Tuple[float, str]]

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

    a_true = a_true.replace(" ", "")
    a_sub = a_sub.replace(" ", "")

    if a_true == a_sub:
        return (1, CORRECT_UNCONDITIONAL_FEEDBACK)

    sym_true = phs.convert_string_to_sympy(
        a_true, variables, allow_complex=False, allow_trig_functions=False
    )
    sym_sub = phs.convert_string_to_sympy(
        a_sub, variables, allow_complex=False, allow_trig_functions=False
    )

    if sym_true.equals(sym_sub):
        return (1, CORRECT_COMPLEX_FEEDBACK)
    elif sym_sub.equals(sympy.sympify(0)):
        return (0, INCORRECT_FEEDBACK)

    if sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(0):
        return (0, NEGATIVE_FEEDBACK)

    L = sympy.limit(sym_true / sym_sub, sympy.Symbol(variables[0]), sympy.oo)

    if L < sympy.sympify(0):
        return (0, NEGATIVE_FEEDBACK)
    elif L == sympy.oo:
        return (0, INCORRECT_FEEDBACK)
    elif L == sympy.sympify(0):
        return (0.25, TOO_LOOSE_FEEDBACK)
    elif L == sympy.sympify(1):
        return (0.5, LOWER_ORDER_TERMS_FEEDBACK)

    return (0.5, CONSTANT_FACTORS_FEEDBACK)


def grade_theta_expression(
    a_true: str, a_sub: str, variables: List[str]
) -> Tuple[float, str]:

    a_true = a_true.replace(" ", "")
    a_sub = a_sub.replace(" ", "")

    if a_true == a_sub:
        return (1, CORRECT_UNCONDITIONAL_FEEDBACK)

    sym_true = phs.convert_string_to_sympy(
        a_true, variables, allow_complex=False, allow_trig_functions=False
    )
    sym_sub = phs.convert_string_to_sympy(
        a_sub, variables, allow_complex=False, allow_trig_functions=False
    )

    if sym_true.equals(sym_sub):
        return (1, CORRECT_COMPLEX_FEEDBACK)
    elif sym_sub.equals(sympy.sympify(0)):
        return (0, INCORRECT_FEEDBACK)

    if sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(0):
        return (0, NEGATIVE_FEEDBACK)

    omega_L = sympy.limit(sym_sub / sym_true, sympy.Symbol(variables[0]), sympy.oo)
    bigo_L = sympy.limit(sym_true / sym_sub, sympy.Symbol(variables[0]), sympy.oo)

    if omega_L < sympy.sympify(0) or bigo_L < sympy.sympify(0):
        return (0, NEGATIVE_FEEDBACK)
    elif omega_L == sympy.oo or bigo_L == sympy.oo:
        return (0, INCORRECT_FEEDBACK)
    elif omega_L == sympy.sympify(1) and bigo_L == sympy.sympify(1):
        return (0.25, THETA_LOWER_ORDER_TERMS_FEEDBACK)

    return (0.25, THETA_CONSTANT_FACTORS_FEEDBACK)


def grade_omega_expression(
    a_true: str, a_sub: str, variables: List[str]
) -> Tuple[float, str]:

    a_true = a_true.replace(" ", "")
    a_sub = a_sub.replace(" ", "")

    if a_true == a_sub:
        return (1, CORRECT_UNCONDITIONAL_FEEDBACK)

    sym_true = phs.convert_string_to_sympy(
        a_true, variables, allow_complex=False, allow_trig_functions=False
    )
    sym_sub = phs.convert_string_to_sympy(
        a_sub, variables, allow_complex=False, allow_trig_functions=False
    )

    if sym_true.equals(sym_sub):
        return (1, CORRECT_COMPLEX_FEEDBACK)
    elif sym_sub.equals(sympy.sympify(0)):
        return (0, INCORRECT_FEEDBACK)

    if sympy.limit(sym_sub, sympy.Symbol(variables[0]), sympy.oo) < sympy.sympify(0):
        return (0, NEGATIVE_FEEDBACK)

    L = sympy.limit(sym_true / sym_sub, sympy.Symbol(variables[0]), sympy.oo)

    if L < sympy.sympify(0):
        return (0, NEGATIVE_FEEDBACK)
    elif L == sympy.oo:
        return (0.25, TOO_LOOSE_FEEDBACK)
    elif L == sympy.sympify(0):
        return (0, INCORRECT_FEEDBACK)
    elif L == sympy.sympify(1):
        return (0.5, LOWER_ORDER_TERMS_FEEDBACK)

    return (0.5, CONSTANT_FACTORS_FEEDBACK)


# Start of generic utilities. Move these to prairielearn.py as-needed


class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"


def grade_answer_parameterized(
    data: pl.QuestionData,
    question_name: str,
    grade_function: Callable[[Any], Tuple[Union[bool, float], Optional[str]]],
    weight: int = 1,
) -> None:
    """
    Grade question question_name. grade_function should take in a single parameter
    (which will be the submitted answer) and return a 2-tuple:
        - The first element of the 2-tuple should either be:
            - a boolean indicating whether the question should be marked correct
            - a partial score between 0 and 1, inclusive
        - The second element of the 2-tuple should either be:
            - a string containing feedback
            - None, if there is no feedback (usually this should only occur if the answer is correct)
    """

    # Create the data dictionary at first
    data["partial_scores"][question_name] = {"score": 0.0, "weight": weight}

    if question_name not in data["submitted_answers"]:
        data["format_errors"][question_name] = "No answer was submitted"
        return

    submitted_answer = data["submitted_answers"][question_name]

    # Run passed-in grading function
    result, feedback_content = grade_function(submitted_answer)

    # Try converting partial score
    if isinstance(result, bool):
        partial_score = 1.0 if result else 0.0
    elif isinstance(result, (float, int)):
        assert 0.0 <= result <= 1.0
        partial_score = result
    else:
        assert_never(result)

    # Set corresponding partial score and feedback
    data["partial_scores"][question_name]["score"] = partial_score

    if feedback_content:
        data["partial_scores"][question_name]["feedback"] = feedback_content


def determine_score_params(score: float) -> Tuple[str, Union[bool, float]]:
    """Determine score params taken from data dict"""

    if score >= 1:
        return ("correct", True)
    elif score > 0:
        return ("partial", math.floor(score * 100))

    return ("incorrect", True)


EnumT = TypeVar("EnumT", bound=Enum)


def get_enum_attrib(
    element: lxml.html.HtmlElement,
    name: str,
    enum_type: Type[EnumT],
    default: Optional[EnumT] = None,
) -> EnumT:
    """
    Returns the named attribute for the element parsed as an enum,
    or the (optional) default value. If the default value is not provided
    and the attribute is missing then an exception is thrown. An exception
    is also thrown if the value for the enum provided is invalid.

    Also, alters the enum names to comply with PL naming convention automatically
    (replacing underscores with dashes and uppercasing). If default value is
    provided, must be a member of the given enum.
    """

    enum_val, is_default = (
        pl._get_attrib(element, name)
        if default is None
        else pl._get_attrib(element, name, default)
    )

    # Default doesn't need to be converted, already a value of the enum
    if is_default:
        return enum_val

    upper_enum_str = enum_val.upper()
    accepted_names = {member.name.replace("_", "-") for member in enum_type}

    if upper_enum_str not in accepted_names:
        raise ValueError(f"{enum_val} is not a valid type")

    return enum_type[upper_enum_str.replace("-", "_")]
