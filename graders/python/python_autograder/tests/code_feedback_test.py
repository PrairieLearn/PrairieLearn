# ruff: noqa: ARG001 ANN001
# pyright: reportUnknownParameterType=none, reportMissingParameterType=none
import re
from unittest.mock import Mock, mock_open, patch

import pytest
from code_feedback import Feedback

"""
Testing Feedback.check_dict(name, ref, data) with all possible parameters

Checks that a student dict (`data`) has all correct key-value mappings with respect to a reference dict (`ref`).
It also verifies the length of keys in the student dictionary against the reference dictionary, and optionally,
enforces homogeneous data types for keys (using `key_type`), values (using `value_type`), or both.
Additionally, it can verify the presence of specific keys (using `only_keys`) in the student dictionary, and
can focus the comparison solely on keys (using `check_keys`), values (using `check_values`), or both.
"""


NAME = "test_check_dict"


@pytest.fixture(autouse=True)
def setup_feedback() -> None:
    Feedback.set_name(NAME)
    Feedback.buffer = ""


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_correct1(mock_file, mock_add_feedback) -> None:
    """Test when both dictionaries match exactly."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 2, "c": 3}
    assert Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_not_called()


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_correct_check_only_1(mock_file, mock_add_feedback) -> None:
    """Test when both dictionaries match exactly."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 2, "c": 3}
    assert Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_not_called()


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_correct2(mock_file, mock_add_feedback) -> None:
    """
    Test when both dictionaries match exactly.
    Checks only the key-value pair
    Does not perform typechecks
    """
    ref_dict = {1: "a", 2: "2", "d": 3, "list": [1, 2, "apple"]}
    student_dict = {"list": [1, 2, "apple"], 1: "a", 2: "2", "d": 3}
    assert Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_not_called()


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_with_mixed_types(mock_file, mock_add_feedback) -> None:
    """Test dictionaries with mixed value types."""
    ref_dict = {"a": 1, "b": "string", "c": [1, 2, 3], "d": (4, 5), "e": None}
    student_dict = {"a": 1, "b": "string", "c": [1, 2, 3], "d": (4, 5), "e": None}
    assert Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_not_called()


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_empty_dicts(mock_file, mock_add_feedback) -> None:
    """Test when both reference and student dictionaries are empty."""
    ref_dict = {}
    student_dict = {}
    assert Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_not_called()


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_with_none_values(mock_file, mock_add_feedback) -> None:
    """Test dictionaries where some keys have None as their value."""
    ref_dict = {"a": None, "b": 2, "c": None}
    student_dict = {"a": None, "b": 2, "c": None}
    assert Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_not_called()


# NESTED DICTS
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_nested_dicts_identical(mock_file, mock_add_feedback) -> None:
    """Test when both dictionaries have identical nested dictionaries."""
    ref_dict = {"a": 1, "b": {"nested_key": 10}, "c": 3}
    student_dict = {"a": 1, "b": {"nested_key": 10}, "c": 3}
    assert Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_not_called()


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_large_dicts(mock_file, mock_add_feedback) -> None:
    """Test large dictionaries with many keys and values."""
    ref_dict = {f"key_{i}": i for i in range(1000)}
    student_dict = {f"key_{i}": i for i in range(1000)}
    assert Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_not_called()


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_mismatched_keys1(mock_file, mock_add_feedback) -> None:
    """Test when the keys in the student dictionary do not match the reference dictionary at all."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"x": 4, "y": 5, "z": 6}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(f"{NAME} has missing keys: `a, b, c`")


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_mismatched_keys2(mock_file, mock_add_feedback) -> None:
    """Test when the keys in the student dictionary do not match the reference dictionary at all."""
    ref_dict = {"a": 1, 2: "a", 3: "c"}
    student_dict = {"x": 4, "y": 5, "z": 6}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(f"{NAME} has missing keys: `2, 3, a`")


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_incorrect_keys(mock_file, mock_add_feedback) -> None:
    """Test for incorrect keys, but same values in ref_dict, and student_dict"""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"d": 1, "b": 2, "f": 3}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(f"{NAME} has missing keys: `a, c`")


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_incorrect_values1(mock_file, mock_add_feedback) -> None:
    """Test for incorrect values, but same keys in ref_dict, and student_dict."""
    ref_dict = {"a": 1, "b": 2, "c": 3, "list": []}
    student_dict = {"a": 1, "b": 2, "c": 3, "list": ()}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(
        "test_check_dict has key `list` with type `tuple`, which is not the right type"
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_incorrect_values2(mock_file, mock_add_feedback) -> None:
    """Test for incorrect values, but same keys in ref_dict, and student_dict."""
    ref_dict = {"a": 1, "b": 2, "c": 3, 0: "c"}
    student_dict = {"a": 1, "b": 3, "c": 2, 0: ""}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(
        "test_check_dict has key `b` with value `3`, which is not correct"
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_incorrect_values3(mock_file, mock_add_feedback) -> None:
    """Test when a value in the student dict does not match the reference dict."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 5, "c": 3}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(
        "test_check_dict has key `b` with value `5`, which is not correct"
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_with_different_none_values(mock_file, mock_add_feedback) -> None:
    """Test when one dictionary has None, and the other has a value for the same key."""
    ref_dict = {"a": None, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 2, "c": None}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(
        "test_check_dict has key `a` with type `int`, which is not the right type"
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_nested_dicts_mismatch(mock_file, mock_add_feedback) -> None:
    """Test when nested dictionaries have different values."""
    ref_dict = {"a": 1, "b": {"nested_key": 10}, "c": 3}
    student_dict = {"a": 1, "b": {"nested_key": 20}, "c": 3}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(
        "test_check_dict has key `b` with value `{'nested_key': 20}`, which is not correct"
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_large_dicts_mismatch(mock_file, mock_add_feedback) -> None:
    """Test large dictionaries with a slight mismatch in one value."""
    ref_dict = {f"key_{i}": i for i in range(1000)}
    student_dict = {f"key_{i}": i for i in range(1000)}
    student_dict["key_500"] = 999  # mismatch
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(
        "test_check_dict has key `key_500` with value `999`, which is not correct"
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_extra_key(mock_file, mock_add_feedback) -> None:
    """Test when student dict has an extra key."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 2, "c": 3, "d": 4}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(f"{NAME} has extra keys: `d`")


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_missing_key(mock_file, mock_add_feedback) -> None:
    """Test when student dict is missing a key."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 2}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(f"{NAME} has missing keys: `c`")


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_student_empty_ref_not(mock_file, mock_add_feedback) -> None:
    """Test when the student dictionary is empty but the reference is not."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(f"{NAME} has missing keys: `a, b, c`")


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_ref_empty_student_not(mock_file, mock_add_feedback) -> None:
    """Test when the reference dictionary is empty but the student dictionary is not."""
    ref_dict = {}
    student_dict = {"a": 1, "b": 2, "c": 3}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(f"{NAME} has extra keys: `a, b, c`")


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_only_keys_correct(mock_file, mock_add_feedback) -> None:
    """Test when partial keys are correct."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 2, "c": 3, "d": 4}
    assert Feedback.check_dict(NAME, ref_dict, student_dict, only_keys=["a", "b"])
    mock_add_feedback.assert_not_called()


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_only_keys_missing(mock_file, mock_add_feedback) -> None:
    """Test when a partial key is missing."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "c": 3, "d": 4}
    only_keys = ["a", "b"]
    assert not Feedback.check_dict(NAME, ref_dict, student_dict, only_keys=only_keys)
    mock_add_feedback.assert_called_with(f"{NAME} has missing keys: `b`")


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_with_partial_key_matching(mock_file, mock_add_feedback) -> None:
    """Test when only some keys match between reference and student dictionaries."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "d": 4}
    only_keys = ["d"]
    with pytest.raises(
        ValueError,
        match=re.escape(
            r"only_keys must be a subset of the reference dict keys. Got only_keys=['d'] but ref.keys=['a', 'b', 'c']"
        ),
    ):
        Feedback.check_dict(NAME, ref_dict, student_dict, only_keys=only_keys)


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_with_partial_key_missing(mock_file, mock_add_feedback) -> None:
    """Test when only some keys match between reference and student dictionaries."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 20, "d": 4}
    only_keys = ["a", "b", "c"]
    assert not Feedback.check_dict(NAME, ref_dict, student_dict, only_keys=only_keys)
    mock_add_feedback.assert_called_with(f"{NAME} has missing keys: `c`")


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_wrong_value_type(mock_file, mock_add_feedback) -> None:
    """Test when values are of the wrong type."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": "2", "c": 3}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(
        "test_check_dict has key `b` with type `str`, which is not the right type"
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_with_type_mismatch(mock_file, mock_add_feedback) -> None:
    """Test dictionaries where values have different types."""
    ref_dict = {"a": 1, "b": "string", "c": [1, 2, 3]}
    student_dict = {
        "a": 1,
        "b": 100,
        "c": ["1", "2", "3"],
    }  # Key 'c' still has the value of type
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(
        "test_check_dict has key `b` with type `int`, which is not the right type"
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_wrong_value_type1_only_values(
    mock_file, mock_add_feedback: Mock
) -> None:
    """
    This will pass the type check on the values.
    but will fail at the check_values because values are different among both the dicts
    Error Expected: extra_value
    """
    ref_dict = {"a": 1, "b": "string", "c": [1, 2, 3]}
    student_dict = {"a": 1, "b": 100, "c": 43}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(
        "test_check_dict has key `b` with type `int`, which is not the right type"
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_none_data(mock_file, mock_add_feedback) -> None:
    """Test when student dict is None."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = None
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)  # type: ignore
    mock_add_feedback.assert_called_with(f"{NAME} is not a dict, got None")


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_not_a_dict(mock_file, mock_add_feedback) -> None:
    """Test when student input is not a dict."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = [("a", 1), ("b", 2), ("c", 3)]
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)  # type: ignore
    mock_add_feedback.assert_called_with(f"{NAME} is not a dict, got list")
