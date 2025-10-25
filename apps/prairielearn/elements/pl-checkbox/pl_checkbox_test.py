import importlib
from typing import NamedTuple

import pytest

pl_checkbox = importlib.import_module("pl-checkbox")


class HelpTextParams(NamedTuple):
    """Parameters for generate_help_text function."""

    num_correct: int
    num_display_answers: int
    show_number_correct: bool
    detailed_help_text: bool
    has_min_select_attrib: bool
    has_max_select_attrib: bool
    min_options_to_select: int
    max_options_to_select: int
    allow_blank: bool


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        pytest.param(
            HelpTextParams(
                num_correct=2,
                num_display_answers=5,
                show_number_correct=False,
                detailed_help_text=False,
                has_min_select_attrib=False,
                has_max_select_attrib=False,
                min_options_to_select=1,
                max_options_to_select=5,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select all possible options that apply.</small>',
            id="basic_no_options",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=2,
                num_display_answers=5,
                show_number_correct=False,
                detailed_help_text=False,
                has_min_select_attrib=False,
                has_max_select_attrib=False,
                min_options_to_select=0,
                max_options_to_select=5,
                allow_blank=True,
            ),
            '<small class="form-text text-muted">Select all possible options that apply.</small>',
            id="allow_blank",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=1,
                num_display_answers=5,
                show_number_correct=True,
                detailed_help_text=False,
                has_min_select_attrib=False,
                has_max_select_attrib=False,
                min_options_to_select=1,
                max_options_to_select=5,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select all possible options that apply. There is exactly <b>1</b> correct option in the list above.</small>',
            id="show_single_correct",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=3,
                num_display_answers=5,
                show_number_correct=True,
                detailed_help_text=False,
                has_min_select_attrib=False,
                has_max_select_attrib=False,
                min_options_to_select=1,
                max_options_to_select=5,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select all possible options that apply. There are exactly <b>3</b> correct options in the list above.</small>',
            id="show_multiple_correct",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=3,
                num_display_answers=5,
                show_number_correct=False,
                detailed_help_text=False,
                has_min_select_attrib=True,
                has_max_select_attrib=False,
                min_options_to_select=2,
                max_options_to_select=5,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select  at least <b>2</b> options.</small>',
            id="min_select_only",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=2,
                num_display_answers=5,
                show_number_correct=False,
                detailed_help_text=False,
                has_min_select_attrib=False,
                has_max_select_attrib=True,
                min_options_to_select=1,
                max_options_to_select=3,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select  at most <b>3</b> options.</small>',
            id="max_select_only",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=3,
                num_display_answers=5,
                show_number_correct=False,
                detailed_help_text=False,
                has_min_select_attrib=True,
                has_max_select_attrib=True,
                min_options_to_select=2,
                max_options_to_select=4,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select  between <b>2</b> and <b>4</b> options.</small>',
            id="min_and_max_different",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=3,
                num_display_answers=5,
                show_number_correct=False,
                detailed_help_text=False,
                has_min_select_attrib=True,
                has_max_select_attrib=True,
                min_options_to_select=3,
                max_options_to_select=3,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select  exactly <b>3</b> options.</small>',
            id="min_and_max_same",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=3,
                num_display_answers=5,
                show_number_correct=False,
                detailed_help_text=True,
                has_min_select_attrib=False,
                has_max_select_attrib=False,
                min_options_to_select=1,
                max_options_to_select=4,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select  between <b>1</b> and <b>4</b> options.</small>',
            id="detailed_help_different_values",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=2,
                num_display_answers=5,
                show_number_correct=False,
                detailed_help_text=True,
                has_min_select_attrib=False,
                has_max_select_attrib=False,
                min_options_to_select=2,
                max_options_to_select=2,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select  exactly <b>2</b> options.</small>',
            id="detailed_help_same_values",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=3,
                num_display_answers=5,
                show_number_correct=True,
                detailed_help_text=True,
                has_min_select_attrib=False,
                has_max_select_attrib=False,
                min_options_to_select=2,
                max_options_to_select=4,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select  between <b>2</b> and <b>4</b> options. There are exactly <b>3</b> correct options in the list above.</small>',
            id="detailed_help_with_show_correct",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=2,
                num_display_answers=5,
                show_number_correct=True,
                detailed_help_text=False,
                has_min_select_attrib=True,
                has_max_select_attrib=False,
                min_options_to_select=2,
                max_options_to_select=5,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select  at least <b>2</b> options. There are exactly <b>2</b> correct options in the list above.</small>',
            id="min_select_with_show_correct",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=2,
                num_display_answers=5,
                show_number_correct=False,
                detailed_help_text=False,
                has_min_select_attrib=True,
                has_max_select_attrib=False,
                min_options_to_select=1,
                max_options_to_select=5,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select all possible options that apply.</small>',
            id="min_select_equals_default",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=2,
                num_display_answers=5,
                show_number_correct=False,
                detailed_help_text=False,
                has_min_select_attrib=False,
                has_max_select_attrib=True,
                min_options_to_select=1,
                max_options_to_select=5,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select all possible options that apply.</small>',
            id="max_select_equals_num_answers",
        ),
        pytest.param(
            HelpTextParams(
                num_correct=4,
                num_display_answers=10,
                show_number_correct=True,
                detailed_help_text=False,
                has_min_select_attrib=True,
                has_max_select_attrib=True,
                min_options_to_select=3,
                max_options_to_select=7,
                allow_blank=False,
            ),
            '<small class="form-text text-muted">Select  between <b>3</b> and <b>7</b> options. There are exactly <b>4</b> correct options in the list above.</small>',
            id="complex_multiple_options",
        ),
    ],
)
def test_generate_help_text(params: HelpTextParams, expected: str) -> None:
    """Test generate_help_text with various parameter combinations."""
    result = pl_checkbox.generate_help_text(**params._asdict())
    assert result == expected
