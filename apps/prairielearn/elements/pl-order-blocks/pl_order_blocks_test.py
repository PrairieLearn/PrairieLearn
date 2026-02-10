import importlib
import random

import lxml.html
import pytest
from order_blocks_options_parsing import OrderBlocksOptions

pl_order_blocks = importlib.import_module("pl-order-blocks")
shuffle_distractor_groups = pl_order_blocks.shuffle_distractor_groups


def build_tag(tag_name: str, options: dict, inner_html: str = "") -> str:
    newline = "\n"
    return f"""<{tag_name}
        {newline.join(f'{n}="{v}"' for (n, v) in options.items())}
    >
    {inner_html}
</{tag_name}>"""


def assert_order_blocks_options(
    order_block_options: OrderBlocksOptions, options: dict
) -> None:
    assert order_block_options.answers_name == options["answers-name"]
    if "weight" in options:
        assert order_block_options.weight == options["weight"]
    if "grading-method" in options:
        assert order_block_options.grading_method.value == options["grading-method"]
    if "allow-blank" in options:
        assert order_block_options.allow_blank == options["allow-blank"]
    if "file-name" in options:
        assert order_block_options.file_name == options["file-name"]
    if "source-blocks-order" in options:
        assert (
            order_block_options.source_blocks_order.value
            == options["source-blocks-order"]
        )
    if "indentation" in options:
        assert order_block_options.indentation == options["indentation"]
    if "max-incorrect" in options:
        assert order_block_options.max_incorrect == options["max-incorrect"]
    if "min-incorrect" in options:
        assert order_block_options.min_incorrect == options["min-incorrect"]
    if "source-header" in options:
        assert order_block_options.source_header == options["source-header"]
    if "solution-header" in options:
        assert order_block_options.solution_header == options["solution-header"]
    if "partial-credit" in options:
        assert order_block_options.partial_credit.value == options["partial-credit"]
    if "solution-placement" in options:
        assert (
            order_block_options.solution_placement.value
            == options["solution-placement"]
        )
    if "format" in options:
        assert order_block_options.format.value == options["format"]
    if "max-indent" in options:
        assert order_block_options.max_indent == options["max-indent"]
    if "feedback" in options:
        assert order_block_options.feedback.value == options["feedback"]


def assert_answer_options(
    order_block_options: OrderBlocksOptions, answer_option_list: list[dict]
) -> None:
    # Must be the same length to test all of them
    assert len(order_block_options.answer_options) == len(answer_option_list), (
        "answer_option length mismatch"
    )

    for answer_options, test_options in zip(
        order_block_options.answer_options, answer_option_list, strict=False
    ):
        if "correct" in test_options:
            assert answer_options.correct == test_options["correct"]
        if "ranking" in test_options:
            assert answer_options.ranking == test_options["ranking"]
        if "indent" in test_options:
            assert answer_options.indent == test_options["indent"]
        if "depends" in test_options:
            if test_options["depends"] == "":
                assert answer_options.depends == []
            else:
                assert answer_options.depends
        if "tag" in test_options:
            assert answer_options.tag == test_options["tag"]
        if "distractor-for" in test_options:
            assert answer_options.distractor_for == test_options["distractor-for"]
        if "distractor-feedback" in test_options:
            assert (
                answer_options.distractor_feedback
                == test_options["distractor-feedback"]
            )
        if "ordering-feedback" in test_options:
            assert answer_options.ordering_feedback == test_options["ordering-feedback"]
        if "final" in test_options:
            assert answer_options.final == test_options["final"]


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
        "indentation": True,
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
        inner_html=build_tag(tag_name="pl-answer", options=tag1, inner_html="TAG1"),
    )
    html_element = lxml.html.fromstring(question)
    order_block_options = OrderBlocksOptions(html_element)
    assert_order_blocks_options(order_block_options, options)


@pytest.mark.parametrize(
    ("options", "error"),
    [
        (
            {
                "weight": 3,
            },
            r'Required attribute "answers-name" missing',
        ),
        ({"answers-name": "test", "invalid": "test"}, r'Unknown attribute "invalid"'),
    ],
)
def test_check_attribute_failure(options: dict, error: str) -> None:
    question = build_tag(
        tag_name="pl-order-blocks",
        options=options,
    )
    html_element = lxml.html.fromstring(question)

    with pytest.raises(ValueError, match=error):
        OrderBlocksOptions(html_element)


@pytest.mark.parametrize(
    ("options"),
    [
        {
            "answers-name": "test",
            "grading-method": "dag",
            "weight": 2,
            "indentation": False,
            "partial-credit": "lcs",
        },
        {
            "answers-name": "test",
            "grading-method": "unordered",
            "weight": 1,
            "indentation": True,
            "solution-placement": "bottom",
            "feedback": "none",
            "source-blocks-order": "random",
        },
        {
            "answers-name": "test",
            "grading-method": "unordered",
            "weight": 1,
            "indentation": True,
            "solution-placement": "right",
            "source-blocks-order": "random",
            "format": "code",
        },
        {
            "answers-name": "test",
            "allow-blank": True,
            "file-name": "test.py",
            "indentation": True,
            "inline": False,
        },
    ],
)
def test_order_block_validation(options: dict) -> None:
    """Tests valid pl-order-blocks tag options validation"""
    question = build_tag(
        tag_name="pl-order-blocks",
        options=options,
        inner_html=build_tag("pl-answer", {"correct": True}),
    )
    html_element = lxml.html.fromstring(question)
    order_blocks_options = OrderBlocksOptions(html_element)
    assert_order_blocks_options(order_blocks_options, options)
    order_blocks_options._validate_order_blocks_options()


@pytest.mark.parametrize(
    ("options", "error"),
    [
        (
            {
                "answers-name": "test",
                "grading-method": "unordered",
                "partial-credit": "lcs",
            },
            r"You may only specify partial credit options in the DAG, ordered, and ranking grading modes.",
        ),
        (
            {
                "answers-name": "test",
                "grading-method": "unordered",
                "feedback": "first-wrong-verbose",
            },
            r"feedback type first-wrong-verbose is not available with the unordered grading-method.",
        ),
        (
            {
                "answers-name": "test",
                "code-language": "python",
            },
            r'code-language attribute may only be used with format="code"',
        ),
    ],
)
def test_order_block_validation_failure(options: dict, error: str) -> None:
    """Tests invalid pl-order-blocks options and asserts the fail during validation"""
    question = build_tag(
        tag_name="pl-order-blocks",
        options=options,
    )
    html_element = lxml.html.fromstring(question)
    order_blocks_options = OrderBlocksOptions(html_element)

    with pytest.raises(ValueError, match=error):
        order_blocks_options._validate_order_blocks_options()


@pytest.mark.parametrize(
    ("options", "answer_options_list"),
    [
        (
            {
                "answers-name": "test",
                "grading-method": "dag",
                "weight": 2,
                "indentation": False,
                "partial-credit": "lcs",
            },
            [
                {"tag": "1", "depends": r""},
                {"tag": "2", "depends": r"1"},
            ],
        ),
    ],
)
def test_answer_validation(options: dict, answer_options_list: list[dict]) -> None:
    """Tests valid pl-answer tag options validation"""
    tags_html = "\n".join(
        build_tag("pl-answer", answer_options) for answer_options in answer_options_list
    )
    question = build_tag("pl-order-blocks", options, tags_html)
    html_element = lxml.html.fromstring(question)
    order_blocks_options = OrderBlocksOptions(html_element)
    assert_order_blocks_options(order_blocks_options, options)
    assert_answer_options(order_blocks_options, answer_options_list)


@pytest.mark.parametrize(
    ("options", "answer_options_list", "error"),
    [
        (
            {
                "answers-name": "test",
                "grading-method": "dag",
                "weight": 2,
                "indentation": False,
                "partial-credit": "lcs",
            },
            [
                {"tag": "1", "depends": r""},
                {"tag": "2", "depends": r"1"},
                {"tag": "3", "depends": r"1|2", "final": True},
            ],
            "Use of optional lines requires 'final' attributes on all true <pl-answer> blocks that appears at the end of a valid ordering.",
        ),
    ],
)
def test_valid_final_tag(
    options: dict, answer_options_list: list[dict], error: str
) -> None:
    """Tests valid final tag parsing."""
    tags_html = "\n".join(
        build_tag("pl-answer", answer_options) for answer_options in answer_options_list
    )
    question = build_tag("pl-order-blocks", options, tags_html)
    html_element = lxml.html.fromstring(question)
    order_block_options = OrderBlocksOptions(html_element)
    assert_answer_options(order_block_options, answer_options_list)


@pytest.mark.parametrize(
    ("options", "answer_options_list", "error"),
    [
        (
            {
                "answers-name": "test",
                "grading-method": "dag",
                "weight": 2,
                "indentation": False,
                "partial-credit": "lcs",
            },
            [
                {"tag": "1", "depends": r""},
                {"tag": "2", "depends": r"1"},
                {"tag": "3", "depends": r"1|2"},
            ],
            "Use of optional lines requires 'final' attributes on all true <pl-answer> blocks that appears at the end of a valid ordering.",
        ),
    ],
)
def test_final_tag_failure(
    options: dict, answer_options_list: list[dict], error: str
) -> None:
    """Tests missing final tag in pl-answer-tag while using multigraph features"""
    tags_html = "\n".join(
        build_tag("pl-answer", answer_options) for answer_options in answer_options_list
    )
    question = build_tag("pl-order-blocks", options, tags_html)
    html_element = lxml.html.fromstring(question)
    order_blocks_options = OrderBlocksOptions(html_element)
    with pytest.raises(ValueError, match=error):
        order_blocks_options.validate()


def test_shuffle_distractor_groups() -> None:
    """Tests that shuffle_distractor_groups groups distractors with correct blocks
    while preserving the relative order of correct blocks.
    """
    random.seed(42)

    blocks = [
        {"tag": "first", "distractor_for": None, "inner_html": "First"},
        {"tag": "second", "distractor_for": None, "inner_html": "Second"},
        {"tag": "d1", "distractor_for": "second", "inner_html": "Distractor 1"},
        {"tag": "d2", "distractor_for": "second", "inner_html": "Distractor 2"},
        {"tag": "third", "distractor_for": None, "inner_html": "Third"},
    ]

    result = pl_order_blocks.shuffle_distractor_groups(blocks)

    # Correct blocks should maintain their relative order
    correct_block_tags = [b["tag"] for b in result if b.get("distractor_for") is None]
    assert correct_block_tags == ["first", "second", "third"]

    # First block (no distractors) should remain first
    assert result[0]["tag"] == "first"

    # Second block and its distractors should be grouped together (positions 1-3)
    second_group_tags = {b["tag"] for b in result[1:4]}
    assert second_group_tags == {"second", "d1", "d2"}

    # Third block should be last
    assert result[4]["tag"] == "third"
