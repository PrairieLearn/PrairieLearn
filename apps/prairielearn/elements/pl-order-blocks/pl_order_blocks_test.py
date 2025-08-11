import importlib
from typing import Any

import lxml.html
from prairielearn.html_utils import inner_html
import pytest
from order_blocks_options_parsing import FeedbackType, FormatType, GradingMethodType, OrderBlockOptions, AnswerOptions, PartialCreditType, SolutionPlacementType, SourceBlocksOrderType, collect_answer_options

def build_tag(tag_name: str, options: dict, inner_html: str = "") -> str:
    newline = "\n"
    return f"""<{tag_name} 
        {newline.join(f'{n}={v}' for (n, v) in options.items())}
    >
    {inner_html}
</{tag_name}>"""


def assert_order_blocks_options(order_block_options: OrderBlockOptions, options: dict):
    assert order_block_options.answers_name == options["answers-name"]
    if 'weight' in options.keys():
        assert order_block_options.weight == options["weight"]
    if 'grading-method' in options.keys():
        assert order_block_options.grading_method.value == options["grading-method"]
    if 'allow-blank' in options.keys():
        assert order_block_options.allow_blank == options["allow-blank"]
    if 'file-name' in options.keys():
        assert order_block_options.file_name == options["file-name"]
    if 'source-blocks-order' in options.keys():
        assert order_block_options.source_blocks_order.value == options["source-blocks-order"]
    if 'indentation' in options.keys():
        assert order_block_options.indentation == options["indentation"]
    if 'max-incorrect' in options.keys():
        assert order_block_options.max_incorrect == options["max-incorrect"]
    if 'min-incorrect' in options.keys():
        assert order_block_options.min_incorrect == options["min-incorrect"]
    if 'source-header' in options.keys():
        assert order_block_options.source_header == options["source-header"]
    if 'solution-header' in options.keys():
        assert order_block_options.solution_header == options["solution-header"]
    if 'partial-credit' in options.keys():
        assert order_block_options.partial_credit.value == options["partial-credit"]
    if 'solution-placement' in options.keys():
        assert order_block_options.solution_placement.value == options["solution-placement"]
    if 'format' in options.keys():
        assert order_block_options.format.value == options["format"]
    if 'max-indent' in options.keys():
        assert order_block_options.max_indent == options["max-indent"]
    if 'feedback' in options.keys():
        assert order_block_options.feedback.value == options["feedback"]



def test_valid_order_block_options() -> None:
    tag1 = {
        "correct": True,
        "indent": 4,
    }

    options = {
        "answers-name": "test",
        "weight": 3,
        "grading-method": "ordered",
        "allow-blank": True,
        "file-name": "test_code.py",
        "source-blocks-order": "ordered",
        "indentation": False,
        "max-incorrect": 2,
        "min-incorrect": 3,
        "source-header": "TEST",
        "solution-header": "TEST",
        "partial-credit": "lcs",
        "solution-placement": "bottom",
        "format": "code",
        "max-indent": 3,
        "feedback": "first-wrong-verbose",
        }
    

    question = build_tag(
            tag_name="pl-order-blocks",
            options=options,
            inner_html=build_tag(tag_name="pl-answer", options=tag1, inner_html="TAG1")
            )
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
       "answers-name": "test",
       "invalid": "test"
       }, r'Unknown attribute "invalid"'
      )
     ])
def test_check_attribute_failure(options: dict, error: str) -> None:
    question = build_tag(
            tag_name="pl-order-blocks",
            options=options,
            )
    html_element = lxml.html.fromstring(question)

    with pytest.raises(ValueError, match=error):
        OrderBlockOptions(html_element)
