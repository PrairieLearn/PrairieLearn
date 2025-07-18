import base64
import json
import math
import os
import random
from copy import deepcopy
from enum import Enum
from typing import TypedDict

import chevron
import lxml.html
import prairielearn as pl
from dag_checker import grade_dag, lcs_partial_credit, solve_dag
from lxml.etree import _Comment
from typing_extensions import NotRequired, assert_never


class GradingMethodType(Enum):
    UNORDERED = "unordered"
    ORDERED = "ordered"
    RANKING = "ranking"
    DAG = "dag"
    EXTERNAL = "external"


class SourceBlocksOrderType(Enum):
    RANDOM = "random"
    ALPHABETIZED = "alphabetized"
    ORDERED = "ordered"


class SolutionPlacementType(Enum):
    RIGHT = "right"
    BOTTOM = "bottom"


class FeedbackType(Enum):
    NONE = "none"
    FIRST_WRONG = "first-wrong"
    FIRST_WRONG_VERBOSE = "first-wrong-verbose"


class PartialCreditType(Enum):
    NONE = "none"
    LCS = "lcs"


class FormatType(Enum):
    DEFAULT = "default"
    CODE = "code"


class GroupInfo(TypedDict):
    tag: str | None
    depends: list[str] | None


class OrderBlocksAnswerData(TypedDict):
    inner_html: str
    indent: int | None
    ranking: int
    index: int
    tag: str
    distractor_for: str | None
    depends: list[str]  # only used with DAG grader
    group_info: GroupInfo  # only used with DAG grader
    distractor_bin: NotRequired[str]
    distractor_feedback: str | None
    ordering_feedback: str | None
    uuid: str


FIRST_WRONG_TYPES = frozenset([
    FeedbackType.FIRST_WRONG,
    FeedbackType.FIRST_WRONG_VERBOSE,
])
LCS_GRADABLE_TYPES = frozenset([
    GradingMethodType.RANKING,
    GradingMethodType.DAG,
    GradingMethodType.ORDERED,
])
GRADING_METHOD_DEFAULT = GradingMethodType.ORDERED
SOURCE_BLOCKS_ORDER_DEFAULT = SourceBlocksOrderType.ALPHABETIZED
FEEDBACK_DEFAULT = FeedbackType.NONE
PL_ANSWER_CORRECT_DEFAULT = True
PL_ANSWER_INDENT_DEFAULT = -1
ALLOW_BLANK_DEFAULT = False
INDENTION_DEFAULT = False
INLINE_DEFAULT = False
ANSWER_INDENT_DEFAULT = None
DISTRACTOR_FEEDBACK_DEFAULT = None
ORDERING_FEEDBACK_DEFAULT = None
DISTRACTOR_FOR_DEFAULT = None
MAX_INDENTION_DEFAULT = 4
SOURCE_HEADER_DEFAULT = "Drag from here:"
SOLUTION_HEADER_DEFAULT = "Construct your solution here:"
FILE_NAME_DEFAULT = "user_code.py"
WEIGHT_DEFAULT = 1
TAB_SIZE_PX = 50
SPEC_CHAR_STR = "*&^$@!~[]{}()|:@?/\\"
SPEC_CHAR = frozenset(SPEC_CHAR_STR)
FIRST_WRONG_FEEDBACK = {
    "incomplete": "Your answer is correct so far, but it is incomplete.",
    "wrong-at-block": r"""Your answer is incorrect starting at <span style="color:red;">block number {}</span>.
        The problem is most likely one of the following:
        <ul><li> This block is not a part of the correct solution </li>
        <li>This block needs to come after a block that did not appear before it </li>""",
    "indentation": r"""<li>This line is indented incorrectly </li>""",
    "block-group": r"""<li> You have attempted to start a new section of the answer without finishing the previous section </li>""",
    "distractor-feedback": r"""Your answer is incorrect starting at <span style="color:red;">block number {}</span> as the block at that location is not a part of any correct solution.""",
}


def get_graph_info(html_tags: lxml.html.HtmlElement) -> tuple[str, list[str]]:
    tag = pl.get_string_attrib(html_tags, "tag", pl.get_uuid()).strip()
    depends = pl.get_string_attrib(html_tags, "depends", "")
    depends = [tag.strip() for tag in depends.split(",")] if depends else []
    return tag, depends


def extract_dag(
    answers_list: list[OrderBlocksAnswerData],
) -> tuple[dict[str, list[str]], dict[str, str | None]]:
    depends_graph = {ans["tag"]: ans["depends"] for ans in answers_list}
    group_belonging = {ans["tag"]: ans["group_info"]["tag"] for ans in answers_list}
    group_depends = {
        ans["group_info"]["tag"]: ans["group_info"]["depends"]
        for ans in answers_list
        if ans["group_info"]["depends"] is not None
        and ans["group_info"]["tag"] is not None
    }
    depends_graph.update(group_depends)
    return depends_graph, group_belonging


def solve_problem(
    answers_list: list[OrderBlocksAnswerData], grading_method: GradingMethodType
) -> list[OrderBlocksAnswerData]:
    if (
        grading_method is GradingMethodType.EXTERNAL
        or grading_method is GradingMethodType.UNORDERED
        or grading_method is GradingMethodType.ORDERED
    ):
        return answers_list
    elif grading_method is GradingMethodType.RANKING:
        return sorted(answers_list, key=lambda x: int(x["ranking"]))
    elif grading_method is GradingMethodType.DAG:
        depends_graph, group_belonging = extract_dag(answers_list)
        solution = solve_dag(depends_graph, group_belonging)
        return sorted(answers_list, key=lambda x: solution.index(x["tag"]))
    else:
        assert_never(grading_method)


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    required_attribs = ["answers-name"]
    optional_attribs = [
        "source-blocks-order",
        "grading-method",
        "indentation",
        "source-header",
        "solution-header",
        "file-name",
        "solution-placement",
        "max-incorrect",
        "min-incorrect",
        "weight",
        "inline",
        "max-indent",
        "feedback",
        "partial-credit",
        "format",
        "code-language",
        "allow-blank",
    ]

    pl.check_attribs(
        element, required_attribs=required_attribs, optional_attribs=optional_attribs
    )
    answer_name = pl.get_string_attrib(element, "answers-name")
    pl.check_answers_names(data, answer_name)

    check_indentation = pl.get_boolean_attrib(element, "indentation", INDENTION_DEFAULT)
    grading_method = pl.get_enum_attrib(
        element, "grading-method", GradingMethodType, GRADING_METHOD_DEFAULT
    )
    feedback_type = pl.get_enum_attrib(
        element, "feedback", FeedbackType, FEEDBACK_DEFAULT
    )

    if grading_method not in LCS_GRADABLE_TYPES and pl.has_attrib(
        element, "partial-credit"
    ):
        raise ValueError(
            "You may only specify partial credit options in the DAG, ordered, and ranking grading modes."
        )

    if (
        grading_method is not GradingMethodType.DAG
        and grading_method is not GradingMethodType.RANKING
        and feedback_type is not FeedbackType.NONE
    ):
        raise ValueError(
            f"feedback type {feedback_type.value} is not available with the {grading_method.value} grading-method."
        )

    format_type = pl.get_enum_attrib(element, "format", FormatType, FormatType.DEFAULT)
    code_language = pl.get_string_attrib(element, "code-language", None)
    if format_type is FormatType.DEFAULT and code_language is not None:
        raise ValueError('code-language attribute may only be used with format="code"')

    correct_answers: list[OrderBlocksAnswerData] = []
    incorrect_answers: list[OrderBlocksAnswerData] = []
    used_tags = set()

    def prepare_tag(
        html_tags: lxml.html.HtmlElement,
        index: int,
        group_info: GroupInfo,
    ) -> None:
        if html_tags.tag != "pl-answer":
            raise ValueError(
                "Any html tags nested inside <pl-order-blocks> must be <pl-answer> or <pl-block-group>. \
                Any html tags nested inside <pl-block-group> must be <pl-answer>"
            )

        if grading_method is GradingMethodType.EXTERNAL:
            pl.check_attribs(
                html_tags, required_attribs=[], optional_attribs=["correct"]
            )
        elif grading_method in [GradingMethodType.UNORDERED, GradingMethodType.ORDERED]:
            pl.check_attribs(
                html_tags,
                required_attribs=[],
                optional_attribs=["correct", "indent", "distractor-feedback"],
            )
        elif grading_method is GradingMethodType.RANKING:
            pl.check_attribs(
                html_tags,
                required_attribs=[],
                optional_attribs=[
                    "correct",
                    "tag",
                    "ranking",
                    "indent",
                    "distractor-feedback",
                    "distractor-for",
                    "ordering-feedback",
                ],
            )
        elif grading_method is GradingMethodType.DAG:
            pl.check_attribs(
                html_tags,
                required_attribs=[],
                optional_attribs=[
                    "correct",
                    "tag",
                    "depends",
                    "comment",
                    "indent",
                    "distractor-feedback",
                    "distractor-for",
                    "ordering-feedback",
                ],
            )

        is_correct = pl.get_boolean_attrib(
            html_tags, "correct", PL_ANSWER_CORRECT_DEFAULT
        )
        answer_indent = pl.get_integer_attrib(
            html_tags, "indent", ANSWER_INDENT_DEFAULT
        )
        inner_html = pl.inner_html(html_tags)
        ranking = pl.get_integer_attrib(html_tags, "ranking", -1)
        distractor_feedback = pl.get_string_attrib(
            html_tags, "distractor-feedback", DISTRACTOR_FEEDBACK_DEFAULT
        )
        ordering_feedback = pl.get_string_attrib(
            html_tags, "ordering-feedback", ORDERING_FEEDBACK_DEFAULT
        )

        distractor_for = pl.get_string_attrib(
            html_tags, "distractor-for", DISTRACTOR_FOR_DEFAULT
        )

        if distractor_for is not None and is_correct:
            raise ValueError(
                "The distractor-for attribute may only be used on blocks with correct=false."
            )

        if ordering_feedback is not None and not is_correct:
            raise ValueError(
                "The ordering-feedback attribute may only be used on blocks with correct=true."
            )

        tag, depends = get_graph_info(html_tags)
        if SPEC_CHAR.intersection(tag):
            raise ValueError(
                f'<pl-answer tag="{tag}"> tag attribute may not contain special characters: "{SPEC_CHAR_STR}"'
            )

        if is_correct:
            if tag in used_tags:
                raise ValueError(
                    f'Tag "{tag}" used in multiple places. The tag attribute for each <pl-answer> and <pl-block-group> must be unique.'
                )
            used_tags.add(tag)

        if check_indentation is False and answer_indent is not None:
            raise ValueError(
                "<pl-answer> should not specify indentation if indentation is disabled."
            )

        if format_type is FormatType.CODE:
            inner_html = (
                "<pl-code"
                + (' language="' + code_language + '"' if code_language else "")
                + ">"
                + inner_html
                + "</pl-code>"
            )

        answer_data_dict: OrderBlocksAnswerData = {
            "inner_html": inner_html,
            "indent": answer_indent,
            "ranking": ranking,
            "index": index,
            "tag": tag,
            "distractor_for": distractor_for,
            "depends": depends,  # only used with DAG grader
            "group_info": group_info,  # only used with DAG grader
            "distractor_feedback": distractor_feedback,
            "ordering_feedback": ordering_feedback,
            "uuid": pl.get_uuid(),
        }
        if is_correct:
            correct_answers.append(answer_data_dict)
        else:
            incorrect_answers.append(answer_data_dict)

    index = 0
    for html_tags in element:  # iterate through the html tags inside pl-order-blocks
        if isinstance(html_tags, _Comment):
            continue
        if html_tags.tag == "pl-block-group":
            if grading_method is not GradingMethodType.DAG:
                raise ValueError(
                    'Block groups only supported in the "dag" grading mode.'
                )

            group_tag, group_depends = get_graph_info(html_tags)
            if group_tag in used_tags:
                raise ValueError(
                    f'Tag "{group_tag}" used in multiple places. The tag attribute for each <pl-answer> and <pl-block-group> must be unique.'
                )
            used_tags.add(group_tag)

            for grouped_tag in html_tags:
                if isinstance(grouped_tag, _Comment):
                    continue
                prepare_tag(
                    grouped_tag, index, {"tag": group_tag, "depends": group_depends}
                )
                index += 1
        else:
            prepare_tag(html_tags, index, {"tag": None, "depends": None})
            index += 1

    if grading_method is not GradingMethodType.EXTERNAL and len(correct_answers) == 0:
        raise ValueError("There are no correct answers specified for this question.")

    all_incorrect_answers = len(incorrect_answers)
    max_incorrect = pl.get_integer_attrib(
        element, "max-incorrect", all_incorrect_answers
    )
    min_incorrect = pl.get_integer_attrib(
        element, "min-incorrect", all_incorrect_answers
    )

    if min_incorrect > len(incorrect_answers) or max_incorrect > len(incorrect_answers):
        raise ValueError(
            "The min-incorrect or max-incorrect attribute may not exceed the number of incorrect <pl-answers>."
        )
    if min_incorrect > max_incorrect:
        raise ValueError(
            "The attribute min-incorrect must be smaller than max-incorrect."
        )

    incorrect_answers_count = random.randint(min_incorrect, max_incorrect)

    sampled_correct_answers = correct_answers
    sampled_incorrect_answers = random.sample(
        incorrect_answers, incorrect_answers_count
    )

    all_blocks = sampled_correct_answers + sampled_incorrect_answers

    source_blocks_order = pl.get_enum_attrib(
        element,
        "source-blocks-order",
        SourceBlocksOrderType,
        SOURCE_BLOCKS_ORDER_DEFAULT,
    )
    if source_blocks_order == SourceBlocksOrderType.RANDOM:
        random.shuffle(all_blocks)
    elif source_blocks_order == SourceBlocksOrderType.ORDERED:
        all_blocks.sort(key=lambda a: a["index"])
    elif source_blocks_order == SourceBlocksOrderType.ALPHABETIZED:
        all_blocks.sort(key=lambda a: a["inner_html"])
    else:
        assert_never(source_blocks_order)

    # prep for visual pairing
    correct_tags = {block["tag"] for block in all_blocks}
    incorrect_tags = {
        block["distractor_for"] for block in all_blocks if block["distractor_for"]
    }

    if not incorrect_tags.issubset(correct_tags):
        raise ValueError(
            f"The following distractor-for tags do not have matching correct answer tags: {incorrect_tags - correct_tags}"
        )

    for block in all_blocks:
        if block["distractor_for"] is not None:
            continue

        distractors = [
            block2
            for block2 in all_blocks
            if (block["tag"] == block2.get("distractor_for"))
        ]

        if len(distractors) == 0:
            continue

        distractor_bin = pl.get_uuid()
        block["distractor_bin"] = distractor_bin
        for distractor in distractors:
            distractor["distractor_bin"] = distractor_bin

    data["params"][answer_name] = all_blocks
    data["correct_answers"][answer_name] = correct_answers

    # if the order of the blocks in the HTML is a correct solution, leave it unchanged, but if it
    # isn't we need to change it into a solution before displaying it as such
    data_copy = deepcopy(data)
    data_copy["submitted_answers"] = {answer_name: deepcopy(correct_answers)}
    data_copy["partial_scores"] = {}
    grade(element_html, data_copy)
    if data_copy["partial_scores"][answer_name]["score"] != 1:
        data["correct_answers"][answer_name] = solve_problem(
            correct_answers, grading_method
        )


def get_distractors(
    all_blocks: list[OrderBlocksAnswerData], correct_blocks: list[OrderBlocksAnswerData]
) -> list[OrderBlocksAnswerData]:
    return [
        block
        for block in all_blocks
        if block["uuid"] not in {block2["uuid"] for block2 in correct_blocks}
    ]


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, "answers-name")
    format_type = pl.get_enum_attrib(element, "format", FormatType, FormatType.DEFAULT)
    inline = pl.get_boolean_attrib(element, "inline", INLINE_DEFAULT)
    dropzone_layout = pl.get_enum_attrib(
        element,
        "solution-placement",
        SolutionPlacementType,
        SolutionPlacementType.RIGHT,
    )
    block_formatting = (
        "pl-order-blocks-code" if format_type is FormatType.CODE else "list-group-item"
    )
    grading_method = pl.get_enum_attrib(
        element, "grading-method", GradingMethodType, GRADING_METHOD_DEFAULT
    )

    if data["panel"] == "question":
        editable = data["editable"]

        answer_name = pl.get_string_attrib(element, "answers-name")
        source_header = pl.get_string_attrib(
            element, "source-header", SOURCE_HEADER_DEFAULT
        )
        solution_header = pl.get_string_attrib(
            element, "solution-header", SOLUTION_HEADER_DEFAULT
        )

        # We aren't allowed to mutate the `data` object during render, so we'll
        # make a deep copy of the submitted answer so we can update the `indent`
        # to a value suitable for rendering.
        student_previous_submission = deepcopy(
            data["submitted_answers"].get(answer_name, [])
        )
        submitted_block_ids = {block["uuid"] for block in student_previous_submission}

        all_blocks = data["params"][answer_name]
        source_blocks = [
            block for block in all_blocks if block["uuid"] not in submitted_block_ids
        ]

        for option in student_previous_submission:
            submission_indent = option.get("indent", None)

            if submission_indent is not None:
                submission_indent = int(submission_indent) * TAB_SIZE_PX
            option["indent"] = submission_indent

        check_indentation = pl.get_boolean_attrib(
            element, "indentation", INDENTION_DEFAULT
        )
        max_indent = pl.get_integer_attrib(element, "max-indent", MAX_INDENTION_DEFAULT)

        help_text = (
            "Drag answer tiles into the answer area to the "
            + dropzone_layout.value
            + ". "
        )

        if inline and check_indentation:
            raise ValueError(
                "The indentation attribute may not be used when inline is true."
            )

        if grading_method is GradingMethodType.UNORDERED:
            help_text += "<p>Your answer ordering does not matter. </p>"
        elif grading_method is not GradingMethodType.EXTERNAL:
            help_text += "<p>The ordering of your answer matters and is graded.</p>"
        else:
            help_text += "<p>Your answer will be autograded; be sure to indent and order your answer properly.</p>"

        if check_indentation:
            help_text += "<p><strong>Your answer should be indented.</strong> Indent your tiles by dragging them horizontally in the answer area.</p>"

        help_text += "<p>Keyboard Controls: Arrows to navigate; Enter to select; Escape to deselect blocks.</p>"

        uuid = pl.get_uuid()
        html_params = {
            "question": True,
            "answer_name": answer_name,
            "source-header": source_header,
            "solution-header": solution_header,
            "options": source_blocks,
            "submission_dict": student_previous_submission,
            "dropzone_layout": (
                "pl-order-blocks-bottom"
                if dropzone_layout is SolutionPlacementType.BOTTOM
                else "pl-order-blocks-right"
            ),
            "inline": str(inline).lower(),
            "check_indentation": "true" if check_indentation else "false",
            "help_text": help_text,
            "max_indent": max_indent,
            "uuid": uuid,
            "block_formatting": block_formatting,
            "editable": editable,
            "block_layout": "pl-order-blocks-horizontal" if inline else "",
        }

        with open("pl-order-blocks.mustache", encoding="utf-8") as f:
            html = chevron.render(f, html_params)
        return html

    elif data["panel"] == "submission":
        if grading_method is GradingMethodType.EXTERNAL:
            return ""  # external grader is responsible for displaying results screen

        student_submission = [
            {
                "inner_html": attempt["inner_html"],
                "indent": (attempt["indent"] or 0) * TAB_SIZE_PX,
                "badge_type": attempt.get("badge_type", ""),
                "icon": attempt.get("icon", ""),
                "distractor_feedback": attempt.get("distractor_feedback", ""),
                "ordering_feedback": attempt.get("ordering_feedback", ""),
            }
            for attempt in data["submitted_answers"].get(answer_name, [])
        ]

        score = None
        feedback = None
        if answer_name in data["partial_scores"]:
            score = data["partial_scores"][answer_name]["score"]
            feedback = data["partial_scores"][answer_name].get("feedback", "")

        html_params = {
            "submission": True,
            "parse-error": data["format_errors"].get(answer_name, None),
            "student_submission": student_submission,
            "feedback": feedback,
            "block_formatting": block_formatting,
            "allow_feedback_badges": not all(
                block.get("badge_type", "") == "" for block in student_submission
            ),
            "block_layout": "pl-order-blocks-horizontal" if inline else "",
            "dropzone_layout": (
                "pl-order-blocks-bottom"
                if dropzone_layout is SolutionPlacementType.BOTTOM
                else "pl-order-blocks-right"
            ),
        }

        if score is not None:
            try:
                score = float(score * 100)
                if score >= 100:
                    html_params["correct"] = True
                elif score > 0:
                    html_params["partially_correct"] = math.floor(score)
                else:
                    html_params["incorrect"] = True
            except Exception as exc:
                raise ValueError(
                    f"invalid score: {data['partial_scores'][answer_name].get('score', 0)}"
                ) from exc

        with open("pl-order-blocks.mustache", encoding="utf-8") as f:
            html = chevron.render(f, html_params)
        return html

    elif data["panel"] == "answer":
        if grading_method is GradingMethodType.EXTERNAL:
            try:
                base_path = data["options"]["question_path"]
                file_lead_path = os.path.join(base_path, "tests/ans.py")
                with open(file_lead_path) as file:
                    solution_file = file.read()
                return f'<pl-code language="python">{solution_file}</pl-code>'
            except FileNotFoundError:
                return "The reference solution is not provided for this question."

        if grading_method is GradingMethodType.UNORDERED:
            ordering_message = "in any order"
        elif grading_method in [GradingMethodType.DAG, GradingMethodType.RANKING]:
            ordering_message = "there may be other correct orders"
        else:
            ordering_message = "in the specified order"
        check_indentation = pl.get_boolean_attrib(
            element, "indentation", INDENTION_DEFAULT
        )

        required_indents = {
            block["indent"] for block in data["correct_answers"][answer_name]
        }
        indentation_message = ""
        if check_indentation:
            if -1 not in required_indents:
                indentation_message = ", correct indentation required"
            elif len(required_indents) > 1:
                indentation_message = ", some blocks require correct indentation"

        distractors = get_distractors(
            data["params"][answer_name], data["correct_answers"][answer_name]
        )

        question_solution = [
            {
                "inner_html": solution["inner_html"],
                "indent": max(0, (solution["indent"] or 0) * TAB_SIZE_PX),
            }
            for solution in data["correct_answers"][answer_name]
        ]

        html_params = {
            "true_answer": True,
            "question_solution": question_solution,
            "ordering_message": ordering_message,
            "indentation_message": indentation_message,
            "block_formatting": block_formatting,
            "distractors": distractors,
            "show_distractors": (len(distractors) > 0),
            "block_layout": "pl-order-blocks-horizontal" if inline else "",
            "dropzone_layout": (
                "pl-order-blocks-bottom"
                if dropzone_layout is SolutionPlacementType.BOTTOM
                else "pl-order-blocks-right"
            ),
        }
        with open("pl-order-blocks.mustache", encoding="utf-8") as f:
            html = chevron.render(f, html_params)
        return html

    else:
        assert_never(data["panel"])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, "answers-name")
    allow_blank_submission = pl.get_boolean_attrib(
        element, "allow-blank", ALLOW_BLANK_DEFAULT
    )

    answer_raw_name = answer_name + "-input"
    student_answer = data["raw_submitted_answers"].get(answer_raw_name, "[]")
    student_answer = json.loads(student_answer)

    if (not allow_blank_submission) and (
        student_answer is None or student_answer == []
    ):
        data["format_errors"][answer_name] = (
            "Your submitted answer was blank; you did not drag any answer blocks into the answer area."
        )
        return

    grading_method = pl.get_enum_attrib(
        element, "grading-method", GradingMethodType, GRADING_METHOD_DEFAULT
    )
    correct_answers = data["correct_answers"][answer_name]
    blocks = data["params"][answer_name]

    if grading_method in LCS_GRADABLE_TYPES:
        for answer in student_answer:
            matching_block = next(
                (
                    block
                    for block in correct_answers
                    if block["inner_html"] == answer["inner_html"]
                ),
                None,
            )
            answer["tag"] = (
                matching_block["tag"] if matching_block is not None else None
            )
            if grading_method is GradingMethodType.RANKING:
                answer["ranking"] = (
                    matching_block["ranking"] if matching_block is not None else None
                )

            if matching_block is None:
                matching_block = next(
                    block
                    for block in blocks
                    if block["inner_html"] == answer["inner_html"]
                )
            answer["distractor_feedback"] = matching_block.get(
                "distractor_feedback", ""
            )
            answer["ordering_feedback"] = matching_block.get("ordering_feedback", "")

    if grading_method is GradingMethodType.EXTERNAL:
        for html_tags in element:
            if html_tags.tag == "pl-answer":
                pl.check_attribs(html_tags, required_attribs=[], optional_attribs=[])
        file_name = pl.get_string_attrib(element, "file-name", FILE_NAME_DEFAULT)

        answer_code = ""
        for answer in student_answer:
            indent = int(answer["indent"] or 0)
            answer_code += (
                ("    " * indent)
                + lxml.html.fromstring(answer["inner_html"]).text_content()
                + "\n"
            )

        if len(answer_code) == 0:
            pl.add_files_format_error(data, "The submitted file was empty.")
        else:
            pl.add_submitted_file(
                data,
                file_name,
                base64.b64encode(answer_code.encode("utf-8")).decode("utf-8"),
            )

    data["submitted_answers"][answer_name] = student_answer
    data["submitted_answers"].pop(answer_raw_name, None)


def construct_feedback(
    feedback_type: FeedbackType,
    first_wrong: int | None,
    group_belonging: dict[str, str | None],
    check_indentation: bool,
    first_wrong_is_distractor: bool,
) -> str:
    if feedback_type is FeedbackType.NONE:
        return ""

    if first_wrong is None:
        return FIRST_WRONG_FEEDBACK["incomplete"]
    elif (
        feedback_type is FeedbackType.FIRST_WRONG_VERBOSE and first_wrong_is_distractor
    ):
        return FIRST_WRONG_FEEDBACK["distractor-feedback"].format(str(first_wrong + 1))
    else:
        feedback = FIRST_WRONG_FEEDBACK["wrong-at-block"].format(str(first_wrong + 1))
        has_block_groups = group_belonging and set(group_belonging.values()) != {None}
        if check_indentation:
            feedback += FIRST_WRONG_FEEDBACK["indentation"]
        if has_block_groups:
            feedback += FIRST_WRONG_FEEDBACK["block-group"]
        feedback += "</ul>"
        return feedback


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    answer_name = pl.get_string_attrib(element, "answers-name")
    student_answer = data["submitted_answers"][answer_name]
    grading_method = pl.get_enum_attrib(
        element, "grading-method", GradingMethodType, GRADING_METHOD_DEFAULT
    )
    check_indentation = pl.get_boolean_attrib(element, "indentation", INDENTION_DEFAULT)
    feedback_type = pl.get_enum_attrib(
        element, "feedback", FeedbackType, FEEDBACK_DEFAULT
    )
    answer_weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)

    partial_credit_type = pl.get_enum_attrib(
        element,
        "partial-credit",
        PartialCreditType,
        get_default_partial_credit_type(grading_method),
    )

    true_answer_list = data["correct_answers"][answer_name]

    final_score = 0
    feedback = ""
    first_wrong = None

    if check_indentation:
        indentations = {ans["uuid"]: ans["indent"] for ans in true_answer_list}
        for ans in student_answer:
            indentation = indentations.get(ans["uuid"])
            if indentation != -1 and ans["indent"] != indentation:
                if "tag" in ans:
                    ans["tag"] = None
                else:
                    ans["inner_html"] = None

    if grading_method is GradingMethodType.UNORDERED:
        true_answer_uuids = {ans["uuid"] for ans in true_answer_list}
        student_answer_uuids = {ans["uuid"] for ans in student_answer}
        correct_selections = len(true_answer_uuids.intersection(student_answer_uuids))
        incorrect_selections = len(student_answer) - correct_selections

        final_score = float(correct_selections - incorrect_selections) / len(
            true_answer_list
        )
        final_score = max(0.0, final_score)  # scores cannot be below 0

    elif grading_method in LCS_GRADABLE_TYPES:
        submission = [ans["tag"] for ans in student_answer]
        depends_graph = {}
        group_belonging = {}

        if grading_method in [GradingMethodType.RANKING, GradingMethodType.ORDERED]:
            if grading_method is GradingMethodType.ORDERED:
                for index, answer in enumerate(true_answer_list):
                    answer["ranking"] = index

            true_answer_list = sorted(true_answer_list, key=lambda x: int(x["ranking"]))
            true_answer = [answer["tag"] for answer in true_answer_list]
            tag_to_rank = {
                answer["tag"]: answer["ranking"] for answer in true_answer_list
            }
            lines_of_rank = {
                rank: [tag for tag in tag_to_rank if tag_to_rank[tag] == rank]
                for rank in set(tag_to_rank.values())
            }

            cur_rank_depends = []
            prev_rank = None
            for tag in true_answer:
                ranking = tag_to_rank[tag]
                if prev_rank is not None and ranking != prev_rank:
                    cur_rank_depends = lines_of_rank[prev_rank]
                depends_graph[tag] = cur_rank_depends
                prev_rank = ranking

        elif grading_method is GradingMethodType.DAG:
            depends_graph, group_belonging = extract_dag(true_answer_list)

        num_initial_correct, true_answer_length = grade_dag(
            submission, depends_graph, group_belonging
        )
        first_wrong = (
            None if num_initial_correct == len(submission) else num_initial_correct
        )

        if feedback_type in FIRST_WRONG_TYPES:
            for block in student_answer[:num_initial_correct]:
                block["badge_type"] = "text-bg-success"
                block["icon"] = "fa-check"
                block["distractor_feedback"] = ""
                block["ordering_feedback"] = ""

            if first_wrong is not None:
                student_answer[first_wrong]["badge_type"] = "text-bg-danger"
                student_answer[first_wrong]["icon"] = "fa-xmark"
                if feedback_type is not FeedbackType.FIRST_WRONG_VERBOSE:
                    student_answer[first_wrong]["distractor_feedback"] = ""
                    student_answer[first_wrong]["ordering_feedback"] = ""

                for block in student_answer[first_wrong + 1 :]:
                    block["badge_type"] = ""
                    block["icon"] = ""
                    block["distractor_feedback"] = ""
                    block["ordering_feedback"] = ""

        num_initial_correct, true_answer_length = grade_dag(
            submission, depends_graph, group_belonging
        )

        if partial_credit_type is PartialCreditType.NONE:
            if num_initial_correct == true_answer_length:
                final_score = 1
            elif num_initial_correct < true_answer_length:
                final_score = 0
        elif partial_credit_type is PartialCreditType.LCS:
            edit_distance = lcs_partial_credit(
                submission, depends_graph, group_belonging
            )
            final_score = max(
                0, float(true_answer_length - edit_distance) / true_answer_length
            )

        if final_score < 1:
            first_wrong_is_distractor = first_wrong is not None and student_answer[
                first_wrong
            ]["uuid"] in {
                block["uuid"]
                for block in get_distractors(
                    data["params"][answer_name], data["correct_answers"][answer_name]
                )
            }
            feedback = construct_feedback(
                feedback_type,
                first_wrong,
                group_belonging,
                check_indentation,
                first_wrong_is_distractor,
            )

    data["partial_scores"][answer_name] = {
        "score": round(final_score, 2),
        "feedback": feedback,
        "weight": answer_weight,
    }


def get_default_partial_credit_type(
    grading_method: GradingMethodType,
) -> PartialCreditType:
    # For backward compatibility, we need to override the default partial credit type
    # when grading_method = ORDERED
    return (
        PartialCreditType.NONE
        if grading_method is GradingMethodType.ORDERED
        else PartialCreditType.LCS
    )


def test(element_html: str, data: pl.ElementTestData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    grading_method = pl.get_enum_attrib(
        element, "grading-method", GradingMethodType, GRADING_METHOD_DEFAULT
    )
    answer_name = pl.get_string_attrib(element, "answers-name")
    answer_name_field = answer_name + "-input"
    weight = pl.get_integer_attrib(element, "weight", WEIGHT_DEFAULT)
    check_indentation = pl.get_boolean_attrib(element, "indentation", INDENTION_DEFAULT)
    feedback_type = pl.get_enum_attrib(
        element, "feedback", FeedbackType, FEEDBACK_DEFAULT
    )

    partial_credit_type = pl.get_enum_attrib(
        element,
        "partial-credit",
        PartialCreditType,
        get_default_partial_credit_type(grading_method),
    )

    # Right now invalid input must mean an empty response. Because user input is only
    # through drag and drop, there is no other way for their to be invalid input. This
    # may change in the future if we have nested input boxes (like faded parsons' problems).
    if data["test_type"] == "invalid":
        data["raw_submitted_answers"][answer_name_field] = json.dumps([])
        data["format_errors"][answer_name] = "No answer was submitted."

    # TODO grading modes 'unordered,' 'dag,' and 'ranking' allow multiple different possible
    # correct answers, we should check them at random instead of just the provided solution
    elif data["test_type"] == "correct":
        answer = data["correct_answers"][answer_name]
        data["raw_submitted_answers"][answer_name_field] = json.dumps(answer)
        data["partial_scores"][answer_name] = {
            "score": 1,
            "weight": weight,
            "feedback": "",
        }

    # TODO: The only wrong answer being tested is the correct answer with the first
    # block mising. We should instead do a random selection of correct and incorrect blocks.
    elif data["test_type"] == "incorrect":
        answer = deepcopy(data["correct_answers"][answer_name])
        answer.pop(0)
        score = 0
        if grading_method is GradingMethodType.UNORDERED or (
            grading_method in LCS_GRADABLE_TYPES
            and partial_credit_type is PartialCreditType.LCS
        ):
            score = round(float(len(answer)) / (len(answer) + 1), 2)

        if grading_method in [
            GradingMethodType.DAG,
            GradingMethodType.RANKING,
        ]:
            first_wrong = 0
            group_belonging = {
                ans["tag"]: ans["group_info"]["tag"]
                for ans in data["correct_answers"][answer_name]
            }
            first_wrong_is_distractor = answer[first_wrong]["uuid"] in {
                block["uuid"]
                for block in get_distractors(
                    data["params"][answer_name], data["correct_answers"][answer_name]
                )
            }
            feedback = construct_feedback(
                feedback_type,
                first_wrong,
                group_belonging,
                check_indentation,
                first_wrong_is_distractor,
            )
        else:
            feedback = ""

        data["raw_submitted_answers"][answer_name_field] = json.dumps(answer)
        data["partial_scores"][answer_name] = {
            "score": score,
            "weight": weight,
            "feedback": feedback,
        }

    else:
        raise ValueError("invalid result: {}".format(data["test_type"]))
