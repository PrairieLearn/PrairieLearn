import importlib
from typing import Any

import lxml.html
import pytest

pl_order_blocks = importlib.import_module("pl-order-blocks")


@pytest.mark.parametrize(
    ("input_str", "expected_output"),
    [
        (
            """<pl-order-blocks answers-name=\"test1\"
                  grading-method=\"ranking\"
                  indentation=\"true\"
                  partial-credit=\"none\"
                  feedback=\"none\">
                  <pl-answer correct=\"true\" ranking=\"1\" indent=\"0\">def my_sum(first, second):</pl-answer>
                  <pl-answer correct=\"true\" ranking=\"2\" indent=\"1\">return first + second</pl-answer>
                </pl-order-blocks>""",
            {
                "answer_name": "test1",
                "weight": None,
                "grading_method": pl_order_blocks.GradingMethodType.RANKING,
                "allow_blank": pl_order_blocks.ALLOW_BLANK_DEFAULT,
                "file_name": pl_order_blocks.FILE_NAME_DEFAULT,
                "source_blocks_order": pl_order_blocks.SOURCE_BLOCKS_ORDER_DEFAULT,
                "indentation": True,
                "max_incorrect": None,
                "min_incorrect": None,
                "source_header": pl_order_blocks.SOURCE_HEADER_DEFAULT,
                "solution_header": pl_order_blocks.SOLUTION_HEADER_DEFAULT,
                "solution_placement": pl_order_blocks.SOLUTION_PLACEMENT_DEFAULT,
                "max_indent": pl_order_blocks.MAX_INDENTION_DEFAULT,
                "partial_credit_type": pl_order_blocks.PARTIAL_CREDIT_DEFAULT,
                "feedback_type": pl_order_blocks.FeedbackType.NONE,
                "format_type": pl_order_blocks.FormatType.DEFAULT,
                "code_language": None,
                "inline": False,
            },
        ),
        (
            """<pl-order-blocks answers-name="test2"
                  weight=3
                  grading-method="ordered"
                  allow-blank="true"
                  file-name="test_code.py"
                  source-blocks-order="ordered"
                  indentation="false"
                  max-incorrect=2
                  min-incorrect=3
                  source-header="TEST"
                  solution-header="TEST"
                  partial-credit="lcs"
                  solution-placement="bottom"
                  format="code"
                  max-indent=3
                  feedback="first-wrong-verbose">
                  <pl-answer correct="true" ranking="1" indent="0">def my_sum(first, second):</pl-answer>
                  <pl-answer correct="true" ranking="2" indent="1">return first + second</pl-answer>
                </pl-order-blocks>""",
            {
                "answer_name": "test2",
                "weight": 3,
                "grading_method": pl_order_blocks.GradingMethodType.ORDERED,
                "allow_blank": True,
                "file_name": "test_code.py",
                "source_blocks_order": pl_order_blocks.SourceBlocksOrderType.ORDERED,
                "indentation": False,
                "max_incorrect": 2,
                "min_incorrect": 3,
                "source_header": "TEST",
                "solution_header": "TEST",
                "solution_placement": pl_order_blocks.SolutionPlacementType.BOTTOM,
                "max_indent": 3,
                "partial_credit_type": pl_order_blocks.PartialCreditType.LCS,
                "feedback_type": pl_order_blocks.FeedbackType.FIRST_WRONG_VERBOSE,
                "format_type": pl_order_blocks.FormatType.CODE,
                "code_language": None,
                "inline": False,
            },
        ),
    ],
)
def test_get_order_blocks_attribs(input_str: str, expected_output: Any) -> None:
    element = lxml.html.fromstring(input_str)
    attrs = pl_order_blocks.get_order_blocks_attribs(element)
    assert attrs == expected_output


@pytest.mark.parametrize(
    ("input_str"),
    [
        r"""<pl-order-blocks
        indentation="true"
        partial-credit="none"
        feedback="none">
        <pl-answer correct="true" ranking="1" indent="0">def my_sum(first, second):</pl-answer>
        <pl-answer correct="true" ranking="2" indent="1">return first + second</pl-answer>
        </pl-order-blocks>""",
    ],
)
def test_get_order_blocks_attribs_failure(
    input_str: str,
) -> None:
    element = lxml.html.fromstring(input_str)
    with pytest.raises(ValueError, match=r'Required attribute "answers-name" missing'):
        pl_order_blocks.get_order_blocks_attribs(element)


@pytest.mark.parametrize(
    ("input_str"),
    [
        r"""<pl-order-blocks
        answers-name="TEST"
        indentation="true"
        partial-credit="lcs"
        grading-method="unordered"
        feedback="none">
        <pl-answer correct="true" ranking="1" indent="0">def my_sum(first, second):</pl-answer>
        <pl-answer correct="true" ranking="2" indent="1">return first + second</pl-answer>
        </pl-order-blocks>""",
    ],
)
def test_invalid_partial_credit_option(input_str: str) -> None:
    element = lxml.html.fromstring(input_str)
    attribs = pl_order_blocks.get_order_blocks_attribs(element)
    with pytest.raises(
        ValueError,
        match=r"You may only specify partial credit options in the DAG, ordered, and ranking grading modes.",
    ):
        pl_order_blocks.validate_order_blocks_attribs(attribs)


@pytest.mark.parametrize(
    ("input_str", "expected_output"),
    [
        (
            r"""
            <pl_order_blocks>
               <pl-answer correct="true" indent="0">def my_sum(first, second):</pl-answer>
           <\pl_order_blocks>
           """,
            {
                "correct": True,
                "ranking": -1,
                "indent": 0,
                "depends": [],
                "tag": "TEST",
                "inner_html": "def my_sum(first, second):",
                "distractor_feedback": pl_order_blocks.DISTRACTOR_FEEDBACK_DEFAULT,
                "ordering_feedback": pl_order_blocks.ORDERING_FEEDBACK_DEFAULT,
                "distractor_for": pl_order_blocks.DISTRACTOR_FOR_DEFAULT,
                "group_info": {"tag": None, "depends": None},
            },
        ),
    ],
)
def test_get_answer_attribs_ordered_grading(
    input_str: str, expected_output: Any
) -> None:
    element = lxml.html.fromstring(input_str)
    attribs = pl_order_blocks.get_answer_attribs(
        element, pl_order_blocks.GRADING_METHOD_DEFAULT
    )
    expected_output["tag"] = attribs[0]["tag"]
    assert attribs[0] == expected_output


@pytest.mark.parametrize(
    ("input_str", "expected_output"),
    [
        (
            r"""
            <pl-order-blocks>
            <pl-answer tag="TEST" ranking="1" correct="true" distractor-feedback="TEST DISTRACTOR FEEDBACK" ordering-feedback="TEST ORDERING FEEDBACK" distractor-for="TEST" indent="0">def my_sum(first, second):</pl-answer>
            </pl-order-blocks>
            """,
            {
                "correct": True,
                "ranking": 1,
                "indent": 0,
                "depends": [],
                "tag": "TEST",
                "inner_html": "def my_sum(first, second):",
                "distractor_feedback": "TEST DISTRACTOR FEEDBACK",
                "ordering_feedback": "TEST ORDERING FEEDBACK",
                "distractor_for": "TEST",
                "group_info": {"tag": None, "depends": None},
            },
        ),
    ],
)
def test_get_answer_attribs_ranking_grading(
    input_str: str, expected_output: Any
) -> None:
    element = lxml.html.fromstring(input_str)
    attribs = pl_order_blocks.get_answer_attribs(
        element, pl_order_blocks.GradingMethodType.RANKING
    )
    expected_output["tag"] = attribs[0]["tag"]
    assert attribs[0] == expected_output


@pytest.mark.parametrize(
    ("input_str"),
    [
        r"""<pl-order-blocks
        answers-name="test2"
        indentation="true"
        partial-credit="none"
        grading-method="ranking"
        feedback="none">
        <pl-answer correct="true" ranking="1" indent="0">def my_sum(first, second):</pl-answer>
        <pl-answer correct="false" ranking="2" ordering-feedback="NOT ALLOWED" indent="1">return first + second</pl-answer>
        </pl-order-blocks>""",
    ],
)
def test_ordering_feedback_failure(input_str: str) -> None:
    element = lxml.html.fromstring(input_str)
    order_blocks_attribs = pl_order_blocks.get_order_blocks_attribs(element)

    with pytest.raises(
        ValueError,
        match=r"The ordering-feedback attribute may only be used on blocks with correct=true.",
    ):
        pl_order_blocks.validate_answer_attribs_setup()(
            pl_order_blocks.get_answer_attribs(
                element, order_blocks_attribs["grading_method"]
            ),
            order_blocks_attribs,
        )


@pytest.mark.parametrize(
    ("input_str", "expected_output"),
    [
        (
            r"""
            <pl-order-blocks>
                <pl-answer tag="TEST"
                correct="true"
                distractor-feedback="TEST DISTRACTOR FEEDBACK"
                ordering-feedback="TEST ORDERING FEEDBACK"
                distractor-for="TEST"
                indent="0">def my_sum(first, second):</pl-answer>
            </pl-order-blocks>
            """,
            {
                "correct": True,
                "ranking": -1,
                "indent": 0,
                "depends": [],
                "tag": "TEST",
                "inner_html": "def my_sum(first, second):",
                "distractor_feedback": "TEST DISTRACTOR FEEDBACK",
                "ordering_feedback": "TEST ORDERING FEEDBACK",
                "distractor_for": "TEST",
                "group_info": {"tag": None, "depends": None},
            },
        ),
    ],
)
def test_get_answer_attribs_dag_grading(input_str: str, expected_output: Any) -> None:
    element = lxml.html.fromstring(input_str)
    attribs = pl_order_blocks.get_answer_attribs(
        element, pl_order_blocks.GradingMethodType.RANKING
    )
    expected_output["tag"] = attribs[0]["tag"]
    assert attribs[0] == expected_output


@pytest.mark.parametrize(
    ("input_str"),
    [
        r"""<pl-order-blocks
        answers-name="test2"
        indentation="true"
        partial-credit="none"
        grading-method="ranking"
        feedback="none">
        <pl-block-group>
            <pl-test correct="true" ranking="1" indent="0">def my_sum(first, second):</pl-test>
        </pl-block-group>
        <pl-answer correct="true" ranking="1" indent="0">def my_sum(first, second):</pl-answer>
        <pl-answer correct="false" ranking="2" ordering-feedback="NOT ALLOWED" indent="1">return first + second</pl-answer>
        </pl-order-blocks>""",
    ],
)
def test_invalid_inner_tag(input_str: str) -> None:
    element = lxml.html.fromstring(input_str)
    order_blocks_attribs = pl_order_blocks.get_order_blocks_attribs(element)
    with pytest.raises(
        ValueError,
        match=r"Any html tags nested inside <pl-order-blocks> must be <pl-answer> or <pl-block-group>.\n                Any html tags nested inside <pl-block-group> must be <pl-answer>",
    ):
        pl_order_blocks.get_answer_attribs(
            element, order_blocks_attribs["grading_method"]
        )
