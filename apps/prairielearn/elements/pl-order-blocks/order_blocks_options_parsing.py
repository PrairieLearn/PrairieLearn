from enum import Enum
from typing import TypedDict

import lxml.html
import prairielearn as pl
from lxml.etree import _Comment


class GroupInfo(TypedDict):
    tag: str | None
    depends: list[str] | None


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


LCS_GRADABLE_TYPES = frozenset([
    GradingMethodType.RANKING,
    GradingMethodType.DAG,
    GradingMethodType.ORDERED,
])

FIRST_WRONG_TYPES = frozenset([
    FeedbackType.FIRST_WRONG,
    FeedbackType.FIRST_WRONG_VERBOSE,
])

GRADING_METHOD_DEFAULT = GradingMethodType.ORDERED
MAX_INDENTION_DEFAULT = 4
DISTRACTOR_FOR_DEFAULT = None
DISTRACTOR_FEEDBACK_DEFAULT = None
ANSWER_CORRECT_DEFAULT = True
ANSWER_INDENT_DEFAULT = None
ALLOW_BLANK_DEFAULT = False
INDENTION_DEFAULT = False
INLINE_DEFAULT = False
FILE_NAME_DEFAULT = "user_code.py"
ORDERING_FEEDBACK_DEFAULT = None
PARTIAL_CREDIT_DEFAULT = PartialCreditType.NONE
SOURCE_HEADER_DEFAULT = "Drag from here:"
SOURCE_BLOCKS_ORDER_DEFAULT = SourceBlocksOrderType.ALPHABETIZED
SOLUTION_HEADER_DEFAULT = "Construct your solution here:"
SOLUTION_PLACEMENT_DEFAULT = SolutionPlacementType.RIGHT
FEEDBACK_DEFAULT = FeedbackType.NONE
WEIGHT_DEFAULT = 1
SPEC_CHAR_STR = "*&^$@!~[]{}()|:@?/\\"
SPEC_CHAR = frozenset(SPEC_CHAR_STR)


def get_graph_info(
    html_tag: lxml.html.HtmlElement,
) -> tuple[str, list[str]]:
    tag = pl.get_string_attrib(html_tag, "tag", pl.get_uuid()).strip()
    depends = pl.get_string_attrib(html_tag, "depends", "")
    depends = [tag.strip() for tag in depends.split(",")] if depends else []
    return tag, depends


class AnswerOptions:
    """
    A data class that collects and validates pl-answer tag options within a pl-order-block tag
    For more information on the pl-order-blocks attributes see the [pl-order-block docs](https://prairielearn.readthedocs.io/en/latest/elements/#pl-order-blocks-element)
    """

    tag: str
    """
    Optional attribute. Used to identify the block when declaring which other blocks depend on it or are a distractor for it.

    Default: UUID
    """

    depends: list[str]
    """
    Optional attribute when grading-method="dag". Used to specify the directed
    acyclic graph relation among the blocks, with blocks being referred to by
    their tag. For example, if depends="1,3" for a particular block, it must
    appear later in the solution than the block with tag="1" and the block with
    tag="3".


    Default: ""
    """

    correct: bool
    """
	Specifies whether the answer block is a correct answer to the question (and should be moved to the solution area).

    Default: True
    """

    ranking: int
    """
    This attribute is used when grading-method="ranking" and specifies the correct
    ranking of the answer block. For example, a block with ranking 2 should be
    placed below a block with ranking 1. The same ranking can be used when the
    order of certain blocks is not relevant. Blocks that can be placed at any
    position should not have the ranking attribute.

    Default = -1
    """

    indent: int | None
    """
    Specifies the correct indentation level of the block. For example, a value of 2
    means the block should be indented twice. A value of -1 means the indention of
    the block does not matter. This attribute can only be used when
    indentation="true".

    Default: None
    """

    distractor_for: str | None
    """
    Optional attribute on blocks where correct=false. Used to visually group a
    distractor block with a correct block that it is similar to, should match the
    tag attribute of the block that it should be visually paired with.

    Default: None
    """

    distractor_feedback: str | None
    """
    Optional attribute, used when correct=false that indicates why a given block is
    incorrect or should not be included in the solution. Shown to the student after
    all attempts at a problem are exhausted, or if feedback="first-wrong" and the
    first incorrect line in their submission has distractor-feedback.

    Default: None
    """

    ordering_feedback: str | None
    """
    Optional attribute used when grading-method="dag" or grading-method="ranking"
    and correct=true. Used to provide specific feedback when the block is placed in
    the wrong position relative to other blocks. This feedback is shown to the
    student after submission to help clarify ordering errors.

    Default: None
    """

    inner_html: str
    """
    The inner html that is within the pl-answer tag
    """

    group_info: GroupInfo
    """
    Data class that contains the tag and the depends attributes.
    """

    def __init__(
        self,
        html_element: lxml.html.HtmlElement,
        group_info: GroupInfo,
        grading_method: GradingMethodType,
    ) -> None:
        self._check_options(html_element, grading_method)
        self.tag, self.depends = get_graph_info(html_element)
        self.correct = pl.get_boolean_attrib(
            html_element, "correct", ANSWER_CORRECT_DEFAULT
        )
        self.ranking = pl.get_integer_attrib(html_element, "ranking", -1)
        self.indent = pl.get_integer_attrib(
            html_element, "indent", ANSWER_INDENT_DEFAULT
        )
        self.distractor_for = pl.get_string_attrib(
            html_element, "distractor-for", DISTRACTOR_FOR_DEFAULT
        )
        self.distractor_feedback = pl.get_string_attrib(
            html_element, "distractor-feedback", DISTRACTOR_FEEDBACK_DEFAULT
        )
        self.ordering_feedback = pl.get_string_attrib(
            html_element, "ordering-feedback", ORDERING_FEEDBACK_DEFAULT
        )
        self.inner_html = pl.inner_html(html_element)
        self.group_info = group_info

    def _check_options(
        self, html_element: lxml.html.HtmlElement, grading_method: GradingMethodType
    ) -> None:
        if html_element.tag != "pl-answer":
            raise ValueError(
                """Any html tags nested inside <pl-order-blocks> must be <pl-answer> or <pl-block-group>.
                    Any html tags nested inside <pl-block-group> must be <pl-answer>"""
            )

        if grading_method is GradingMethodType.EXTERNAL:
            pl.check_attribs(
                html_element, required_attribs=[], optional_attribs=["correct"]
            )
        elif grading_method in [
            GradingMethodType.UNORDERED,
            GradingMethodType.ORDERED,
        ]:
            pl.check_attribs(
                html_element,
                required_attribs=[],
                optional_attribs=["correct", "indent", "distractor-feedback"],
            )
        elif grading_method is GradingMethodType.RANKING:
            pl.check_attribs(
                html_element,
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
                html_element,
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


def collect_answer_options(
    html_element: lxml.html.HtmlElement, grading_method: GradingMethodType
) -> list[AnswerOptions]:
    answer_options = []
    for inner_element in html_element:
        if isinstance(inner_element, _Comment):
            continue

        match inner_element.tag:
            case "pl-block-group":
                group_tag, group_depends = get_graph_info(inner_element)
                for answer_element in inner_element:
                    options = AnswerOptions(
                        answer_element,
                        {"tag": group_tag, "depends": group_depends},
                        grading_method,
                    )
                    answer_options.append(options)
            case "pl-answer":
                answer_options.append(
                    AnswerOptions(
                        inner_element, {"tag": None, "depends": None}, grading_method
                    )
                )
            case _:
                raise ValueError(
                    """Any html tags nested inside <pl-order-blocks> must be <pl-answer> or <pl-block-group>.
                        Any html tags nested inside <pl-block-group> must be <pl-answer>"""
                )

    return answer_options


class OrderBlocksOptions:
    """
    A data class that collects and validates pl-order-block question options
    For more information on the pl-order-blocks attributes see the [pl-order-block docs](https://prairielearn.readthedocs.io/en/latest/elements/#pl-order-blocks-element)
    """

    answers_name: str
    """
    Variable name to store data in. Note that this attribute has to be unique
    within a question, i.e., no value for this attribute should be repeated
    within a question.
    """

    weight: int
    """
    Weight to use when computing a weighted average score over all elements
    in a question.

    Default = `1`
    """

    grading_method: GradingMethodType
    """
    The method that will be used to grade the pl-order-blocks question.

    # Options
    * GradingMethodType.UNORDERED = "unordered"
    * GradingMethodType.ORDERED = "ordered"
    * GradingMethodType.RANKING = "ranking"
    * GradingMethodType.DAG = "dag"
    * GradingMethodType.EXTERNAL = "external"

    Default: `GradingMethodType.ORDERED`
    """

    allow_blank: bool
    """
    Whether an empty solution area is allowed. By default, an empty
    solution area with no dropped blocks will not be graded (invalid format).

    Default: `False`
    """

    file_name: str
    """
    Name of the file where the information from the blocks will be saved,
    to be used by the external grader.

    Default: '"user_code.py"'
    """

    source_blocks_order: SourceBlocksOrderType
    """
    The order of the blocks in the source area.

    # Options
    * SourceBlocksOrderType.RANDOM = "random"
    * SourceBlocksOrderType.ALPHABETIZED = "alphabetized"
    * SourceBlocksOrderType.ORDERED = "ordered"

    Default: `SourceBlocksOrderType.ALPHABETIZED`
    """

    indentation: bool
    """
    Enable both the ability for indentation in the solution area and the grading of
    the expected indentation (set by indent in pl-answer, as described below).

    Default: `False`
    """

    source_header: str
    """
    Enable both the ability for indentation in the solution area and the grading of
    the expected indentation (set by indent in pl-answer, as described below).

    Default: `"Construct your solution here:"`
    """

    solution_header: str
    """
    The text that appears at the start of the solution area.

    Default: `SolutionPlacementType.RIGHT`
    """

    solution_placement: SolutionPlacementType
    """
    "right" shows the source and solution areas aligned side-by-side. "bottom"
    shows the solution area below the source area.

    # Options
    * SolutionPlacementType.RIGHT = "right"
    * SolutionPlacementType.BOTTOM = "bottom"

    Default: `SolutionPlacementType.RIGHT`
    """

    max_indent: int
    """
    Maximum possible indent depth for blocks in the solution area. Note only
    applied when indentation is enabled.

    Default: `4`
    """

    partial_credit: PartialCreditType
    """
    For the "dag", "ordered", and "ranking" grading methods, you may specify
    "none" for no partial credit or "lcs" for partial credit based on the LCS
    edit-distance from the student solution to some correct solution.

    # Options
    * PartialCreditType.NONE = `none`
    * PartialCreditType.LCS = `lcs`

    Default: `PartialCreditType.NONE`
    """

    feedback: FeedbackType
    """
    The level of feedback the student will receive upon giving an incorrect answer.
    Available with the "dag" or "ranking grading mode. "none" will give no
    feedback. "first-wrong" will tell the student which block in their answer was
    the first to be incorrect. If set to "first-wrong-verbose", if the first
    incorrect block is a distractor any feedback associated with that distractor
    will be shown as well (see "distractor-feedback" in <pl-answer>)

    # Options
    * FeedbackType.NONE = "none"
    * FeedbackType.FIRST_WRONG = "first-wrong"
    * FeedbackType.FIRST_WRONG_VERBOSE = "first-wrong-verbose"

    Default: `FeedbackType.NONE`
    """

    format: FormatType
    """
    If this property is set to "code", then the contents of each of the blocks will
    be wrapped with a <pl-code> element.

    # Options
    * FormatType.DEFAULT = "default"
    * FormatType.CODE = "code"

    Default: `FormatType.DEFAULT`
    """

    code_language: str | None
    """
    The programming language syntax highlighting to use. Only available when
    using format="code".
    """

    inline: bool
    """
    Inline set to `false` sets the blocks to be stacked vertically whereas true
    requires blocks to be placed horizontally.
    """

    answer_options: list[AnswerOptions]
    """
    List of AnswerOptions parsed from interior pl-answer tags.
    """

    correct_answers: list[AnswerOptions]
    """
    List of correct AnswerOptions parsed from interior pl-answer tags.
    """

    incorrect_answers: list[AnswerOptions]
    """
    List of incorrect AnswerOptions parsed from interior pl-answer tags.
    """

    max_incorrect: int
    """
    The maximum number of incorrect answers to be displayed in the source area.
    The incorrect answers are set using <pl-answer correct="false">. Defaults
    to displaying all incorrect answers.

    Default: len(correct_answers)
    """

    min_incorrect: int
    """
    The minimum number of incorrect answers to be displayed in the source area.
    The incorrect answers are set using <pl-answer correct="false">. Defaults
    to displaying all incorrect answers.

    Default: len(incorrect_answers)
    """

    def __init__(self, html_element: lxml.html.HtmlElement) -> None:
        self._check_options(html_element)
        self.answers_name = pl.get_string_attrib(html_element, "answers-name")
        self.weight = pl.get_integer_attrib(html_element, "weight", WEIGHT_DEFAULT)
        self.grading_method = pl.get_enum_attrib(
            html_element, "grading-method", GradingMethodType, GRADING_METHOD_DEFAULT
        )
        self.allow_blank = pl.get_boolean_attrib(
            html_element, "allow-blank", ALLOW_BLANK_DEFAULT
        )
        self.file_name = pl.get_string_attrib(
            html_element, "file-name", FILE_NAME_DEFAULT
        )
        self.source_blocks_order = pl.get_enum_attrib(
            html_element,
            "source-blocks-order",
            SourceBlocksOrderType,
            SOURCE_BLOCKS_ORDER_DEFAULT,
        )
        self.indentation = pl.get_boolean_attrib(
            html_element, "indentation", INDENTION_DEFAULT
        )
        self.source_header = pl.get_string_attrib(
            html_element, "source-header", SOURCE_HEADER_DEFAULT
        )
        self.solution_header = pl.get_string_attrib(
            html_element, "solution-header", SOLUTION_HEADER_DEFAULT
        )
        self.solution_placement = pl.get_enum_attrib(
            html_element,
            "solution-placement",
            SolutionPlacementType,
            SOLUTION_PLACEMENT_DEFAULT,
        )
        self.max_indent = pl.get_integer_attrib(
            html_element, "max-indent", MAX_INDENTION_DEFAULT
        )
        self.partial_credit = pl.get_enum_attrib(
            html_element, "partial-credit", PartialCreditType, PARTIAL_CREDIT_DEFAULT
        )
        self.feedback = pl.get_enum_attrib(
            html_element, "feedback", FeedbackType, FEEDBACK_DEFAULT
        )
        self.format = pl.get_enum_attrib(
            html_element, "format", FormatType, FormatType.DEFAULT
        )
        self.code_language = pl.get_string_attrib(html_element, "code-language", None)
        self.inline = pl.get_boolean_attrib(html_element, "inline", INLINE_DEFAULT)

        self.answer_options = collect_answer_options(html_element, self.grading_method)
        self.correct_answers = [
            options for options in self.answer_options if options.correct
        ]
        self.incorrect_answers = [
            options for options in self.answer_options if not options.correct
        ]

        self.max_incorrect = pl.get_integer_attrib(
            html_element, "max-incorrect", len(self.incorrect_answers)
        )
        self.min_incorrect = pl.get_integer_attrib(
            html_element, "min-incorrect", len(self.incorrect_answers)
        )

    def _check_options(self, html_element: lxml.html.HtmlElement) -> None:
        if html_element.tag != "pl-order-blocks":
            raise ValueError("HTML element is not a pl-order-blocks")

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
            html_element,
            required_attribs=required_attribs,
            optional_attribs=optional_attribs,
        )

    def validate(self) -> None:
        self._validate_order_blocks_options()
        self._validate_answer_options()

    def _validate_order_blocks_options(self) -> None:
        if (
            self.grading_method not in LCS_GRADABLE_TYPES
            and self.partial_credit != PARTIAL_CREDIT_DEFAULT
        ):
            raise ValueError(
                "You may only specify partial credit options in the DAG, ordered, and ranking grading modes."
            )

        if (
            self.grading_method is not GradingMethodType.DAG
            and self.grading_method is not GradingMethodType.RANKING
            and self.feedback is not FeedbackType.NONE
        ):
            raise ValueError(
                f"feedback type {self.feedback.value} is not available with the {self.grading_method.value} grading-method."
            )

        if self.format is FormatType.DEFAULT and self.code_language is not None:
            raise ValueError(
                'code-language attribute may only be used with format="code"'
            )

        if (
            self.grading_method is not GradingMethodType.EXTERNAL
            and len(self.correct_answers) == 0
        ):
            raise ValueError(
                "There are no correct answers specified for this question."
            )

        all_incorrect_answers = len(self.incorrect_answers)
        if (
            self.min_incorrect > all_incorrect_answers
            or self.max_incorrect > all_incorrect_answers
        ):
            raise ValueError(
                "The min-incorrect or max-incorrect attribute may not exceed the number of incorrect <pl-answers>."
            )
        if self.min_incorrect > self.max_incorrect:
            raise ValueError(
                "The attribute min-incorrect must be smaller than max-incorrect."
            )

        if self.inline and self.indentation:
            raise ValueError(
                "The indentation attribute may not be used when inline is true."
            )

    def _validate_answer_options(self) -> None:
        used_tags = []
        used_groups = []

        for answer_options in self.answer_options:
            if (
                self.grading_method is not GradingMethodType.DAG
                and answer_options.group_info["tag"] is not None
            ):
                raise ValueError(
                    'Block groups only supported in the "dag" grading mode.'
                )

            if self.indentation is False and answer_options.indent is not None:
                raise ValueError(
                    "<pl-answer> should not specify indentation if indentation is disabled."
                )

            if (
                answer_options.ordering_feedback is not None
                and not answer_options.correct
            ):
                raise ValueError(
                    "The ordering-feedback attribute may only be used on blocks with correct=true."
                )

            if SPEC_CHAR.intersection(answer_options.tag):
                raise ValueError(
                    f'<pl-answer tag="{answer_options.tag}"> tag attribute may not contain special characters: "{SPEC_CHAR_STR}"'
                )

            if answer_options.correct:
                if answer_options.tag in used_tags:
                    raise ValueError(
                        f'Tag "{answer_options.tag}" used in multiple places. The tag attribute for each <pl-answer> and <pl-block-group> must be unique.'
                    )
                used_tags.append(answer_options.tag)

            if (
                answer_options.group_info["tag"] in used_tags
                and answer_options.group_info not in used_groups
            ):
                raise ValueError(
                    f'Tag "{answer_options.group_info["tag"]}" used in multiple places. The tag attribute for each <pl-answer> and <pl-block-group> must be unique.'
                )
            if answer_options.group_info["tag"] is not None:
                used_tags.append(answer_options.group_info["tag"])
                used_groups.append(answer_options.group_info)

            if self.format is FormatType.CODE:
                answer_options.inner_html = (
                    "<pl-code"
                    + (
                        ' language="' + self.code_language + '"'
                        if self.code_language
                        else ""
                    )
                    + ">"
                    + answer_options.inner_html
                    + "</pl-code>"
                )
