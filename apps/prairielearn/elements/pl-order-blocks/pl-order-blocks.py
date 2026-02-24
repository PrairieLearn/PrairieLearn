import base64
import json
import math
import os
import random
from collections import defaultdict
from copy import deepcopy
from typing import TypedDict

import chevron
import lxml.html
import prairielearn as pl
from dag_checker import (
    ColoredEdges,
    Dag,
    Edges,
    Multigraph,
    grade_dag,
    grade_multigraph,
    has_colored_edges,
    lcs_partial_credit,
    solve_dag,
    solve_multigraph,
)
from order_blocks_options_parsing import (
    LCS_GRADABLE_TYPES,
    DistractorOrderType,
    FeedbackType,
    FormatType,
    GradingMethodType,
    GroupInfo,
    OrderBlocksOptions,
    PartialCreditType,
    SolutionPlacementType,
    SourceBlocksOrderType,
)
from typing_extensions import NotRequired, assert_never


class OrderBlocksAnswerData(TypedDict):
    inner_html: str
    indent: int | None
    ranking: int
    index: int
    tag: str
    distractor_for: str | None
    depends: Edges | ColoredEdges  # only used with DAG grader
    group_info: GroupInfo  # only used with DAG grader
    distractor_bin: NotRequired[str]
    distractor_feedback: str | None
    ordering_feedback: str | None
    uuid: str
    final: bool | None


FIRST_WRONG_TYPES = frozenset([
    FeedbackType.FIRST_WRONG,
    FeedbackType.FIRST_WRONG_VERBOSE,
])


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


def extract_dag(
    answers_list: list[OrderBlocksAnswerData],
) -> tuple[Dag, dict[str, str | None]]:
    depends_graph = {
        ans["tag"]: ans["depends"]
        for ans in answers_list
        if not has_colored_edges(ans["depends"])
    }
    group_belonging = {ans["tag"]: ans["group_info"]["tag"] for ans in answers_list}
    group_depends = {
        ans["group_info"]["tag"]: ans["group_info"]["depends"]
        for ans in answers_list
        if ans["group_info"]["depends"] is not None
        and ans["group_info"]["tag"] is not None
    }
    depends_graph.update(group_depends)
    return depends_graph, group_belonging


def build_grading_dag(
    answers_list: list[OrderBlocksAnswerData],
    grading_method: GradingMethodType,
) -> tuple[Dag, dict[str, str | None]]:
    """Build the depends_graph and group_belonging for DAG/RANKING grading methods."""
    if grading_method is GradingMethodType.DAG:
        return extract_dag(answers_list)
    elif grading_method in (GradingMethodType.RANKING, GradingMethodType.ORDERED):
        if grading_method is GradingMethodType.ORDERED:
            for index, answer in enumerate(answers_list):
                answer["ranking"] = index

        sorted_answers = sorted(answers_list, key=lambda x: int(x["ranking"]))
        tag_to_rank = {ans["tag"]: ans["ranking"] for ans in sorted_answers}
        lines_of_rank = {
            rank: [tag for tag in tag_to_rank if tag_to_rank[tag] == rank]
            for rank in set(tag_to_rank.values())
        }

        depends_graph: Dag = {}
        cur_rank_depends: list[str] = []
        prev_rank = None
        for ans in sorted_answers:
            tag = ans["tag"]
            ranking = tag_to_rank[tag]
            if prev_rank is not None and ranking != prev_rank:
                cur_rank_depends = lines_of_rank[prev_rank]
            depends_graph[tag] = cur_rank_depends
            prev_rank = ranking

        return depends_graph, {}
    else:
        raise ValueError(f"Unsupported grading method: {grading_method}")


def shuffle_distractor_groups(
    all_blocks: list[OrderBlocksAnswerData],
) -> list[OrderBlocksAnswerData]:
    """Shuffle each correct block with its related distractors"""
    distractors = defaultdict(list)
    for block in all_blocks:
        if block.get("distractor_for"):
            distractors[block.get("distractor_for")].append(block)

    new_block_ordering: list[OrderBlocksAnswerData] = []
    for block in all_blocks:
        if block.get("distractor_for"):
            continue
        block_with_distractors = [block, *distractors[block["tag"]]]
        random.shuffle(block_with_distractors)
        new_block_ordering.extend(block_with_distractors)
    return new_block_ordering


def extract_multigraph(
    answers_list: list[OrderBlocksAnswerData],
) -> tuple[Multigraph, list[str]]:
    depends_graph = {}
    final_blocks = []
    for ans in answers_list:
        depends_graph.update({ans["tag"]: ans["depends"]})
        if ans["final"]:
            final_blocks.append(ans["tag"])
    return depends_graph, final_blocks


def solve_problem(
    answers_list: list[OrderBlocksAnswerData],
    grading_method: GradingMethodType,
    has_optional_blocks: bool,
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
        if not has_optional_blocks:
            depends_graph, group_belonging = extract_dag(answers_list)
            solution = solve_dag(depends_graph, group_belonging)
            return sorted(answers_list, key=lambda x: solution.index(x["tag"]))
        if has_optional_blocks:
            depends_graph, final_blocks = extract_multigraph(answers_list)
            solution = solve_multigraph(depends_graph, final_blocks)[0]
            answers_list = list(filter(lambda x: x["tag"] in solution, answers_list))
            return sorted(answers_list, key=lambda x: solution.index(x["tag"]))
    else:
        assert_never(grading_method)


def prepare(html: str, data: pl.QuestionData) -> None:
    html_element = lxml.html.fragment_fromstring(html)

    order_blocks_options = OrderBlocksOptions(html_element)
    order_blocks_options.validate()

    correct_answers: list[OrderBlocksAnswerData] = []
    incorrect_answers: list[OrderBlocksAnswerData] = []
    for i, answer_options in enumerate(order_blocks_options.answer_options):
        answer_data_dict: OrderBlocksAnswerData = {
            "inner_html": answer_options.inner_html,
            "indent": answer_options.indent,
            "ranking": answer_options.ranking,
            "index": i,
            "tag": answer_options.tag,
            "distractor_for": answer_options.distractor_for,
            "depends": answer_options.depends,  # only used with DAG grader
            "group_info": answer_options.group_info,  # only used with DAG grader
            "distractor_feedback": answer_options.distractor_feedback,
            "ordering_feedback": answer_options.ordering_feedback,
            "uuid": pl.get_uuid(),
            "final": answer_options.final,
        }
        if answer_options.correct:
            correct_answers.append(answer_data_dict)
        else:
            incorrect_answers.append(answer_data_dict)

    incorrect_answers_count = random.randint(
        order_blocks_options.min_incorrect, order_blocks_options.max_incorrect
    )

    sampled_correct_answers = correct_answers
    sampled_incorrect_answers = random.sample(
        incorrect_answers, incorrect_answers_count
    )

    all_blocks = sampled_correct_answers + sampled_incorrect_answers

    if order_blocks_options.source_blocks_order == SourceBlocksOrderType.RANDOM:
        random.shuffle(all_blocks)
    elif order_blocks_options.source_blocks_order == SourceBlocksOrderType.ORDERED:
        all_blocks.sort(key=lambda a: a["index"])
    elif order_blocks_options.source_blocks_order == SourceBlocksOrderType.ALPHABETIZED:
        all_blocks.sort(key=lambda a: a["inner_html"])
    else:
        assert_never(order_blocks_options.source_blocks_order)

    if order_blocks_options.distractor_order == DistractorOrderType.RANDOM:
        all_blocks = shuffle_distractor_groups(all_blocks)

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

    data["params"][order_blocks_options.answers_name] = all_blocks
    data["correct_answers"][order_blocks_options.answers_name] = correct_answers

    # if the order of the blocks in the HTML is a correct solution, leave it unchanged, but if it
    # isn't we need to change it into a solution before displaying it as such
    data_copy = deepcopy(data)
    data_copy["submitted_answers"] = {
        order_blocks_options.answers_name: deepcopy(correct_answers)
    }
    data_copy["partial_scores"] = {}
    grade(html, data_copy)

    if (
        data_copy["partial_scores"][order_blocks_options.answers_name]["score"] != 1
        and not order_blocks_options.has_optional_blocks
    ):
        data["correct_answers"][order_blocks_options.answers_name] = solve_problem(
            correct_answers,
            order_blocks_options.grading_method,
            order_blocks_options.has_optional_blocks,
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
    order_blocks_options = OrderBlocksOptions(element)
    answer_name = order_blocks_options.answers_name
    inline = order_blocks_options.inline
    dropzone_layout = order_blocks_options.solution_placement
    correct_answers = data["correct_answers"][answer_name]
    has_optional_blocks = order_blocks_options.has_optional_blocks

    block_formatting = (
        "pl-order-blocks-code"
        if order_blocks_options.format is FormatType.CODE
        else "list-group-item"
    )
    grading_method = order_blocks_options.grading_method

    if data["panel"] == "question":
        editable = data["editable"]

        # We aren't allowed to mutate the `data` object during render, so we'll
        # make a deep copy of the submitted answer so we can update indentation
        # fields to values suitable for rendering.
        student_previous_submission = deepcopy(
            data["submitted_answers"].get(answer_name, [])
        )
        submitted_block_ids = {block["uuid"] for block in student_previous_submission}

        all_blocks = data["params"][answer_name]
        source_blocks = [
            {**block, "indent_depth": 0}
            for block in all_blocks
            if block["uuid"] not in submitted_block_ids
        ]

        for option in student_previous_submission:
            submission_indent = option.get("indent", None)

            if submission_indent is not None:
                submission_indent = int(submission_indent)
            option["indent_depth"] = (
                max(0, submission_indent) if submission_indent is not None else 0
            )

        help_text = (
            f"Move answer blocks from the options area to the {dropzone_layout.value}."
        )

        if grading_method is GradingMethodType.UNORDERED:
            help_text += "<p>Your answer ordering does not matter. </p>"
        elif grading_method is not GradingMethodType.EXTERNAL:
            help_text += "<p>The ordering of your answer matters and is graded.</p>"
        else:
            help_text += "<p>Your answer will be autograded; be sure to indent and order your answer properly.</p>"

        help_text += "<p>Keyboard Controls: Arrows to navigate; Enter to select; Escape to deselect blocks. With a block selected, up/down arrows to reorder; left/right arrows to move between the options area and answer area.</p>"
        check_indentation = order_blocks_options.indentation
        if check_indentation:
            help_text += "<p><strong>Your answer should be indented.</strong> Indent your tiles by dragging them horizontally in the answer area, or by using left/right arrows with the block selected.</p>"

        uuid = pl.get_uuid()
        html_params = {
            "question": True,
            "answer_name": answer_name,
            "source-header": order_blocks_options.source_header,
            "solution-header": order_blocks_options.solution_header,
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
            "max_indent": order_blocks_options.max_indent,
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

        score = None
        feedback = None
        if answer_name in data["partial_scores"]:
            score = data["partial_scores"][answer_name]["score"]
            feedback = data["partial_scores"][answer_name].get("feedback", "")
        submission_was_graded = score is not None

        student_submission = [
            {
                "inner_html": attempt["inner_html"],
                "indent_depth": max(0, int(attempt.get("indent") or 0)),
                "badge_type": attempt.get("badge_type", ""),
                "icon": attempt.get("icon", ""),
                # We intentionally don't include distractor_feedback and ordering_feedback here when
                # the submission was not graded.
                "distractor_feedback": attempt.get("distractor_feedback", "")
                if submission_was_graded
                else "",
                "ordering_feedback": attempt.get("ordering_feedback", "")
                if submission_was_graded
                else "",
            }
            for attempt in data["submitted_answers"].get(answer_name, [])
        ]

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
        elif grading_method is GradingMethodType.DAG:
            if not has_optional_blocks:
                ordering_message = "there may be other correct orders"
            else:
                ordering_message = "there may be other answers"
        elif grading_method is GradingMethodType.RANKING:
            ordering_message = "there may be other correct orders"
        else:
            ordering_message = "in the specified order"
        check_indentation = order_blocks_options.indentation
        required_indents = {block["indent"] for block in correct_answers}
        indentation_message = ""
        if check_indentation:
            if -1 not in required_indents:
                indentation_message = ", correct indentation required"
            elif len(required_indents) > 1:
                indentation_message = ", some blocks require correct indentation"

        distractors = get_distractors(data["params"][answer_name], correct_answers)

        question_solution = [
            {
                "inner_html": solution["inner_html"],
                "indent_depth": max(0, int(solution["indent"] or 0)),
            }
            for solution in (
                solve_problem(correct_answers, grading_method, has_optional_blocks)
                if order_blocks_options.has_optional_blocks
                else correct_answers
            )
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
    order_block_options = OrderBlocksOptions(element)
    answer_name = order_block_options.answers_name
    answer_raw_name = answer_name + "-input"
    student_answer = data["raw_submitted_answers"].get(answer_raw_name, "[]")

    student_answer = json.loads(student_answer)

    if (not order_block_options.allow_blank) and (
        student_answer is None or student_answer == []
    ):
        data["format_errors"][answer_name] = (
            "Your submitted answer was blank; you did not drag any answer blocks into the answer area."
        )
        return

    grading_method = order_block_options.grading_method
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
                order_block_options.file_name,
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
    order_blocks_options = OrderBlocksOptions(element)
    answer_name = order_blocks_options.answers_name
    student_answer = data["submitted_answers"][answer_name]
    grading_method = order_blocks_options.grading_method
    true_answer_list = data["correct_answers"][answer_name]

    final_score = 0
    feedback = ""
    first_wrong = None

    if order_blocks_options.indentation:
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
        depends_graph: Dag = {}
        group_belonging: dict[str, str | None] = {}

        if (
            grading_method is GradingMethodType.DAG
            and order_blocks_options.has_optional_blocks
        ):
            depends_multigraph, final_blocks = extract_multigraph(true_answer_list)
            num_initial_correct, true_answer_length, depends_graph = grade_multigraph(
                submission, depends_multigraph, final_blocks
            )
        elif grading_method in (
            GradingMethodType.RANKING,
            GradingMethodType.ORDERED,
            GradingMethodType.DAG,
        ):
            depends_graph, group_belonging = build_grading_dag(
                true_answer_list, grading_method
            )
            num_initial_correct, true_answer_length = grade_dag(
                submission, depends_graph, group_belonging
            )
        elif grading_method is GradingMethodType.EXTERNAL:
            raise NotImplementedError(
                "grade function should never be called for EXTERNAL grading method"
            )
        else:
            assert_never(grading_method)

        first_wrong = (
            None if num_initial_correct == len(submission) else num_initial_correct
        )

        if order_blocks_options.feedback in FIRST_WRONG_TYPES:
            for block in student_answer[:num_initial_correct]:
                block["badge_type"] = "text-bg-success"
                block["icon"] = "fa-check"
                block["distractor_feedback"] = ""
                block["ordering_feedback"] = ""

            if first_wrong is not None:
                student_answer[first_wrong]["badge_type"] = "text-bg-danger"
                student_answer[first_wrong]["icon"] = "fa-xmark"
                if (
                    order_blocks_options.feedback
                    is not FeedbackType.FIRST_WRONG_VERBOSE
                ):
                    student_answer[first_wrong]["distractor_feedback"] = ""
                    student_answer[first_wrong]["ordering_feedback"] = ""

                for block in student_answer[first_wrong + 1 :]:
                    block["badge_type"] = ""
                    block["icon"] = ""
                    block["distractor_feedback"] = ""
                    block["ordering_feedback"] = ""

        if order_blocks_options.partial_credit is PartialCreditType.NONE:
            if (
                num_initial_correct == true_answer_length
                # The student can't select additional incorrect options
                and len(submission) == true_answer_length
            ):
                final_score = 1
            else:
                final_score = 0
        elif order_blocks_options.partial_credit is PartialCreditType.LCS:
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
                order_blocks_options.feedback,
                first_wrong,
                group_belonging,
                order_blocks_options.indentation,
                first_wrong_is_distractor,
            )

    data["partial_scores"][answer_name] = {
        "score": round(final_score, 2),
        "feedback": feedback,
        "weight": order_blocks_options.weight,
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
    order_block_options = OrderBlocksOptions(element)
    grading_method = order_block_options.grading_method
    answer_name = order_block_options.answers_name
    answer_name_field = answer_name + "-input"
    correct_answers = deepcopy(data["correct_answers"][answer_name])
    has_optional_blocks = order_block_options.has_optional_blocks

    # Right now invalid input must mean an empty response. Because user input is only
    # through drag and drop, there is no other way for their to be invalid input. This
    # may change in the future if we have nested input boxes (like faded parsons' problems).
    if data["test_type"] == "invalid":
        data["raw_submitted_answers"][answer_name_field] = json.dumps([])
        data["format_errors"][answer_name] = "No answer was submitted."

    # TODO grading modes 'unordered,' 'dag,' and 'ranking' allow multiple different possible
    # correct answers, we should check them at random instead of just the provided solution
    elif data["test_type"] == "correct":
        answer = (
            solve_problem(correct_answers, grading_method, has_optional_blocks)
            if order_block_options.has_optional_blocks
            else correct_answers
        )
        data["raw_submitted_answers"][answer_name_field] = json.dumps(answer)
        data["partial_scores"][answer_name] = {
            "score": 1,
            "weight": order_block_options.weight,
            "feedback": "",
        }

    # TODO: The only wrong answer being tested is the correct answer with the first
    # block mising. We should instead do a random selection of correct and incorrect blocks.
    elif data["test_type"] == "incorrect":
        answer = list(
            solve_problem(correct_answers, grading_method, has_optional_blocks)
            if order_block_options.has_optional_blocks
            else correct_answers
        )
        answer.pop(0)
        score = 0
        if grading_method is GradingMethodType.UNORDERED or (
            grading_method in LCS_GRADABLE_TYPES
            and order_block_options.partial_credit is PartialCreditType.LCS
        ):
            score = round(float(len(answer)) / (len(answer) + 1), 2)

        if grading_method in (GradingMethodType.DAG, GradingMethodType.RANKING):
            # Determine first_wrong using the actual DAG grading logic
            submission = [ans["tag"] for ans in answer]
            depends_graph, group_belonging = build_grading_dag(
                correct_answers, grading_method
            )
            num_initial_correct, _ = grade_dag(
                submission, depends_graph, group_belonging
            )
            first_wrong = (
                None if num_initial_correct == len(submission) else num_initial_correct
            )

            first_wrong_is_distractor = first_wrong is not None and answer[first_wrong][
                "uuid"
            ] in {
                block["uuid"]
                for block in get_distractors(
                    data["params"][answer_name], correct_answers
                )
            }
            feedback = construct_feedback(
                order_block_options.feedback,
                first_wrong,
                group_belonging,
                order_block_options.indentation,
                first_wrong_is_distractor,
            )
        else:
            feedback = ""

        data["raw_submitted_answers"][answer_name_field] = json.dumps(answer)
        data["partial_scores"][answer_name] = {
            "score": score,
            "weight": order_block_options.weight,
            "feedback": feedback,
        }

    else:
        raise ValueError("invalid result: {}".format(data["test_type"]))
