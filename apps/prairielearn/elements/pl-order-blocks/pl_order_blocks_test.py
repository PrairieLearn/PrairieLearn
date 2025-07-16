import importlib

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
            """<pl-order-blocks answers-name=\"test2\"
                  weight=3
                  grading-method=\"ordered\"
                  allow-blank=\"true\"
                  file-name=\"test_code.py\"
                  source-blocks-order=\"ordered\"
                  indentation=\"false\"
                  max-incorrect=2
                  min-incorrect=3
                  source-header=\"TEST\"
                  solution-header=\"TEST\"
                  partial-credit=\"lcs\"
                  solution-placement=\"bottom\"
                  format=\"code\"
                  max-indent=3
                  feedback=\"first-wrong-verbose\">
                  <pl-answer correct=\"true\" ranking=\"1\" indent=\"0\">def my_sum(first, second):</pl-answer>
                  <pl-answer correct=\"true\" ranking=\"2\" indent=\"1\">return first + second</pl-answer>
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
def test_get_pl_order_blocks_attributes(
    input_str: str, expected_output: pl_order_blocks.PLOrderBlocksAttribs
) -> None:
    element = lxml.html.fromstring(input_str)
    attrs = pl_order_blocks.get_pl_order_blocks_attribs(element)
    assert attrs == expected_output


@pytest.mark.parametrize(
    ("input_str", "expected_output"),
    [
        (
            """<pl-order-blocks
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
    ],
)
def test_get_pl_order_blocks_attributes_failure(
    input_str: str, expected_output: pl_order_blocks.PLOrderBlocksAttribs
) -> None:
    element = lxml.html.fromstring(input_str)
    with pytest.raises(ValueError):
        pl_order_blocks.get_pl_order_blocks_attribs(element)


@pytest.mark.parametrize(
    ("input_str", "expected_output"),
    [
        (
            """<pl-answer correct=\"true\" ranking=\"1\" indent=\"0\">def my_sum(first, second):</pl-answer>""",
            {
                "correct": bool,
                "ranking": int,
                "indent": int,
                "tag": str,
                "depends": list[str],
                "inner_html": str,
                "distractor_feedback": str,
                "ordering_feedback": str,
                "distractor_for": str,
            },
        ),
    ],
)
def test_get_pl_answer_attributes(
    input_str: str, expected_output: pl_order_blocks.PLAnswerAttribs
) -> None:
    element = lxml.html.fromstring(input_str)
    with pytest.raises(ValueError):
        pl_order_blocks.get_pl_answer_attribs(element)
