from enum import Enum
from types import FunctionType
from typing import TypedDict
import importlib

import prairielearn as pl
from prairielearn.html_utils import inner_html
from lxml.etree import _Comment
import lxml.html

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

class AnswerAttribs(TypedDict):
    correct: bool
    ranking: int
    indent: int | None
    tag: str
    depends: list[str]
    inner_html: str
    distractor_feedback: str | None
    ordering_feedback: str | None
    distractor_for: str | None
    group_info: GroupInfo

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
MAX_INDENTION_DEFAULT = 4;
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


def get_graph_info(
    html_tag: lxml.html.HtmlElement,
) -> tuple[str, list[str]]:
    tag = pl.get_string_attrib(html_tag, "tag", pl.get_uuid()).strip()
    depends = pl.get_string_attrib(html_tag, "depends", "")
    depends = [tag.strip() for tag in depends.split(",")] if depends else []
    return tag, depends


class OrderBlocksAttributes:
    def __init__(
    self,
    html_tag: lxml.html.HtmlElement
    ) -> None:
        self._check_order_blocks_attribs(html_tag)
        self.answer_name = pl.get_string_attrib(html_tag, "answers-name")
        self.weight = pl.get_integer_attrib(html_tag, "weight", None)
        self.grading_method = pl.get_enum_attrib( html_tag, "grading-method", GradingMethodType, GRADING_METHOD_DEFAULT)
        self.allow_blank = pl.get_boolean_attrib( html_tag, "allow-blank", ALLOW_BLANK_DEFAULT)
        self.file_name = pl.get_string_attrib(html_tag, "file-name", FILE_NAME_DEFAULT)
        self.source_blocks_order = pl.get_enum_attrib(html_tag, "source-blocks-order", SourceBlocksOrderType, SOURCE_BLOCKS_ORDER_DEFAULT)
        self.indentation = pl.get_boolean_attrib(html_tag, "indentation", INDENTION_DEFAULT)
        self.max_incorrect = pl.get_integer_attrib(html_tag, "max-incorrect", None)
        self.min_incorrect = pl.get_integer_attrib(html_tag, "min-incorrect", None)
        self.source_header = pl.get_string_attrib(html_tag, "source-header", SOURCE_HEADER_DEFAULT)
        self.solution_header = pl.get_string_attrib(html_tag, "solution-header", SOLUTION_HEADER_DEFAULT)
        self.solution_placement = pl.get_enum_attrib(html_tag, "solution-placement", SolutionPlacementType, SOLUTION_PLACEMENT_DEFAULT)
        self.max_indent = pl.get_integer_attrib(html_tag, "max-indent", MAX_INDENTION_DEFAULT)
        self.partial_credit_type = pl.get_enum_attrib(html_tag, "partial-credit", PartialCreditType, PARTIAL_CREDIT_DEFAULT)
        self.feedback_type = pl.get_enum_attrib(html_tag, "feedback", FeedbackType, FEEDBACK_DEFAULT)
        self.format_type = pl.get_enum_attrib(html_tag, "format", FormatType, FormatType.DEFAULT)
        self.code_language = pl.get_string_attrib(html_tag, "code-language", None)
        self.inline = pl.get_boolean_attrib(html_tag, "inline", INLINE_DEFAULT)
        self._validate_order_blocks_attribs()

        self.answer_attribs = self._collect_answer_attribs(html_tag)


    def _check_order_blocks_attribs(self, html_tag: lxml.html.HtmlElement) -> None:
        if html_tag.tag != "pl-order-blocks":
            raise ValueError("HTML element is not a pl-order-block")

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
            html_tag, required_attribs=required_attribs, optional_attribs=optional_attribs
        )


    def _collect_answer_attribs(self, html_tag: lxml.html.HtmlElement) -> list[AnswerAttribs]:
        answer_attribs = []
        validate_answer_attribs = self._validate_answer_attribs_setup()

        for inner_element in html_tag:
            if isinstance(inner_element, _Comment):
                continue
            if inner_element.tag == "pl-block-group":
                group_tag, group_depends = get_graph_info(inner_element)
                for answer_element in inner_element:
                    self._check_answer_attribs(answer_element)
                    attribs = self._get_answer_attribs(answer_element, {"tag": group_tag, "depends": group_depends})
                    validate_answer_attribs(attribs)
                    answer_attribs.append(attribs)

            if inner_element.tag == "pl-answer":
                self._check_answer_attribs(inner_element)
                attribs = self._get_answer_attribs(inner_element, {"tag": None, "depends": None})
                validate_answer_attribs(attribs)
                answer_attribs.append(attribs)

        return answer_attribs


    def _validate_order_blocks_attribs(self) -> None:
        if (
            self.grading_method not in LCS_GRADABLE_TYPES
            and self.partial_credit_type != PARTIAL_CREDIT_DEFAULT
        ):
            raise ValueError(
                "You may only specify partial credit options in the DAG, ordered, and ranking grading modes."
            )

        if (
            self.grading_method is not GradingMethodType.DAG
            and self.grading_method is not GradingMethodType.RANKING
            and self.feedback_type is not FeedbackType.NONE
        ):
            raise ValueError(
                f"feedback type {self.feedback_type.value} is not available with the {self.grading_method.value} grading-method."
            )

        if (
            self.format_type is FormatType.DEFAULT
            and self.code_language is not None
        ):
            raise ValueError('code-language attribute may only be used with format="code"')


    def _check_answer_attribs(self, html_tag: lxml.html.HtmlElement) -> None:
        if html_tag.tag != "pl-answer":
            raise ValueError(
                """Any html tags nested inside <pl-order-blocks> must be <pl-answer> or <pl-block-group>.
                    Any html tags nested inside <pl-block-group> must be <pl-answer>"""
            )

        if self.grading_method is GradingMethodType.EXTERNAL:
            pl.check_attribs(html_tag, required_attribs=[], optional_attribs=["correct"])
        elif self.grading_method in [
            GradingMethodType.UNORDERED,
            GradingMethodType.ORDERED,
        ]:
            pl.check_attribs(
                html_tag,
                required_attribs=[],
                optional_attribs=["correct", "indent", "distractor-feedback"],
            )
        elif self.grading_method is GradingMethodType.RANKING:
            pl.check_attribs(
                html_tag,
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
        elif self.grading_method is GradingMethodType.DAG:
            pl.check_attribs(
                html_tag,
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


    def _get_answer_attribs(self, html_tag: lxml.html.HtmlElement, group_info: GroupInfo) -> AnswerAttribs:
        tag, depends = get_graph_info(html_tag)
        return {
        "correct": pl.get_boolean_attrib(
            html_tag, "correct", ANSWER_CORRECT_DEFAULT
            ),
        "ranking": pl.get_integer_attrib(html_tag, "ranking", -1),
        "indent": pl.get_integer_attrib(
            html_tag, "indent", ANSWER_INDENT_DEFAULT
            ),
        "depends": depends,
        "tag": tag,
        "distractor_for": pl.get_string_attrib(
            html_tag, "distractor-for", DISTRACTOR_FOR_DEFAULT
            ),
        "distractor_feedback": pl.get_string_attrib(
            html_tag, "distractor-feedback", DISTRACTOR_FEEDBACK_DEFAULT
            ),
        "ordering_feedback": pl.get_string_attrib(
            html_tag, "ordering-feedback", ORDERING_FEEDBACK_DEFAULT
            ),
        "inner_html": pl.inner_html(html_tag),
        "group_info": group_info,
        }



    def _validate_answer_attribs_setup(self) -> FunctionType:
        used_tags = set()
        used_groups = []

        def answer_attribs_validation(
            answer_attribs: AnswerAttribs,
        ) -> None:
                if (
                    self.grading_method is not GradingMethodType.DAG
                    and answer_attribs["group_info"]["tag"] is not None
                ):
                    raise ValueError(
                        'Block groups only supported in the "dag" grading mode.'
                    )

                if (
                    self.indentation is False
                    and answer_attribs["indent"] is not None
                ):
                    raise ValueError(
                        "<pl-answer> should not specify indentation if indentation is disabled."
                    )

                if (
                    answer_attribs["ordering_feedback"] is not None
                    and not answer_attribs["correct"]
                ):
                    raise ValueError(
                        "The ordering-feedback attribute may only be used on blocks with correct=true."
                    )

                if SPEC_CHAR.intersection(answer_attribs["tag"]):
                    raise ValueError(
                        f'<pl-answer tag="{answer_attribs["tag"]}"> tag attribute may not contain special characters: "{SPEC_CHAR_STR}"'
                    )

                if answer_attribs["correct"]:
                    if answer_attribs["tag"] in used_tags:
                        raise ValueError(
                            f'Tag "{answer_attribs["tag"]}" used in multiple places. The tag attribute for each <pl-answer> and <pl-block-group> must be unique.'
                        )
                    used_tags.add(answer_attribs["tag"])

                if (
                    answer_attribs["group_info"]["tag"] in used_tags
                    and answer_attribs["group_info"] not in used_groups
                ):
                    raise ValueError(
                        f'Tag "{answer_attribs["group_info"]["tag"]}" used in multiple places. The tag attribute for each <pl-answer> and <pl-block-group> must be unique.'
                    )
                if answer_attribs["group_info"]["tag"] is not None:
                    used_tags.add(answer_attribs["group_info"]["tag"])
                    used_groups.append(answer_attribs["group_info"])

                if self.format_type is FormatType.CODE:
                    answer_attribs["inner_html"] = (
                        "<pl-code"
                        + (
                            ' language="' + self.code_language + '"'
                            if self.code_language
                            else ""
                        )
                        + ">"
                        + answer_attribs["inner_html"]
                        + "</pl-code>"
                    )

        return answer_attribs_validation
