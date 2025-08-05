import importlib
from typing import Any

import lxml.html
from prairielearn.html_utils import inner_html
import pytest
from order_blocks_options_parsing import FeedbackType, FormatType, GradingMethodType, OrderBlockOptions, AnswerOptions, PartialCreditType, SolutionPlacementType, SourceBlocksOrderType, collect_answer_options


def build_pl_order_blocks_html(options: dict) -> str:
    newline = "\n"
    return f"""
<pl-order-blocks 
  {f"answers-name={options['answer_name']}" if 'answer_name' in options.keys() else ''}
  {f"weight={options['weight']}" if 'weight' in options.keys() else ''}
  {f"grading-method={options['grading_method'].value}" if 'grading_method' in options.keys() else ''}
  {f"allow-blank={options['allow_blank']}" if 'allow_blank' in options.keys() else ''}
  {f"file-name={options['file_name']}" if 'file_name' in options.keys() else ''}
  {f"source-blocks-order={options['source_blocks_order'].value}" if 'source_blocks_order' in options.keys() else ''}
  {f"indentation={options['indentation']}" if 'indentation' in options.keys() else ''}
  {f"max-incorrect={options['max_incorrect']}" if 'max_incorrect' in options.keys() else ''}
  {f"min-incorrect={options['min_incorrect']}" if 'min_incorrect' in options.keys() else ''}
  {f"source-header={options['source_header']}" if 'source_header' in options.keys() else ''}
  {f"solution-header={options['solution_header']}" if 'solution_header' in options.keys() else ''}
  {f"partial-credit={options['partial_credit_type'].value}" if 'partial_credit_type' in options.keys() else ''}
  {f"solution-placement={options['solution_placement'].value}" if 'solution_placement' in options.keys() else ''}
  {f"format={options['format_type'].value}" if 'format_type' in options.keys() else ''}
  {f"max-indent={options['max_indent']}" if 'max_indent' in options.keys() else ''}
  {f"feedback={options['feedback_type'].value}" if 'feedback_type' in options.keys() else ''}
  {f"{newline.join(f'{key}={value}' for key, value in options['extra_attrs'].items())}" if 'extra_attrs' in options.keys() else ''}
>
    {options["inner_html"] if "inner_html" in options.keys() else ''}
</pl-order-blocks>"""


def build_pl_answer_tag(options: dict) -> str:
    newline = "\n"
    return f"""
<pl-answer
  {f"correct={options['correct']}" if 'correct' in options.keys() else ''}
  {f"ranking={options['ranking']}" if 'ranking' in options.keys() else ''}
  {f"indent={options['indent']}" if 'indent' in options.keys() else ''}
  {f"depends={options['depends']}" if 'depends' in options.keys() else ''}
  {f"tag={options['tag']}" if 'tag' in options.keys() else ''}
  {f"distractor-for={options['distractor_for']}" if 'distractor_for' in options.keys() else ''}
  {f"distractor-feedback={options['distractor_feedback']}" if 'distractor_feedback' in options.keys() else ''}
  {f"ordering-feedback={options['ordering_feedback']}" if 'ordering_feedback' in options.keys() else ''}
  {f"{newline.join(f'{key}={value}' for key, value in options['extra_attrs'].items())}" if 'extra_attrs' in options.keys() else ''}
>
    {options["inner_html"] if "inner_html" in options.keys() else ''}
</pl-answer>"""


def assert_order_blocks_options(order_block_options: OrderBlockOptions, options: dict):
    assert order_block_options.answer_name == options["answer_name"]
    if 'weight' in options.keys():
        assert order_block_options.weight == options["weight"]
    if 'grading_method' in options.keys():
        assert order_block_options.grading_method == options["grading_method"]
    if 'allow_blank' in options.keys():
        assert order_block_options.allow_blank == options["allow_blank"]
    if 'file_name' in options.keys():
        assert order_block_options.file_name == options["file_name"]
    if 'source_blocks_order' in options.keys():
        assert order_block_options.source_blocks_order == options["source_blocks_order"]
    if 'indentation' in options.keys():
        assert order_block_options.indentation == options["indentation"]
    if 'max_incorrect' in options.keys():
        assert order_block_options.max_incorrect ==options["max_incorrect"]
    if 'min_incorrect' in options.keys():
        assert order_block_options.min_incorrect ==options["min_incorrect"]
    if 'source_header' in options.keys():
        assert order_block_options.source_header == options["source_header"]
    if 'solution_header' in options.keys():
        assert order_block_options.solution_header == options["solution_header"]
    if 'partial_credit_type' in options.keys():
        assert order_block_options.partial_credit_type == options["partial_credit_type"]
    if 'solution_placement' in options.keys():
        assert order_block_options.solution_placement == options["solution_placement"]
    if 'format_type' in options.keys():
        assert order_block_options.format_type == options["format_type"]
    if 'max_indent' in options.keys():
        assert order_block_options.max_indent == options["max_indent"]
    if 'feedback_type' in options.keys():
        assert order_block_options.feedback_type == options["feedback_type"]



def test_valid_order_block_options() -> None:
    tag1 = {
        "correct": True,
        "indent": 4,
        "inner_html": "TAG 1"
    }

    options = {
        "answer_name": "test",
        "weight": 3,
        "grading_method": GradingMethodType.ORDERED,
        "allow_blank": True,
        "file_name": "test_code.py",
        "source_blocks_order": SourceBlocksOrderType.ORDERED,
        "indentation": False,
        "max_incorrect": 2,
        "min_incorrect": 3,
        "source_header": "TEST",
        "solution_header": "TEST",
        "partial_credit_type": PartialCreditType.LCS,
        "solution_placement": SolutionPlacementType.BOTTOM,
        "format_type": FormatType.CODE,
        "max_indent": 3,
        "feedback_type": FeedbackType.FIRST_WRONG_VERBOSE,
        "inner_html": build_pl_answer_tag(tag1)
        }
    

    question = build_pl_order_blocks_html(options)
    html_element = lxml.html.fromstring(question)
    order_block_options = OrderBlockOptions(html_element)
    assert_order_blocks_options(order_block_options, options)



@pytest.mark.parametrize(
    ("options", "error"),
    [({ 
       "weight": 3,
        }, r'Required attribute "answers-name" missing'
      ),
     ({ 
       "answer_name": "test",
       "extra_attrs": {"invalid": "test"},
       }, r'Unknown attribute "invalid"'
      )
     ])
def test_check_attribute_failure(options: dict, error: str) -> None:
    question = build_pl_order_blocks_html(options)
    print(question)
    html_element = lxml.html.fromstring(question)

    with pytest.raises(ValueError, match=error):
        OrderBlockOptions(html_element)

# @pytest.mark.parametrize(
#     ("input_str"),
#     [
#         r"""<pl-order-blocks
#         answers-name="TEST"
#         indentation="true"
#         partial-credit="lcs"
#         grading-method="unordered"
#         feedback="none">
#         <pl-answer correct="true" ranking="1" indent="0">def my_sum(first, second):</pl-answer>
#         <pl-answer correct="true" ranking="2" indent="1">return first + second</pl-answer>
#         </pl-order-blocks>""",
#     ],
# )
# def test_invalid_partial_credit_option(input_str: str) -> None:
#     element = lxml.html.fromstring(input_str)
#     attribs = pl_order_blocks.get_order_blocks_attribs(element)
#     with pytest.raises(
#         ValueError,
#         match=r"You may only specify partial credit options in the DAG, ordered, and ranking grading modes.",
#     ):
#         pl_order_blocks.validate_order_blocks_attribs(attribs)
#
#
# @pytest.mark.parametrize(
#     ("input_str", "expected_output"),
#     [
#         (
#             r"""
#             <pl_order_blocks>
#                <pl-answer correct="true" indent="0">def my_sum(first, second):</pl-answer>
#            <\pl_order_blocks>
#            """,
#             {
#                 "correct": True,
#                 "ranking": -1,
#                 "indent": 0,
#                 "depends": [],
#                 "tag": "TEST",
#                 "inner_html": "def my_sum(first, second):",
#                 "distractor_feedback": pl_order_blocks.DISTRACTOR_FEEDBACK_DEFAULT,
#                 "ordering_feedback": pl_order_blocks.ORDERING_FEEDBACK_DEFAULT,
#                 "distractor_for": pl_order_blocks.DISTRACTOR_FOR_DEFAULT,
#                 "group_info": {"tag": None, "depends": None},
#             },
#         ),
#     ],
# )
# def test_get_answer_attribs_ordered_grading(
#     input_str: str, expected_output: Any
# ) -> None:
#     element = lxml.html.fromstring(input_str)
#     attribs = pl_order_blocks.get_answer_attribs(
#         element, pl_order_blocks.GRADING_METHOD_DEFAULT
#     )
#     expected_output["tag"] = attribs[0]["tag"]
#     assert attribs[0] == expected_output
#
#
# @pytest.mark.parametrize(
#     ("input_str", "expected_output"),
#     [
#         (
#             r"""
#             <pl-order-blocks>
#             <pl-answer tag="TEST" ranking="1" correct="true" distractor-feedback="TEST DISTRACTOR FEEDBACK" ordering-feedback="TEST ORDERING FEEDBACK" distractor-for="TEST" indent="0">def my_sum(first, second):</pl-answer>
#             </pl-order-blocks>
#             """,
#             {
#                 "correct": True,
#                 "ranking": 1,
#                 "indent": 0,
#                 "depends": [],
#                 "tag": "TEST",
#                 "inner_html": "def my_sum(first, second):",
#                 "distractor_feedback": "TEST DISTRACTOR FEEDBACK",
#                 "ordering_feedback": "TEST ORDERING FEEDBACK",
#                 "distractor_for": "TEST",
#                 "group_info": {"tag": None, "depends": None},
#             },
#         ),
#     ],
# )
# def test_get_answer_attribs_ranking_grading(
#     input_str: str, expected_output: Any
# ) -> None:
#     element = lxml.html.fromstring(input_str)
#     attribs = pl_order_blocks.get_answer_attribs(
#         element, pl_order_blocks.GradingMethodType.RANKING
#     )
#     expected_output["tag"] = attribs[0]["tag"]
#     assert attribs[0] == expected_output
#
#
# @pytest.mark.parametrize(
#     ("input_str"),
#     [
#         r"""<pl-order-blocks
#         answers-name="test2"
#         indentation="true"
#         partial-credit="none"
#         grading-method="ranking"
#         feedback="none">
#         <pl-answer correct="true" ranking="1" indent="0">def my_sum(first, second):</pl-answer>
#         <pl-answer correct="false" ranking="2" ordering-feedback="NOT ALLOWED" indent="1">return first + second</pl-answer>
#         </pl-order-blocks>""",
#     ],
# )
# def test_ordering_feedback_failure(input_str: str) -> None:
#     element = lxml.html.fromstring(input_str)
#     order_blocks_attribs = pl_order_blocks.get_order_blocks_attribs(element)
#
#     with pytest.raises(
#         ValueError,
#         match=r"The ordering-feedback attribute may only be used on blocks with correct=true.",
#     ):
#         pl_order_blocks.validate_answer_attribs_setup()(
#             pl_order_blocks.get_answer_attribs(
#                 element, order_blocks_attribs["grading_method"]
#             ),
#             order_blocks_attribs,
#         )
#
#
# @pytest.mark.parametrize(
#     ("input_str", "expected_output"),
#     [
#         (
#             r"""
#             <pl-order-blocks>
#                 <pl-answer tag="TEST"
#                 correct="true"
#                 distractor-feedback="TEST DISTRACTOR FEEDBACK"
#                 ordering-feedback="TEST ORDERING FEEDBACK"
#                 distractor-for="TEST"
#                 indent="0">def my_sum(first, second):</pl-answer>
#             </pl-order-blocks>
#             """,
#             {
#                 "correct": True,
#                 "ranking": -1,
#                 "indent": 0,
#                 "depends": [],
#                 "tag": "TEST",
#                 "inner_html": "def my_sum(first, second):",
#                 "distractor_feedback": "TEST DISTRACTOR FEEDBACK",
#                 "ordering_feedback": "TEST ORDERING FEEDBACK",
#                 "distractor_for": "TEST",
#                 "group_info": {"tag": None, "depends": None},
#             },
#         ),
#     ],
# )
# def test_get_answer_attribs_dag_grading(input_str: str, expected_output: Any) -> None:
#     element = lxml.html.fromstring(input_str)
#     attribs = pl_order_blocks.get_answer_attribs(
#         element, pl_order_blocks.GradingMethodType.RANKING
#     )
#     expected_output["tag"] = attribs[0]["tag"]
#     assert attribs[0] == expected_output
#
#
# @pytest.mark.parametrize(
#     ("input_str"),
#     [
#         r"""<pl-order-blocks
#         answers-name="test2"
#         indentation="true"
#         partial-credit="none"
#         grading-method="ranking"
#         feedback="none">
#         <pl-block-group>
#             <pl-test correct="true" ranking="1" indent="0">def my_sum(first, second):</pl-test>
#         </pl-block-group>
#         <pl-answer correct="true" ranking="1" indent="0">def my_sum(first, second):</pl-answer>
#         <pl-answer correct="false" ranking="2" ordering-feedback="NOT ALLOWED" indent="1">return first + second</pl-answer>
#         </pl-order-blocks>""",
#     ],
# )
# def test_invalid_inner_tag(input_str: str) -> None:
#     element = lxml.html.fromstring(input_str)
#     order_blocks_attribs = pl_order_blocks.get_order_blocks_attribs(element)
#     with pytest.raises(
#         ValueError,
#         match=r"Any html tags nested inside <pl-order-blocks> must be <pl-answer> or <pl-block-group>.\n                Any html tags nested inside <pl-block-group> must be <pl-answer>",
#     ):
#         pl_order_blocks.get_answer_attribs(
#             element, order_blocks_attribs["grading_method"]
#         )
