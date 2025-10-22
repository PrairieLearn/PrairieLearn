import random
from enum import Enum
from itertools import count
from typing import Any, NamedTuple, cast

import chevron
import lxml.etree
import lxml.html
import prairielearn as pl
from typing_extensions import assert_never


class PartialCreditType(Enum):
    """Stands for 'COV' (Coverage), 'EDC' (Every Decision Counts), and 'PC' (Percent Correct)"""

    NONE = "none"
    COVERAGE = "coverage"
    EVERY_DECISION_COUNTS = "every_decision_counts"
    PERCENT_CORRECT = "percent_correct"


class OrderType(Enum):
    RANDOM = "random"
    ASCEND = "ascend"
    DESCEND = "descend"
    FIXED = "fixed"


class AnswerTuple(NamedTuple):
    idx: int
    correct: bool
    html: str
    feedback: str | None


WEIGHT_DEFAULT = 1
INLINE_DEFAULT = False
PARTIAL_CREDIT_MODE_DEFAULT = PartialCreditType.PERCENT_CORRECT
HIDE_ANSWER_PANEL_DEFAULT = False
# TODO add help text selector with enum
HIDE_HELP_TEXT_DEFAULT = False
DETAILED_HELP_TEXT_DEFAULT = False
HIDE_LETTER_KEYS_DEFAULT = False
HIDE_SCORE_BADGE_DEFAULT = False
SHOW_NUMBER_CORRECT_DEFAULT = False
MIN_CORRECT_DEFAULT = 1
MIN_SELECT_DEFAULT = 1
FEEDBACK_DEFAULT = None
ALLOW_BLANK_DEFAULT = False
MIN_SELECT_BLANK = 0

CHECKBOX_MUSTACHE_TEMPLATE_NAME = "pl-checkbox.mustache"


def get_order_type(element: lxml.html.HtmlElement) -> OrderType:
    """Gets order type in a backwards-compatible way. New display overwrites old."""
    if pl.has_attrib(element, "fixed-order") and pl.has_attrib(element, "order"):
        raise ValueError(
            'Setting answer choice order should be done with the "order" attribute.'
        )

    fixed_order_default = False
    fixed_order = pl.get_boolean_attrib(element, "fixed-order", fixed_order_default)
    order_type_default = OrderType.FIXED if fixed_order else OrderType.RANDOM

    return pl.get_enum_attrib(element, "order", OrderType, order_type_default)


def get_partial_credit_mode(element: lxml.html.HtmlElement) -> PartialCreditType:
    if pl.has_attrib(element, "partial-credit-mode"):
        if pl.has_attrib(element, "partial-credit"):
            raise ValueError(
                'Setting partial credit mode should be done with the "partial-credit-mode" attribute.'
            )

        return pl.get_enum_attrib(
            element,
            "partial-credit-mode",
            PartialCreditType,
            PARTIAL_CREDIT_MODE_DEFAULT,
        )

    partial_credit_default = False
    partial_credit_method_default = "PC"
    partial_credit_mapping = {
        "PC": PartialCreditType.PERCENT_CORRECT,
        "COV": PartialCreditType.COVERAGE,
        "EDC": PartialCreditType.EVERY_DECISION_COUNTS,
    }
    # Use old partial credit method otherwise
    partial_credit = pl.get_boolean_attrib(
        element, "partial-credit", partial_credit_default
    )

    if not partial_credit and pl.has_attrib(element, "partial-credit-method"):
        raise ValueError(
            "Cannot specify partial-credit-method if partial-credit is not enabled"
        )

    return partial_credit_mapping[
        pl.get_string_attrib(
            element, "partial-credit-method", partial_credit_method_default
        )
    ]


def validate_min_max_options(
    min_correct: int,
    max_correct: int,
    len_correct: int,
    len_incorrect: int,
    number_answers: int,
    min_select: int,
    max_select: int,
    min_select_default: int,
) -> None:
    """Raise an exception if any of these are invalid. TODO do a better job comparmentalizing the logic here."""
    if not (0 <= min_correct <= max_correct <= len_correct):
        raise ValueError(
            f"INTERNAL ERROR: correct number: ({min_correct}, {max_correct}, {len_correct}, {len_incorrect})"
        )

    min_incorrect = number_answers - max_correct
    max_incorrect = number_answers - min_correct
    if not (0 <= min_incorrect <= max_incorrect <= len_incorrect):
        raise ValueError(
            f"INTERNAL ERROR: incorrect number: ({min_correct}, {max_correct}, {len_correct}, {len_incorrect})"
        )

    if min_select < min_select_default:
        raise ValueError(
            f"The attribute min-select is {min_select}, but must be at least {min_select_default}"
        )

        # Check that min_select, max_select, number_answers, min_correct, and max_correct all have sensible values relative to each other.
    if min_select > max_select:
        raise ValueError(
            f"min-select ({min_select}) is greater than max-select ({max_select})"
        )
    if min_select > number_answers:
        raise ValueError(
            f"min-select ({min_select}) is greater than the total number of answers to display ({number_answers})"
        )
    if min_select > min_correct:
        raise ValueError(
            f"min-select ({min_select}) is greater than the minimum possible number of correct answers ({min_correct})"
        )
    if max_select < max_correct:
        raise ValueError(
            f"max-select ({max_select}) is less than the maximum possible number of correct answers ({max_correct})"
        )


def categorize_options(
    element: lxml.html.HtmlElement,
) -> tuple[list[AnswerTuple], list[AnswerTuple]]:
    """Get provided correct and incorrect answers."""
    correct_answers = []
    incorrect_answers = []
    index = count(0)

    for child in element:
        if child.tag in ["pl-answer", "pl_answer"]:
            pl.check_attribs(
                child, required_attribs=[], optional_attribs=["correct", "feedback"]
            )
            correct = pl.get_boolean_attrib(child, "correct", False)
            child_html = pl.inner_html(child)
            child_feedback = pl.get_string_attrib(child, "feedback", FEEDBACK_DEFAULT)
            answer_tuple = AnswerTuple(next(index), correct, child_html, child_feedback)
            if correct:
                correct_answers.append(answer_tuple)
            else:
                incorrect_answers.append(answer_tuple)
        elif isinstance(child, lxml.etree._Comment):
            continue

        else:
            raise ValueError(
                f'Tags inside of pl-checkbox must be pl-answer, not "{child.tag}".'
            )

    return correct_answers, incorrect_answers


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    required_attribs = ["answers-name"]
    optional_attribs = [
        "weight",
        "number-answers",
        "min-correct",
        "max-correct",
        "order",
        "inline",
        "hide-answer-panel",
        "hide-help-text",
        "detailed-help-text",
        "partial-credit-mode",
        "hide-letter-keys",
        "hide-score-badge",
        "min-select",
        "allow-blank",
        "max-select",
        "show-number-correct",
        # Keep the old partial credit attributes for backwards compatibility
        "partial-credit",
        "partial-credit-method",
        # Legacy order attribute
        "fixed-order",
    ]

    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, "answers-name")

    if name in data["params"]:
        raise ValueError(f"duplicate params variable name: {name}")
    if name in data["correct_answers"]:
        raise ValueError(f"Duplicate correct_answers variable name: {name}")

    # Don't use value but call getter here to do validation right away.
    get_partial_credit_mode(element)

    correct_answers, incorrect_answers = categorize_options(element)

    len_correct = len(correct_answers)
    len_incorrect = len(incorrect_answers)
    len_total = len_correct + len_incorrect

    if len_correct == 0:
        raise ValueError("At least one option must be true.")

    number_answers = pl.get_integer_attrib(element, "number-answers", len_total)
    min_correct = pl.get_integer_attrib(element, "min-correct", MIN_CORRECT_DEFAULT)
    max_correct = pl.get_integer_attrib(element, "max-correct", len(correct_answers))

    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)

    if min_correct < 1:
        raise ValueError(
            f"The attribute min-correct is {min_correct} but must be at least 1"
        )

    # No longer need max number of options, this was an old limitation of the index2key function

    number_answers = max(0, min(len_total, number_answers))
    min_correct = min(
        len_correct, number_answers, max(0, number_answers - len_incorrect, min_correct)
    )
    max_correct = min(len_correct, number_answers, max(min_correct, max_correct))

    min_select_default = MIN_SELECT_BLANK if allow_blank else MIN_SELECT_DEFAULT
    min_select = pl.get_integer_attrib(element, "min-select", min_select_default)

    max_select = pl.get_integer_attrib(element, "max-select", number_answers)

    validate_min_max_options(
        min_correct,
        max_correct,
        len_correct,
        len_incorrect,
        number_answers,
        min_select,
        max_select,
        min_select_default,
    )

    number_correct = random.randint(min_correct, max_correct)
    number_incorrect = number_answers - number_correct

    sampled_correct = random.sample(correct_answers, number_correct)
    sampled_incorrect = random.sample(incorrect_answers, number_incorrect)

    sampled_answers = sampled_correct + sampled_incorrect
    random.shuffle(sampled_answers)

    # TODO change to use the same scheme as the unified multiple choice
    order_type = get_order_type(element)
    if order_type is OrderType.FIXED:
        sampled_answers.sort(key=lambda a: a.idx)  # sort by stored original index
    elif order_type is OrderType.DESCEND:
        sampled_answers.sort(key=lambda a: a.html, reverse=True)
    elif order_type is OrderType.ASCEND:
        sampled_answers.sort(key=lambda a: a.html, reverse=False)
    elif order_type is OrderType.RANDOM:
        random.shuffle(sampled_answers)
    else:
        assert_never(order_type)

    display_answers = []
    correct_answer_list = []
    for key, answer in zip(pl.iter_keys(), sampled_answers, strict=False):
        keyed_answer = {
            "key": key,
            "html": answer.html,
            "feedback": answer.feedback,
        }
        display_answers.append(keyed_answer)
        if answer.correct:
            correct_answer_list.append(keyed_answer)

    data["params"][name] = display_answers
    data["correct_answers"][name] = correct_answer_list


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    partial_credit_mode = get_partial_credit_mode(element)

    hide_score_badge = pl.get_boolean_attrib(
        element, "hide-score-badge", HIDE_SCORE_BADGE_DEFAULT
    )

    editable = data["editable"]
    # answer feedback is not displayed when partial credit is True
    # (unless the question is disabled)
    show_answer_feedback = True
    if (
        partial_credit_mode is not PartialCreditType.NONE and editable
    ) or hide_score_badge:
        show_answer_feedback = False

    display_answers = data["params"].get(name, [])
    inline = pl.get_boolean_attrib(element, "inline", INLINE_DEFAULT)
    submitted_keys_raw = data["submitted_answers"].get(name, [])

    # if there is only one key then it is passed as a string,
    # not as a length-one list, so we fix that next
    if isinstance(submitted_keys_raw, str):
        submitted_keys_raw = [submitted_keys_raw]

    submitted_keys = set(submitted_keys_raw)

    correct_keys = {answer["key"] for answer in data["correct_answers"].get(name, [])}

    if data["panel"] == "question":
        partial_score = data["partial_scores"].get(name, {"score": None})
        score = partial_score.get("score", None)
        # Change the type becasue of how this element works
        feedback = cast(dict[str, str], partial_score.get("feedback", None))

        answerset = []
        for answer in display_answers:
            answer_html = {
                "key": answer["key"],
                "checked": (answer["key"] in submitted_keys),
                "html": answer["html"].strip(),
                "display_score_badge": score is not None
                and show_answer_feedback
                and answer["key"] in submitted_keys,
                "display_feedback": answer["key"] in submitted_keys
                and feedback
                and feedback.get(answer["key"], None),
                "feedback": feedback.get(answer["key"], None) if feedback else None,
            }
            if answer_html["display_score_badge"]:
                answer_html["correct"] = answer["key"] in correct_keys
                answer_html["incorrect"] = answer["key"] not in correct_keys
            answerset.append(answer_html)

        info_params: dict[str, Any] = {"format": True}
        # Adds decorative help text per bootstrap formatting guidelines:
        # http://getbootstrap.com/docs/4.0/components/forms/#help-text
        # Determine whether we should add a choice selection requirement
        hide_help_text = pl.get_boolean_attrib(
            element, "hide-help-text", HIDE_HELP_TEXT_DEFAULT
        )
        helptext = None

        if not hide_help_text:
            # Should we reveal the depth of the choice?
            detailed_help_text = pl.get_boolean_attrib(
                element, "detailed-help-text", DETAILED_HELP_TEXT_DEFAULT
            )
            show_number_correct = pl.get_boolean_attrib(
                element, "show-number-correct", SHOW_NUMBER_CORRECT_DEFAULT
            )

            if show_number_correct:
                if len(correct_keys) == 1:
                    number_correct_text = (
                        " There is exactly <b>1</b> correct option in the list above."
                    )
                else:
                    number_correct_text = f" There are exactly <b>{len(correct_keys)}</b> correct options in the list above."
            else:
                number_correct_text = ""

            allow_blank = pl.get_boolean_attrib(
                element, "allow-blank", ALLOW_BLANK_DEFAULT
            )

            min_options_to_select = _get_min_options_to_select(
                element, MIN_SELECT_DEFAULT
            )
            max_options_to_select = _get_max_options_to_select(
                element, len(display_answers)
            )

            # Now we determine what the help text will be.
            #
            # If detailed_help_text is True, we reveal the values of min_options_to_select and max_options_to_select.
            #
            # If detailed_help_text is False, we reveal min_options_to_select if the following conditions are met (analogous
            # conditions are used for determining whether or not to reveal max_options_to_select):
            # 1. The "min-select" attribute is specified.
            # 2. min_options_to_select != MIN_SELECT_DEFAULT.

            show_min_select = (
                pl.has_attrib(element, "min-select")
                and min_options_to_select != MIN_SELECT_DEFAULT
            )
            show_max_select = pl.has_attrib(
                element, "max-select"
            ) and max_options_to_select != len(display_answers)

            if detailed_help_text or (show_min_select and show_max_select):
                # If we get here, we always reveal min_options_to_select and max_options_to_select.
                if min_options_to_select != max_options_to_select:
                    insert_text = f" between <b>{min_options_to_select}</b> and <b>{max_options_to_select}</b> options."
                else:
                    insert_text = f" exactly <b>{min_options_to_select}</b> options."
            # If we get here, at least one of min_options_to_select and max_options_to_select should *not* be revealed.
            elif show_min_select:
                insert_text = f" at least <b>{min_options_to_select}</b> options."
            elif show_max_select:
                insert_text = f" at most <b>{max_options_to_select}</b> options."
            else:
                # This is the case where we reveal nothing about min_options_to_select and max_options_to_select.
                insert_text = (
                    " at least 0 options." if allow_blank else " at least 1 option."
                )

            insert_text += number_correct_text

            # TODO move this into the template as well
            if detailed_help_text or show_min_select or show_max_select:
                helptext = (
                    '<small class="form-text text-muted">Select '
                    + insert_text
                    + "</small>"
                )
            else:
                # This is the case where we reveal nothing about min_options_to_select and max_options_to_select.
                helptext = (
                    '<small class="form-text text-muted">Select all possible options that apply.'
                    + number_correct_text
                    + "</small>"
                )

            info_params[partial_credit_mode.value] = True
            info_params["insert_text"] = insert_text
            info_params["num_display_answers"] = len(display_answers)

        with open(CHECKBOX_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
            info = chevron.render(f, info_params).strip()

        html_params = {
            "question": True,
            "name": name,
            "editable": editable,
            "uuid": pl.get_uuid(),
            "info": info,
            "answers": answerset,
            "inline": inline,
            "hide_letter_keys": pl.get_boolean_attrib(
                element, "hide-letter-keys", HIDE_LETTER_KEYS_DEFAULT
            ),
            "helptext": helptext,
        }

        if score is not None:
            score_type, score_value = pl.determine_score_params(score)
            html_params[score_type] = score_value

        with open(CHECKBOX_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    elif data["panel"] == "submission":
        parse_error = data["format_errors"].get(name, None)
        if parse_error is None:
            partial_score = data["partial_scores"].get(name, {"score": None})

            # Change the type becasue of how this element works
            feedback = cast(dict[str, str], partial_score.get("feedback", None))
            score = partial_score.get("score", None)

            answers = []
            for submitted_key in submitted_keys:
                submitted_answer = next(
                    filter(lambda a: a["key"] == submitted_key, display_answers)
                )
                answer_item = {
                    "key": submitted_key,
                    "html": submitted_answer["html"],
                    "display_score_badge": score is not None and show_answer_feedback,
                }
                if answer_item["display_score_badge"]:
                    answer_item["correct"] = submitted_key in correct_keys
                    answer_item["incorrect"] = submitted_key not in correct_keys
                answer_item["display_feedback"] = feedback and feedback.get(
                    submitted_key, None
                )
                answer_item["feedback"] = (
                    feedback.get(submitted_key, None) if feedback else None
                )
                answers.append(answer_item)

            html_params: dict[str, Any] = {
                "submission": True,
                "display_score_badge": (score is not None),
                "answers": answers,
                "inline": inline,
                "hide_letter_keys": pl.get_boolean_attrib(
                    element, "hide-letter-keys", HIDE_LETTER_KEYS_DEFAULT
                ),
            }

            # Add parameter for displaying overall score badge
            if score is not None:
                score_type, score_value = pl.determine_score_params(score)
                html_params[score_type] = score_value

            with open(CHECKBOX_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
                return chevron.render(f, html_params).strip()
        else:
            html_params = {
                "submission": True,
                "uuid": pl.get_uuid(),
                "parse_error": parse_error,
                "inline": inline,
            }
            with open(CHECKBOX_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
                return chevron.render(f, html_params).strip()

    elif data["panel"] == "answer":
        if pl.get_boolean_attrib(
            element, "hide-answer-panel", HIDE_ANSWER_PANEL_DEFAULT
        ):
            return ""
        correct_answer_list = data["correct_answers"].get(name, [])
        if len(correct_answer_list) == 0:
            raise ValueError("At least one option must be true.")
        html_params = {
            "answer": True,
            "inline": inline,
            "answers": correct_answer_list,
            "hide_letter_keys": pl.get_boolean_attrib(
                element, "hide-letter-keys", HIDE_LETTER_KEYS_DEFAULT
            ),
        }
        with open(CHECKBOX_MUSTACHE_TEMPLATE_NAME, encoding="utf-8") as f:
            return chevron.render(f, html_params).strip()

    else:
        assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")

    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)
    submitted_key = data["submitted_answers"].get(name, None)

    if not allow_blank:
        submitted_key_set = set()
        # Check that at least one option was selected
        if submitted_key is None:
            data["format_errors"][name] = "You must select at least one option."
            return
    else:
        # Check that the selected options are a subset of the valid options
        # FIXME: raise ValueError instead of treating as parse error?
        submitted_key_set = set(submitted_key) if submitted_key else set()
        all_keys_set = {a["key"] for a in data["params"][name]}

        if not submitted_key_set.issubset(all_keys_set):
            one_bad_key = submitted_key_set.difference(all_keys_set).pop()
            one_bad_key_str = pl.escape_invalid_string(str(one_bad_key))
            data["format_errors"][name] = (
                f"You selected an invalid option: {one_bad_key_str}"
            )
            return

    # Get minimum and maximum number of options to be selected
    min_options_to_select = _get_min_options_to_select(element, MIN_SELECT_DEFAULT)
    max_options_to_select = _get_max_options_to_select(
        element, len(data["params"][name])
    )

    # Check that the number of submitted answers is in the interval [min_options_to_select, max_options_to_select].
    if not (min_options_to_select <= len(submitted_key_set) <= max_options_to_select):
        if min_options_to_select != max_options_to_select:
            data["format_errors"][name] = (
                f"You must select between <b>{min_options_to_select}</b> and <b>{max_options_to_select}</b> options."
            )
        else:
            data["format_errors"][name] = (
                f"You must select exactly <b>{min_options_to_select}</b> options."
            )


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    number_answers = len(data["params"][name])
    partial_credit_mode = get_partial_credit_mode(element)

    submitted_set = set(data["submitted_answers"].get(name, []))
    correct_set = {answer["key"] for answer in data["correct_answers"].get(name, [])}
    feedback = {
        option["key"]: option.get("feedback", None) for option in data["params"][name]
    }

    score = 0
    if partial_credit_mode is PartialCreditType.NONE:
        score = 1 if submitted_set == correct_set else 0
    elif partial_credit_mode is PartialCreditType.PERCENT_CORRECT:
        if submitted_set == correct_set:
            score = 1
        else:
            n_correct_answers = len(correct_set) - len(correct_set - submitted_set)
            points = n_correct_answers - len(submitted_set - correct_set)
            score = max(0, points / len(correct_set))
    elif partial_credit_mode is PartialCreditType.EVERY_DECISION_COUNTS:
        number_wrong = len(submitted_set - correct_set) + len(
            correct_set - submitted_set
        )
        score = 1 - 1.0 * number_wrong / number_answers
    elif partial_credit_mode is PartialCreditType.COVERAGE:
        n_correct_answers = len(correct_set & submitted_set)
        base_score = n_correct_answers / len(correct_set)
        guessing_factor = n_correct_answers / len(submitted_set)
        score = base_score * guessing_factor
    else:
        assert_never(partial_credit_mode)

    data["partial_scores"][name] = {
        "score": score,
        "weight": weight,
        "feedback": feedback,
    }


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "answers-name")
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    partial_credit_mode = get_partial_credit_mode(element)

    correct_keys = {answer["key"] for answer in data["correct_answers"].get(name, [])}
    number_answers = len(data["params"][name])

    min_options_to_select = _get_min_options_to_select(element, MIN_SELECT_DEFAULT)
    max_options_to_select = _get_max_options_to_select(element, number_answers)

    result = data["test_type"]

    if result == "correct":
        if len(correct_keys) == 1:
            data["raw_submitted_answers"][name] = correct_keys.pop()
        elif len(correct_keys) > 1:
            data["raw_submitted_answers"][name] = list(correct_keys)
        else:
            pass  # no raw_submitted_answer if no correct keys
        feedback = {
            option["key"]: option.get("feedback", None)
            for option in data["params"][name]
        }
        data["partial_scores"][name] = {
            "score": 1,
            "weight": weight,
            "feedback": feedback,
        }
    elif result == "incorrect":
        while True:
            # select answer keys at random
            ans = {
                k
                for k in map(pl.index2key, range(number_answers))
                if random.choice([True, False])
            }
            # break and use this choice if it isn't correct
            if (
                ans != correct_keys
                and min_options_to_select <= len(ans) <= max_options_to_select
            ):
                break
        if partial_credit_mode is not PartialCreditType.NONE:
            if partial_credit_mode is PartialCreditType.PERCENT_CORRECT:
                if ans == correct_keys:
                    score = 1
                else:
                    n_correct_answers = len(correct_keys) - len(correct_keys - ans)
                    points = n_correct_answers - len(ans - correct_keys)
                    score = max(0, points / len(correct_keys))
            elif partial_credit_mode is PartialCreditType.EVERY_DECISION_COUNTS:
                number_wrong = len(ans - correct_keys) + len(correct_keys - ans)
                score = 1 - 1.0 * number_wrong / number_answers
            elif partial_credit_mode is PartialCreditType.COVERAGE:
                n_correct_answers = len(correct_keys & ans)
                base_score = n_correct_answers / len(correct_keys)
                guessing_factor = n_correct_answers / len(ans)
                score = base_score * guessing_factor
            else:
                assert_never(partial_credit_mode)
        else:
            score = 0
        feedback = {
            option["key"]: option.get("feedback", None)
            for option in data["params"][name]
        }
        data["raw_submitted_answers"][name] = list(ans)
        data["partial_scores"][name] = {
            "score": score,
            "weight": weight,
            "feedback": feedback,
        }
    elif result == "invalid":
        # FIXME: add more invalid examples
        data["raw_submitted_answers"][name] = None
        data["format_errors"][name] = "You must select at least one option."
    else:
        assert_never(result)


def _get_min_options_to_select(element: lxml.html.HtmlElement, default_val: int) -> int:
    """
    Given an HTML fragment containing a pl-checkbox element, returns the minimum number of options that must be selected in
    the checkbox element for a submission to be valid. In order of descending priority, the returned value equals:
        1. The value of the "min-select" attribute, if specified.
        2. The value of the "min-correct" attribute, if the "detailed-help-text" attribute is set to True.
        3. default_val otherwise.

    Note: this function should only be called from within this file.

    Returns:
        The minimum number of options that must be selected in the checkbox element for a submission to be valid
    """
    detailed_help_text = pl.get_boolean_attrib(
        element, "detailed-help-text", DETAILED_HELP_TEXT_DEFAULT
    )

    allow_blank = pl.get_boolean_attrib(element, "allow-blank", ALLOW_BLANK_DEFAULT)

    if pl.has_attrib(element, "min-select"):
        min_options_to_select = pl.get_integer_attrib(element, "min-select")
    elif pl.has_attrib(element, "min-correct") and detailed_help_text:
        min_options_to_select = pl.get_integer_attrib(element, "min-correct")
    elif allow_blank:
        min_options_to_select = MIN_SELECT_BLANK
    else:
        min_options_to_select = default_val

    return min_options_to_select


def _get_max_options_to_select(element: lxml.html.HtmlElement, default_val: int) -> int:
    """
    Given an HTML fragment containing a pl-checkbox element, returns the maximum number of options that can be selected in
    the checkbox element for a submission to be valid. In order of descending priority, the returned value equals:
        1. The value of the "max-select" attribute, if specified.
        2. The value of the "max-correct" attribute, if the "detailed-help-text" attribute is set to True.
        3. default_val otherwise.

    Note: this function should only be called from within this file.

    Returns:
        The maximum number of options that can be selected in the checkbox element for a submission to be valid
    """
    detailed_help_text = pl.get_boolean_attrib(
        element, "detailed-help-text", DETAILED_HELP_TEXT_DEFAULT
    )

    if pl.has_attrib(element, "max-select"):
        max_options_to_select = pl.get_integer_attrib(element, "max-select")
    elif pl.has_attrib(element, "max-correct") and detailed_help_text:
        max_options_to_select = pl.get_integer_attrib(element, "max-correct")
    else:
        max_options_to_select = default_val

    return max_options_to_select
