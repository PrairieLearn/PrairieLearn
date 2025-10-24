import random
import re
from enum import Enum

import chevron
import lxml.html
import prairielearn as pl
import prairielearn.sympy_utils as psu
import sympy
from typing_extensions import assert_never


class DisplayType(Enum):
    INLINE = "inline"
    BLOCK = "block"


WEIGHT_DEFAULT = 1
VARIABLES_DEFAULT = None
CUSTOM_FUNCTIONS_DEFAULT = None
LABEL_DEFAULT = None
ARIA_LABEL_DEFAULT = None
SUFFIX_DEFAULT = None
DISPLAY_DEFAULT = DisplayType.INLINE
ALLOW_COMPLEX_DEFAULT = False
DISPLAY_LOG_AS_LN_DEFAULT = False
DISPLAY_SIMPLIFIED_EXPRESSION_DEFAULT = True
IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT = "i"
ALLOW_TRIG_FUNCTIONS_DEFAULT = True
SIZE_DEFAULT = 35
SHOW_FORMULA_EDITOR_DEFAULT = False
SHOW_HELP_TEXT_DEFAULT = True
ALLOW_BLANK_DEFAULT = False
BLANK_VALUE_DEFAULT = "0"
PLACEHOLDER_DEFAULT = "symbolic expression"
SHOW_SCORE_DEFAULT = True
SYMBOLIC_INPUT_MUSTACHE_TEMPLATE_NAME = "pl-symbolic-input.mustache"


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "correct-answer",
        "variables",
        "label",
        "aria-label",
        "display",
        "allow-complex",
        "imaginary-unit-for-display",
        "allow-trig-functions",
        "size",
        "formula-editor",
        "show-help-text",
        "allow-blank",
        "blank-value",
        "placeholder",
        "custom-functions",
        "display-log-as-ln",
        "display-simplified-expression",
        "show-score",
        "suffix",
    ]
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, name)

    if pl.has_attrib(element, "correct-answer"):
        if name in data["correct_answers"]:
            raise ValueError(f"duplicate correct_answers variable name: {name}")

        a_true = pl.get_string_attrib(element, "correct-answer")
        variables = psu.get_items_list(
            pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
        )
        custom_functions = psu.get_items_list(
            pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
        )
        allow_complex = pl.get_boolean_attrib(
            element, "allow-complex", ALLOW_COMPLEX_DEFAULT
        )
        allow_trig = pl.get_boolean_attrib(
            element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
        )
        allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
        blank_value = pl.get_string_attrib(element, "blank-value", BLANK_VALUE_DEFAULT)
        simplify_expression = pl.get_boolean_attrib(
            element,
            "display-simplified-expression",
            DISPLAY_SIMPLIFIED_EXPRESSION_DEFAULT,
        )
        # Validate that the answer can be parsed before storing
        if a_true.strip() != "":
            try:
                psu.convert_string_to_sympy(
                    a_true,
                    variables,
                    allow_complex=allow_complex,
                    allow_trig_functions=allow_trig,
                    custom_functions=custom_functions,
                    simplify_expression=simplify_expression,
                )
            except psu.BaseSympyError as exc:
                raise ValueError(
                    f'Parsing correct answer "{a_true}" for "{name}" failed.'
                ) from exc
        elif allow_blank and blank_value == "":
            a_true = ""
        else:
            raise ValueError(
                "Correct answer cannot be blank unless 'allow-blank' is true and 'blank-value' is empty."
            )

        data["correct_answers"][name] = a_true

    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    if imaginary_unit not in {"i", "j"}:
        raise ValueError("imaginary-unit-for-display must be either i or j")


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    label = pl.get_string_attrib(element, "label", LABEL_DEFAULT)
    aria_label = pl.get_string_attrib(element, "aria-label", ARIA_LABEL_DEFAULT)
    suffix = pl.get_string_attrib(element, "suffix", SUFFIX_DEFAULT)
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions = psu.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    display = pl.get_enum_attrib(element, "display", DisplayType, DISPLAY_DEFAULT)
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
    )
    simplify_expression = pl.get_boolean_attrib(
        element, "display-simplified-expression", DISPLAY_SIMPLIFIED_EXPRESSION_DEFAULT
    )
    display_log_as_ln = pl.get_boolean_attrib(
        element, "display-log-as-ln", DISPLAY_LOG_AS_LN_DEFAULT
    )
    size = pl.get_integer_attrib(element, "size", SIZE_DEFAULT)
    placeholder = pl.get_string_attrib(element, "placeholder", PLACEHOLDER_DEFAULT)
    show_score = pl.get_boolean_attrib(element, "show-score", SHOW_SCORE_DEFAULT)
    show_info = pl.get_boolean_attrib(element, "show-help-text", SHOW_HELP_TEXT_DEFAULT)
    constants_class = psu._Constants()

    operators: list[str] = list(psu.STANDARD_OPERATORS)
    operators.extend(custom_functions)
    operators.extend(constants_class.functions.keys())
    if allow_trig:
        operators.extend(constants_class.trig_functions.keys())

    constants = list(constants_class.variables.keys())

    info_params = {
        "format": True,
        "variables": variables,
        "operators": operators,
        "constants": constants,
        "allow_complex": allow_complex,
    }

    with open(SYMBOLIC_INPUT_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
        template = f.read()

    info = chevron.render(template, info_params).strip()

    parse_error: str | None = data["format_errors"].get(name)
    missing_input = False
    a_sub_converted = None

    if parse_error is None and name in data["submitted_answers"]:
        a_sub = data["submitted_answers"][name]

        if isinstance(a_sub, str) and a_sub.strip() == "":
            a_sub_parsed = ""
        elif isinstance(a_sub, str):
            # this is for backward-compatibility
            a_sub_parsed = psu.convert_string_to_sympy(
                a_sub,
                variables,
                allow_complex=allow_complex,
                custom_functions=custom_functions,
                allow_trig_functions=allow_trig,
                simplify_expression=simplify_expression,
            ).subs(sympy.I, sympy.Symbol(imaginary_unit))
        else:
            a_sub_parsed = psu.json_to_sympy(
                a_sub,
                allow_complex=allow_complex,
                allow_trig_functions=allow_trig,
                simplify_expression=simplify_expression,
            ).subs(sympy.I, sympy.Symbol(imaginary_unit))

        if display_log_as_ln and a_sub_parsed != "":
            a_sub_parsed = a_sub_parsed.replace(sympy.log, sympy.Function("ln"))
        a_sub_converted = "" if a_sub_parsed == "" else sympy.latex(a_sub_parsed)
    elif name not in data["submitted_answers"]:
        missing_input = True
        parse_error = None
    # Use the existing format text in the invalid popup and render it
    elif parse_error is not None:
        parse_error += chevron.render(
            template, {"format_error": True, "format_string": info}
        ).strip()

    # Next, get some attributes we will use in multiple places
    formula_editor = pl.get_boolean_attrib(
        element, "formula-editor", SHOW_FORMULA_EDITOR_DEFAULT
    )
    raw_submitted_answer_latex = data["raw_submitted_answers"].get(
        name + "-latex", None
    )
    raw_submitted_answer = data["raw_submitted_answers"].get(name, None)

    score = data["partial_scores"].get(name, {}).get("score")

    if data["panel"] == "question":
        editable = data["editable"]

        html_params = {
            "question": True,
            "name": name,
            "label": label,
            "aria_label": aria_label,
            "suffix": suffix,
            "editable": editable,
            "info": info,
            "placeholder": placeholder,
            "size": size,
            "show_info": show_info,
            "uuid": pl.get_uuid(),
            "allow_complex": allow_complex,
            "allow_trig": allow_trig,
            "imaginary_unit": imaginary_unit,
            "log_as_ln": display_log_as_ln,
            "raw_submitted_answer": raw_submitted_answer,
            "raw_submitted_answer_latex": raw_submitted_answer_latex,
            "parse_error": parse_error,
            display.value: True,
            "formula_editor": formula_editor,
            "custom_functions": ",".join(custom_functions),
        }

        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        return chevron.render(template, html_params).strip()

    elif data["panel"] == "submission":
        html_params = {
            "submission": True,
            "label": label,
            "suffix": suffix,
            "parse_error": parse_error,
            "uuid": pl.get_uuid(),
            "a_sub": a_sub_converted,
            "raw_submitted_answer": raw_submitted_answer,
            "raw_submitted_answer_latex": raw_submitted_answer_latex,
            "formula_editor": formula_editor,
            "custom_functions": ",".join(custom_functions),
            "allow_trig": allow_trig,
            "imaginary_unit": imaginary_unit,
            "log_as_ln": display_log_as_ln,
            display.value: True,
            "error": parse_error or missing_input,
            "missing_input": missing_input,
        }

        if show_score and score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        return chevron.render(template, html_params).strip()

    elif data["panel"] == "answer":
        a_tru = data["correct_answers"].get(name)
        if a_tru is None:
            return ""

        elif isinstance(a_tru, str):
            if a_tru != "":
                # this is so instructors can specify the true answer simply as a string
                a_tru = psu.convert_string_to_sympy(
                    a_tru,
                    variables,
                    allow_complex=allow_complex,
                    allow_trig_functions=allow_trig,
                    custom_functions=custom_functions,
                    simplify_expression=simplify_expression,
                ).subs(sympy.I, sympy.Symbol(imaginary_unit))
        else:
            a_tru = psu.json_to_sympy(
                a_tru,
                allow_complex=allow_complex,
                allow_trig_functions=allow_trig,
                simplify_expression=simplify_expression,
            ).subs(sympy.I, sympy.Symbol(imaginary_unit))

        if display_log_as_ln and a_tru != "":
            a_tru = a_tru.replace(sympy.log, sympy.Function("ln"))

        html_params = {
            "answer": True,
            "label": label,
            "suffix": suffix,
            "a_tru": sympy.latex(a_tru),
        }
        return chevron.render(template, html_params).strip()

    assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    formula_editor = pl.get_boolean_attrib(
        element, "formula-editor", SHOW_FORMULA_EDITOR_DEFAULT
    )
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions = psu.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
    )
    simplify_expression = pl.get_boolean_attrib(
        element, "display-simplified-expression", DISPLAY_SIMPLIFIED_EXPRESSION_DEFAULT
    )
    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    blank_value = pl.get_string_attrib(element, "blank-value", BLANK_VALUE_DEFAULT)

    # Get submitted answer or return parse_error if it does not exist
    submitted_answer = data["submitted_answers"].get(name, None)
    if formula_editor:
        a_sub = format_formula_editor_submission_for_sympy(
            submitted_answer,
            allow_trig,
            variables,
            custom_functions,
        )
    else:
        a_sub = submitted_answer

    if a_sub is None:
        data["format_errors"][name] = "No submitted answer."
        data["submitted_answers"][name] = None
        return

    if isinstance(a_sub, str) and a_sub.strip() == "":
        if allow_blank:
            a_sub = blank_value
            if a_sub.strip() == "":  # Handle blank case
                data["submitted_answers"][name] = ""
                return
        else:
            data["format_errors"][name] = "No submitted answer."
            data["submitted_answers"][name] = None
            return

    error_msg = psu.validate_string_as_sympy(
        a_sub,
        variables,
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig,
        imaginary_unit=imaginary_unit,
        custom_functions=custom_functions,
    )

    if error_msg is not None:
        data["format_errors"][name] = error_msg
        data["submitted_answers"][name] = None
        return

    # Retrieve variable assumptions encoded in correct answer
    assumptions_dict = None
    a_tru = data["correct_answers"].get(name, {})
    if isinstance(a_tru, dict):
        assumptions_dict = a_tru.get("_assumptions")

    a_sub_parsed = psu.convert_string_to_sympy(
        a_sub,
        variables,
        allow_hidden=True,
        allow_complex=allow_complex,
        allow_trig_functions=allow_trig,
        assumptions=assumptions_dict,
        custom_functions=custom_functions,
        simplify_expression=simplify_expression,
    )

    # Make sure we can parse the json again
    try:
        a_sub_json = psu.sympy_to_json(a_sub_parsed, allow_complex=allow_complex)

        # Convert safely to sympy
        psu.json_to_sympy(
            a_sub_json,
            allow_complex=allow_complex,
            simplify_expression=simplify_expression,
        )

        # Finally, store the result
        data["submitted_answers"][name] = a_sub_json
    except Exception:
        data["format_errors"][name] = (
            f"Your answer was simplified to this, which contains an invalid expression: $${sympy.latex(a_sub_parsed)}$$"
        )
        data["submitted_answers"][name] = None


def format_formula_editor_submission_for_sympy(
    sub: str | None,
    allow_trig: bool,
    variables: list[str],
    custom_functions: list[str],
) -> str | None:
    """
    Format raw formula editor input to be compatible with SymPy.

    The formula editor outputs text with several quirks that need correction:
    1. Invisible "{:" and ":}" operators from LaTeX copy-paste
    2. Multi-character names are space-separated: "s i n" instead of "sin"
    3. Numbers after variables need spacing: "x2" should be "x 2" for multiplication

    Args:
        sub: Raw text from the formula editor
        allow_trig: Whether trig functions (sin, cos, etc.) are available
        variables: List of allowed variable names
        custom_functions: List of custom function names

    Returns:
        Formatted text ready for SymPy parsing, or None if input is None
    """
    if sub is None:
        return None

    # Remove invisible LaTeX formatting operators
    text = sub.replace("{:", "").replace(":}", "")

    # Build list of all multi-character tokens that should be recognized as units
    known_tokens = _build_known_tokens(allow_trig, variables, custom_functions)

    # Replace Greek unicode letters with spaced ASCII for consistent handling further on
    text = "".join([_greek_transform(char) for char in text])

    # Merge space-separated characters into proper tokens (e.g., "s i n" -> "sin")
    text = _merge_spaced_tokens(text, known_tokens)

    # Add spaces between letters and numbers for implicit multiplication,
    # but preserve tokens like "f2" that are custom function names
    text = _add_multiplication_spaces(text, known_tokens)

    return text


def _build_known_tokens(
    allow_trig: bool,
    variables: list[str],
    custom_functions: list[str],
) -> list[str]:
    """
    Build a list of all multi-character tokens that should be recognized as single units.

    Returns tokens sorted by length (longest first) to handle prefix matching correctly.
    For example, "acosh" must be checked before "acos" to avoid partial matches.

    Returns:
        List of all multi-character tokens that should be recognized as single units.
    """
    constants_class = psu._Constants()

    # Include 1-letter tokens here since Greek letters might become multi-letter tokens when transformed
    tokens = (
        list(psu.STANDARD_OPERATORS)
        + list(constants_class.functions.keys())
        + custom_functions
        + variables
    )
    if allow_trig:
        tokens += list(constants_class.trig_functions.keys())

    # Add transformed versions of Greek letters
    tokens += [
        psu.greek_unicode_transform(token)
        for token in tokens
        if psu.greek_unicode_transform(token) != token
    ]

    # Filter out single-letter tokens
    tokens = [token for token in tokens if len(token) > 1]

    tokens.sort(key=len, reverse=True)

    return tokens


def _greek_transform(text: str) -> str:
    """
    Replace Greek unicode letters with their English spelling and insert spaces around,
    every letter so that they are handled equivalently to letters already spelled in English.

    Example: "Α0x" becomes " A l p h a 0 x ", the same as if it was spelled out in the
    submission (and the consecutive processing steps will correct the spacing)

    Returns:
        The string with Greek unicode letters replaced by spaced-out English spelling
    """  # noqa: RUF002
    transformed = psu.greek_unicode_transform(text)
    return (" " + " ".join(transformed) + " ") if transformed != text else text


def _merge_spaced_tokens(text: str, tokens: list[str]) -> str:
    """
    Replace space-separated versions of tokens with their unspaced form.

    Example: "s i n ( x )" becomes "sin ( x )"

    Returns:
        The text with spaced tokens merged
    """
    for token in tokens:
        spaced_version = " ".join(token)
        text = text.replace(spaced_version, token)
    return text


def _add_multiplication_spaces(text: str, protected_tokens: list[str]) -> str:
    """
    Insert spaces between letter-digit pairs to indicate multiplication.

    Example: "x2" becomes "x 2"

    However, we preserve tokens that naturally contain digits (like "f2" for
    a custom function) by marking their character positions as protected.

    Returns:
        The text with multiplication spaces added
    """
    # Find all positions that are part of tokens containing digits
    protected_positions = set()
    for token in protected_tokens:
        if not re.search(r"\d", token):
            continue
        for match in re.finditer(re.escape(token), text):
            protected_positions.update(range(match.start(), match.end()))

    # Build result, inserting spaces where appropriate
    result = []
    for i, char in enumerate(text):
        result.append(char)

        # Check if we need a space after this character
        has_next = i + 1 < len(text)
        if not has_next:
            continue

        next_char = text[i + 1]
        next_position = i + 1

        # Insert space if: letter followed by digit, and next position is not protected
        if (
            char.isalpha()
            and next_char.isdigit()
            and next_position not in protected_positions
        ):
            result.append(" ")

    return "".join(result)


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions = psu.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
    )
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = data["correct_answers"].get(name, None)
    if a_tru is None:
        return

    def grade_function(a_sub: str | psu.SympyJson) -> tuple[bool, None]:
        # Special case: submitted answer or correct answer is the empty string
        if isinstance(a_tru, str) and a_tru == "":
            if isinstance(a_sub, str) and a_sub == "":
                return True, None
            else:
                return False, None
        elif isinstance(a_sub, str) and a_sub == "":
            return False, None

        # Parse true answer
        if isinstance(a_tru, str):
            # this is so instructors can specify the true answer simply as a string
            a_tru_sympy = psu.convert_string_to_sympy(
                a_tru,
                variables,
                allow_complex=allow_complex,
                allow_trig_functions=allow_trig,
                custom_functions=custom_functions,
            )
        else:
            a_tru_sympy = psu.json_to_sympy(a_tru, allow_complex=allow_complex)

        # Parse submitted answer
        if isinstance(a_sub, str):
            # this is for backward-compatibility
            a_sub_sympy = psu.convert_string_to_sympy(
                a_sub,
                variables,
                allow_complex=allow_complex,
                allow_trig_functions=allow_trig,
                custom_functions=custom_functions,
                assumptions=a_tru_sympy.assumptions0,
            )
        else:
            a_sub_sympy = psu.json_to_sympy(
                a_sub, allow_complex=allow_complex, allow_trig_functions=allow_trig
            )

        return a_tru_sympy.equals(a_sub_sympy) is True, None

    pl.grade_answer_parameterized(data, name, grade_function, weight=weight)


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    variables = psu.get_items_list(
        pl.get_string_attrib(element, "variables", VARIABLES_DEFAULT)
    )
    custom_functions = psu.get_items_list(
        pl.get_string_attrib(element, "custom-functions", CUSTOM_FUNCTIONS_DEFAULT)
    )
    allow_complex = pl.get_boolean_attrib(
        element, "allow-complex", ALLOW_COMPLEX_DEFAULT
    )
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    imaginary_unit = pl.get_string_attrib(
        element, "imaginary-unit-for-display", IMAGINARY_UNIT_FOR_DISPLAY_DEFAULT
    )
    allow_trig = pl.get_boolean_attrib(
        element, "allow-trig-functions", ALLOW_TRIG_FUNCTIONS_DEFAULT
    )

    result = data["test_type"]
    a_tru_str = ""

    if result in ["correct", "incorrect"]:
        if name not in data["correct_answers"]:
            # This element cannot test itself. Defer the generation of test inputs to server.py
            return

        # Get raw correct answer
        a_tru = data["correct_answers"][name]

        # Parse correct answer based on type
        if isinstance(a_tru, str):
            if a_tru != "":
                a_tru = psu.convert_string_to_sympy(
                    a_tru,
                    variables,
                    allow_complex=allow_complex,
                    allow_trig_functions=allow_trig,
                    custom_functions=custom_functions,
                )
        else:
            a_tru = psu.json_to_sympy(
                a_tru, allow_complex=allow_complex, allow_trig_functions=allow_trig
            )

        if a_tru != "":
            # Substitute in imaginary unit symbol
            a_tru_str = str(a_tru.subs(sympy.I, sympy.Symbol(imaginary_unit)))

    if result == "correct":
        if a_tru_str == "":
            data["raw_submitted_answers"][name] = ""
        else:
            correct_answers = [
                a_tru_str,
                f"{a_tru_str} + 0",
            ]
            if allow_complex:
                correct_answers.append(f"2j + {a_tru_str} - 3j + j")
            if allow_trig:
                correct_answers.append(f"cos(0) * ( {a_tru_str} )")

            data["raw_submitted_answers"][name] = random.choice(correct_answers)
        data["partial_scores"][name] = {"score": 1, "weight": weight}

    elif result == "incorrect":
        if a_tru_str == "":
            data["raw_submitted_answers"][name] = f"{random.randint(1, 100):d}"
        else:
            data["raw_submitted_answers"][name] = (
                f"{a_tru_str} + {random.randint(1, 100):d}"
            )
        data["partial_scores"][name] = {"score": 0, "weight": weight}

    elif result == "invalid":
        invalid_answers = [
            "n + 1.234",
            "x + (1+2j)",
            "1 and 0",
            "aatan(n)",
            "x + y",
            "x +* 1",
            "x + 1\\n",
            "x # some text",
        ]
        if not allow_complex:
            invalid_answers.append("3j")
        if not allow_trig:
            invalid_answers.append("cos(2)")

        # TODO add back detailed format errors if this gets checked in the future
        data["raw_submitted_answers"][name] = random.choice(invalid_answers)
        data["format_errors"][name] = ""
    else:
        assert_never(result)
