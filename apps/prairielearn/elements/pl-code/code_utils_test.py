from typing import Optional

import pytest
from code_utils import parse_highlight_lines


@pytest.mark.parametrize(
    "input_str, expected_output",
    [
        ("1-2-3", None),
        ("asdf", None),
        ("1", [1]),
        ("1, 2-4, 8", [1, 2, 3, 4, 8]),
        ("6-7, 8, 15-17", [6, 7, 8, 15, 16, 17]),
    ],
)
def test_parse_highlight_lines(
    input_str: str, expected_output: Optional[list[int]]
) -> None:
    assert parse_highlight_lines(input_str) == expected_output
