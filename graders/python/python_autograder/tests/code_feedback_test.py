# ruff: noqa: ARG001 ANN001
import re
from unittest.mock import mock_open, patch

import pytest
from code_feedback import Feedback

"""
Tests for the `Feedback.check_dict` method in `code_feedback.py`.

This module uses pytest parameterized tests to cover various scenarios for comparing
a student-provided dictionary (`data`) against a reference dictionary (`ref`).

Test Categories:
- `test_check_dict_correct_cases`: Verifies scenarios where `check_dict` should return `True`
  (e.g., identical dictionaries, different order, mixed types, nested dictionaries, None values).
- `test_check_dict_incorrect_cases`: Verifies scenarios where `check_dict` should return `False`
  and generate specific feedback messages (e.g., mismatched keys/values, incorrect types,
  extra/missing keys, empty dictionaries vs. non-empty, non-dict inputs).
- `test_check_dict_target_keys`: Tests the functionality of the `target_keys` parameter, ensuring
  it correctly checks only the specified subset of keys and handles missing or incorrect
  keys/values within that subset.
- `test_check_dict_with_partial_key_matching_raises_error`: Ensures a `ValueError` is raised
  when `target_keys` contains keys not present in the reference dictionary.
"""


NAME = "test_check_dict"


@pytest.fixture(autouse=True)
def setup_feedback() -> None:
    Feedback.set_name(NAME)
    Feedback.buffer = ""


@pytest.mark.parametrize(
    ("ref_dict", "student_dict"),
    [
        (
            {"a": 1, "b": 2, "c": 3},
            {"a": 1, "b": 2, "c": 3},
        ),  # Test: Identical dictionaries
        (
            {1: "a", 2: "2", "d": 3, "list": [1, 2, "apple"]},
            {"list": [1, 2, "apple"], 1: "a", 2: "2", "d": 3},
        ),  # Test: Identical dictionaries with different key order and types
        (
            {"a": 1, "b": "string", "c": [1, 2, 3], "d": (4, 5), "e": None},
            {"a": 1, "b": "string", "c": [1, 2, 3], "d": (4, 5), "e": None},
        ),  # Test: Dictionaries with mixed value types
        ({}, {}),  # Test: Empty dictionaries
        (
            {"a": None, "b": 2, "c": None},
            {"a": None, "b": 2, "c": None},
        ),  # Test: Dictionaries with None values
        (
            {"a": 1, "b": {"nested_key": 10}, "c": 3},
            {"a": 1, "b": {"nested_key": 10}, "c": 3},
        ),  # Test: Identical nested dictionaries
        (
            {f"key_{i}": i for i in range(1000)},
            {f"key_{i}": i for i in range(1000)},
        ),  # Test: Large identical dictionaries
    ],
)
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_correct_cases(
    mock_file, mock_add_feedback, ref_dict, student_dict
) -> None:
    """Test cases where check_dict should return True and not add feedback."""
    assert Feedback.check_dict(NAME, ref_dict, student_dict, report_success=False)
    mock_add_feedback.assert_not_called()


@pytest.mark.parametrize(
    ("ref_dict", "student_dict", "expected_feedback"),
    [
        (
            {"a": 1, "b": 2, "c": 3},
            {"x": 4, "y": 5, "z": 6},
            f"'{NAME}' has missing keys: `a, b, c`",
        ),  # Test: Completely different keys
        (
            {"a": 1, 2: "a", 3: "c"},
            {"x": 4, "y": 5, "z": 6},
            f"'{NAME}' has missing keys: `2, 3, a`",
        ),  # Test: Completely different keys with mixed types
        (
            {"a": 1, "b": 2, "c": 3},
            {"d": 1, "b": 2, "f": 3},
            f"'{NAME}' has missing keys: `a, c`",
        ),  # Test: Some incorrect keys, some correct
        (
            {"a": 1, "b": 2, "c": 3, "list": []},
            {"a": 1, "b": 2, "c": 3, "list": ()},
            f"'{NAME}' has key `list` with type `tuple`, which is not the right type",
        ),  # Test: Correct keys, incorrect value type (list vs tuple)
        (
            {"a": 1, "b": 2, "c": 3, 0: "c"},
            {"a": 1, "b": 3, "c": 2, 0: ""},
            f"'{NAME}' has key `b` with value `3`, which is not correct",
        ),  # Test: Correct keys, multiple incorrect values
        (
            {"a": 1, "b": 2, "c": 3},
            {"a": 1, "b": 5, "c": 3},
            f"'{NAME}' has key `b` with value `5`, which is not correct",
        ),  # Test: Correct keys, one incorrect value
        (
            {"a": None, "b": 2, "c": 3},
            {"a": 1, "b": 2, "c": None},
            f"'{NAME}' has key `a` with type `int`, which is not the right type",
        ),  # Test: Mismatched None/value types
        (
            {"a": 1, "b": {"nested_key": 10}, "c": 3},
            {"a": 1, "b": {"nested_key": 20}, "c": 3},
            f"'{NAME}' has key `b` with value `{{'nested_key': 20}}`, which is not correct",
        ),  # Test: Mismatched value in nested dictionary
        (
            {f"key_{i}": i for i in range(1000)},
            {f"key_{i}": i for i in range(1000)} | {"key_500": 999},
            f"'{NAME}' has key `key_500` with value `999`, which is not correct",
        ),  # Test: Mismatched value in large dictionary
        (
            {"a": 1, "b": 2, "c": 3},
            {"a": 1, "b": 2, "c": 3, "d": 4},
            f"'{NAME}' has extra keys: `d`",
        ),  # Test: Student dictionary has an extra key
        (
            {"a": 1, "b": 2, "c": 3},
            {"a": 1, "b": 2},
            f"'{NAME}' has missing keys: `c`",
        ),  # Test: Student dictionary is missing a key
        (
            {"a": 1, "b": 2, "c": 3},
            {},
            f"'{NAME}' has missing keys: `a, b, c`",
        ),  # Test: Student dictionary is empty, reference is not
        (
            {},
            {"a": 1, "b": 2, "c": 3},
            f"'{NAME}' has extra keys: `a, b, c`",
        ),  # Test: Reference dictionary is empty, student is not
        (
            {"a": 1, "b": 2, "c": 3},
            {"a": 1, "b": "2", "c": 3},
            f"'{NAME}' has key `b` with type `str`, which is not the right type",
        ),  # Test: Incorrect value type (int vs str)
        (
            {"a": 1, "b": "string", "c": [1, 2, 3]},
            {"a": 1, "b": 100, "c": ["1", "2", "3"]},
            f"'{NAME}' has key `b` with type `int`, which is not the right type",
        ),  # Test: Mixed types with incorrect type for one value
        (
            {"a": 1, "b": "string", "c": [1, 2, 3]},
            {"a": 1, "b": 100, "c": 43},
            f"'{NAME}' has key `b` with type `int`, which is not the right type",
        ),  # Test: Mixed types with incorrect type and value
        (
            {"a": 1},
            None,
            f"'{NAME}' is not a dict, got type NoneType",
        ),  # Test: Student data is None
        (
            {"a": 1},
            [("a", 1)],
            f"'{NAME}' is not a dict, got type list",
        ),  # Test: Student data is not a dictionary (list)
    ],
)
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_incorrect_cases(
    mock_file, mock_add_feedback, ref_dict, student_dict, expected_feedback
) -> None:
    """Test cases where check_dict should return False and add specific feedback."""
    assert not Feedback.check_dict(NAME, ref_dict, student_dict, report_success=False)
    mock_add_feedback.assert_called_with(expected_feedback)


@pytest.mark.parametrize(
    (
        "ref_dict",
        "student_dict",
        "target_keys",
        "expected_result",
        "expected_feedback",
    ),
    [
        (
            {"a": 1, "b": 2, "c": 3},
            {"a": 1, "b": 2, "c": 3, "d": 4},
            ["a", "b"],
            True,
            None,
        ),  # Test: target_keys check passes, extra keys ignored
        (
            {"a": 1, "b": 2, "c": 3},
            {"a": 1, "c": 3, "d": 4},
            ["a", "b"],
            False,
            f"'{NAME}' has missing keys: `b`",
        ),  # Test: target_keys check fails due to missing key
        (
            {"a": 1, "b": 2, "c": 3},
            {"a": 1, "b": 20, "d": 4},
            ["a", "b", "c"],
            False,
            f"'{NAME}' has missing keys: `c`",
        ),  # Test: target_keys check fails due to missing key and incorrect value (checked later)
        # Test case for incorrect value when using target_keys
        (
            {"a": 1, "b": 2, "c": 3},
            {"a": 1, "b": 99, "c": 3, "d": 4},
            ["a", "b"],
            False,
            f"'{NAME}' has key `b` with value `99`, which is not correct",
        ),  # Test: target_keys check fails due to incorrect value
    ],
)
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_target_keys(
    mock_file,
    mock_add_feedback,
    ref_dict,
    student_dict,
    target_keys,
    expected_result,
    expected_feedback,
) -> None:
    """Test check_dict with the target_keys parameter."""
    result = Feedback.check_dict(
        NAME, ref_dict, student_dict, target_keys=target_keys, report_success=False
    )
    assert result == expected_result
    if expected_feedback:
        mock_add_feedback.assert_called_with(expected_feedback)
    else:
        mock_add_feedback.assert_not_called()


# This test checks for a ValueError, so it remains separate
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_with_partial_key_matching_raises_error(
    mock_file, mock_add_feedback
) -> None:
    """Test that check_dict raises ValueError when target_keys contains keys not in ref_dict."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "d": 4}
    target_keys = ["d"]
    with pytest.raises(
        ValueError,
        match=re.escape(
            r"target_keys must be a subset of the reference dict keys. Got target_keys=['d'] but ref.keys=['a', 'b', 'c']"
        ),
    ):
        Feedback.check_dict(
            NAME, ref_dict, student_dict, target_keys=target_keys, report_success=False
        )
    mock_add_feedback.assert_not_called()
