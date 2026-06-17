import pathlib
from enum import Enum
from typing import TypedDict

import lxml.html
import prairielearn as pl
from dag_checker import ColoredEdges, Edges
from lxml.etree import _Comment

SCHEMAS_PATH = pathlib.Path(__file__).parent / "schemas"
SCHEMA_PATH = SCHEMAS_PATH / "pl-order-blocks.json"
ANSWER_SCHEMA_PATH = SCHEMAS_PATH / "pl-answer.json"
BLOCK_GROUP_SCHEMA_PATH = SCHEMAS_PATH / "pl-block-group.json"


class GroupInfo(TypedDict):
    tag: str | None
    depends: list[str] | None


class DisplayBlocksType(Enum):
    VERTICAL = "vertical"
    INLINE_WRAP = "inline-wrap"
    INLINE_NOWRAP = "inline-nowrap"

    def is_inline(self) -> bool:
        return self in {DisplayBlocksType.INLINE_WRAP, DisplayBlocksType.INLINE_NOWRAP}


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
    RANDOM_SECTIONS = "random-sections"


class DistractorOrderType(Enum):
    RANDOM = "random"
    INHERIT = "inherit"


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

# The JSON schema accepts the union of answer attributes across grading methods.
# Python owns the mode-specific attribute restrictions.
GRADING_METHOD_ANSWER_ATTRIBUTES: dict[GradingMethodType, frozenset[str]] = {
    GradingMethodType.EXTERNAL: frozenset(["correct", "initially-placed"]),
    GradingMethodType.UNORDERED: frozenset([
        "correct",
        "initially-placed",
        "indent",
        "distractor-feedback",
    ]),
    GradingMethodType.ORDERED: frozenset([
        "correct",
        "initially-placed",
        "indent",
        "distractor-feedback",
    ]),
    GradingMethodType.RANKING: frozenset([
        "correct",
        "initially-placed",
        "tag",
        "ranking",
        "indent",
        "distractor-feedback",
        "distractor-for",
        "ordering-feedback",
    ]),
    GradingMethodType.DAG: frozenset([
        "correct",
        "initially-placed",
        "tag",
        "depends",
        "comment",
        "indent",
        "distractor-feedback",
        "distractor-for",
        "ordering-feedback",
        "final",
    ]),
}


GRADING_METHOD_DEFAULT = GradingMethodType.ORDERED
MAX_INDENTATION_DEFAULT = 4
DISTRACTOR_FOR_DEFAULT = None
DISTRACTOR_FEEDBACK_DEFAULT = None
ANSWER_CORRECT_DEFAULT = True
INITIALLY_PLACED_DEFAULT = False
ANSWER_INDENT_DEFAULT = None
ALLOW_BLANK_DEFAULT = False
INDENTATION_DEFAULT = False
INLINE_DEFAULT = False
DISPLAY_BLOCKS_DEFAULT = DisplayBlocksType.VERTICAL
FILE_NAME_DEFAULT = "user_code.py"
ORDERING_FEEDBACK_DEFAULT = None
PARTIAL_CREDIT_DEFAULT = PartialCreditType.NONE
SOURCE_HEADER_DEFAULT = "Drag from here:"
SOURCE_BLOCKS_ORDER_DEFAULT = SourceBlocksOrderType.ALPHABETIZED
DISTRACTOR_ORDER_DEFAULT = DistractorOrderType.INHERIT
SOLUTION_HEADER_DEFAULT = "Construct your solution here:"
SOLUTION_PLACEMENT_DEFAULT = SolutionPlacementType.RIGHT
FEEDBACK_DEFAULT = FeedbackType.NONE
WEIGHT_DEFAULT = 1
SPEC_CHAR_STR = "*&^$@!~[]{}()|:@?/\\"
SPEC_CHAR = frozenset(SPEC_CHAR_STR)


def is_multigraph(element: lxml.html.HtmlElement) -> bool:
    for html_tag in element:  # iterate through the html tags inside pl-order-blocks
        if isinstance(html_tag, _Comment):
            continue
        has_colors = "|" in pl.get_string_attrib(html_tag, "depends", "")
        if has_colors:
            return True
    return False


def get_graph_info(
    html_tag: lxml.html.HtmlElement,
) -> tuple[str, Edges]:
    tag = pl.get_string_attrib(html_tag, "tag", pl.get_uuid()).strip()
    depends = pl.get_string_attrib(html_tag, "depends", "")
    depends = [tag.strip() for tag in depends.split(",")] if depends else []
    return tag, depends


def get_multigraph_info(
    html_tag: lxml.html.HtmlElement,
) -> tuple[str, Edges | ColoredEdges, bool]:
    tag = pl.get_string_attrib(html_tag, "tag", pl.get_uuid()).strip()
    depends = pl.get_string_attrib(html_tag, "depends", "")
    final = pl.get_boolean_attrib(html_tag, "final", False)
    has_colors = "|" in depends

    if ":" in depends:
        raise ValueError("The linked options feature is currently unavailable.")

    if has_colors:
        depends = [
            [tag.strip() for tag in color.split(",") if color != ""]
            for color in depends.split("|")
        ]
    else:
        depends = [tag.strip() for tag in depends.split(",")] if depends else []
    return tag, depends, final


class AnswerOptions:
    """
    Collects and validates <pl-answer> tag options
    For more information on the pl-order-blocks attributes see the [pl-order-block docs](https://docs.prairielearn.com/elements/pl-order-blocks)
    """

    tag: str
    depends: Edges | ColoredEdges
    correct: bool
    initially_placed: bool
    ranking: int
    indent: int | None
    distractor_for: str | None
    distractor_feedback: str | None
    ordering_feedback: str | None
    inner_html: str
    group_info: GroupInfo
    final: bool

    def __init__(
        self,
        html_element: lxml.html.HtmlElement,
        group_info: GroupInfo,
        grading_method: GradingMethodType,
        has_optional_blocks: bool,
    ) -> None:
        self._check_options(html_element, grading_method)
        if has_optional_blocks:
            self.tag, self.depends, self.final = get_multigraph_info(html_element)
        else:
            self.tag, self.depends = get_graph_info(html_element)
            self.final = False
        self.correct = pl.get_boolean_attrib(
            html_element, "correct", ANSWER_CORRECT_DEFAULT
        )
        self.initially_placed = pl.get_boolean_attrib(
            html_element, "initially-placed", INITIALLY_PLACED_DEFAULT
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
                "<pl-block-group> only allows these child elements: <pl-answer>."
            )

        parent = html_element.getparent()
        pl.validate_element(
            html_element,
            ANSWER_SCHEMA_PATH,
            parent_tag=str(parent.tag) if parent is not None else None,
        )

        # The schema allows the union of attributes across all grading methods;
        # restrict to the ones meaningful for the current method.
        allowed_attribs = GRADING_METHOD_ANSWER_ATTRIBUTES[grading_method]
        for attribute in html_element.attrib:
            if attribute.replace("_", "-") not in allowed_attribs:
                raise ValueError(
                    f"pl-answer: {attribute} is not valid with this pl-order-blocks grading method."
                )


class OrderBlocksOptions:
    """
    Collects and validates <pl-order-block> question options.
    For more information on the pl-order-blocks attributes see the [pl-order-block docs](https://docs.prairielearn.com/elements/pl-order-blocks)
    """

    answers_name: str
    weight: int
    grading_method: GradingMethodType
    allow_blank: bool
    file_name: str
    source_blocks_order: SourceBlocksOrderType
    distractor_order: DistractorOrderType
    indentation: bool
    source_header: str
    solution_header: str
    solution_placement: SolutionPlacementType
    max_indent: int
    partial_credit: PartialCreditType
    feedback: FeedbackType
    format: FormatType
    code_language: str | None
    inline: bool
    display_blocks: DisplayBlocksType
    answer_options: list[AnswerOptions]
    correct_answers: list[AnswerOptions]
    incorrect_answers: list[AnswerOptions]
    max_incorrect: int
    min_incorrect: int

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
        self.distractor_order = pl.get_enum_attrib(
            html_element,
            "distractor-order",
            DistractorOrderType,
            DISTRACTOR_ORDER_DEFAULT,
        )
        self.indentation = pl.get_boolean_attrib(
            html_element, "indentation", INDENTATION_DEFAULT
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
            html_element, "max-indent", MAX_INDENTATION_DEFAULT
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
        self.display_blocks = pl.get_enum_attrib(
            html_element,
            "display-blocks",
            DisplayBlocksType,
            DISPLAY_BLOCKS_DEFAULT,
        )
        self.has_optional_blocks = is_multigraph(html_element)

        # All necessary properties are initialized for collect_answer_options
        self.answer_options = collect_answer_options(html_element, self)
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

        pl.validate_element(html_element, SCHEMA_PATH)

    def validate(self) -> None:
        self._validate_order_blocks_options()
        self._validate_answer_options()

        # Check that if it is a multigraph to ensure the final tag exists
        if self.has_optional_blocks:
            has_final = False
            for options in self.answer_options:
                if options.final and not has_final:
                    has_final = True

            if not has_final:
                raise ValueError(
                    'Use of optional lines requires at least one <pl-answer final="true"> block that can be the final block in a valid ordering.'
                )

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

        if (self.inline or self.display_blocks.is_inline()) and self.indentation:
            raise ValueError(
                'The indentation attribute may not be used when display-blocks is set to "inline-wrap" or "inline-nowrap".'
            )

        if (
            self.distractor_order == DistractorOrderType.RANDOM
            and self.source_blocks_order == SourceBlocksOrderType.RANDOM
        ):
            raise ValueError(
                'distractor-order="random" cannot be used with source-blocks-order="random".'
            )

    def _validate_answer_options(self) -> None:
        used_tags = []
        used_groups = []
        distractor_tags = [
            answer_options.distractor_for
            for answer_options in self.answer_options
            if answer_options.distractor_for is not None
        ]

        for answer_options in self.answer_options:
            if (
                self.grading_method is not GradingMethodType.DAG
                and answer_options.group_info["tag"] is not None
            ):
                raise ValueError(
                    'Block groups only supported in the "dag" grading mode.'
                )

            if (
                self.has_optional_blocks
                and answer_options.group_info["tag"] is not None
            ):
                raise ValueError(
                    "Block groups not supported with the optional-lines feature."
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
                    answer_options.initially_placed
                    and answer_options.tag in distractor_tags
                ):
                    raise ValueError(
                        "A block with distractors cannot be initially placed."
                    )
            elif answer_options.initially_placed:
                raise ValueError("Incorrect blocks cannot be initially placed.")

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


def collect_answer_options(
    html_element: lxml.html.HtmlElement, order_blocks_options: OrderBlocksOptions
) -> list[AnswerOptions]:
    answer_options = []
    for inner_element in html_element:
        if isinstance(inner_element, _Comment):
            continue

        match inner_element.tag:
            case "pl-block-group":
                pl.validate_element(
                    inner_element,
                    BLOCK_GROUP_SCHEMA_PATH,
                    parent_tag="pl-order-blocks",
                )
                group_tag, group_depends = get_graph_info(inner_element)
                for answer_element in inner_element:
                    if isinstance(answer_element, _Comment):
                        continue
                    options = AnswerOptions(
                        answer_element,
                        {"tag": group_tag, "depends": group_depends},
                        order_blocks_options.grading_method,
                        order_blocks_options.has_optional_blocks,
                    )
                    answer_options.append(options)
            case "pl-answer":
                options = AnswerOptions(
                    inner_element,
                    {"tag": None, "depends": None},
                    order_blocks_options.grading_method,
                    order_blocks_options.has_optional_blocks,
                )
                answer_options.append(options)
            case _:
                raise ValueError(
                    "<pl-order-blocks> only allows these child elements: <pl-answer>, <pl-block-group>."
                )

    return answer_options
