# ruff: noqa: ARG001 ANN001
# pyright: reportUnknownParameterType=none, reportMissingParameterType=none
from typing import Any
from unittest.mock import mock_open, patch

import pytest
from code_feedback import Feedback

"""
Testing Feedback.check_dict(name, ref, data) with all possible parameters

Checks that a student dict (`data`) has all correct key-value mappings with respect to a reference dict (`ref`).
It also verifies the length of keys in the student dictionary against the reference dictionary, and optionally,
enforces homogeneous data types for keys (using `key_type`), values (using `value_type`), or both.
Additionally, it can verify the presence of specific keys (using `partial_keys`) in the student dictionary, and
can focus the comparison solely on keys (using `check_keys`), values (using `check_values`), or both.
"""


class ErrorCodes:
    def __init__(self, name: str) -> None:
        self.name = name
        self.ERROR_CODES = {
            "name_not_defined",
            "not_valid_dict",
            "missing_partial_key",
            "keys_length_mismatch",
            "value_type_error",
            "key_type_error",
            "extraKey",
            "values_length_mismatch",
            "extra_value",
            "incorrect_dicts",
        }

    def __repr__(self) -> str:
        cls = self.__class__.__name__
        return f"{cls}({self.name}) is a test object to test Feedback.check_dict()\nUseful {cls} Methods: {self.ERROR_CODES}"

    def name_not_defined(self) -> str:
        """return bad(f"{name} is None or not defined")"""
        return f"{self.name} is None or not defined"

    def not_valid_dict(self) -> str:
        """return bad(f"{name} is not a dict")"""
        return f"{self.name} is not a dict"

    def missing_partial_key(
        self, student_dict: dict[Any, Any], partial_keys: list[Any]
    ) -> str | None:
        for partial_key in partial_keys:
            if partial_key not in student_dict:
                return f"{self.name} does not contain key {partial_key}"
        return None

    def keys_length_mismatch(self, ref: dict[Any, Any], data: dict[Any, Any]) -> str:
        """return bad(f"{name} has the wrong number of entries: expected {len(ref)}, got {len(data)}")"""
        return f"{self.name} has the wrong number of entries: expected {len(ref)}, got {len(data)}"

    def value_type_error(
        self, student_dict: dict[Any, Any], value_type: type
    ) -> str | None:
        """return bad(f"{name} has the wrong type for value {value}")"""
        for value in student_dict.values():
            if not isinstance(value, value_type):
                return f"{self.name} has the wrong type for value {value}, expected type {value_type}"
        return None

    def key_type_error(
        self, student_dict: dict[Any, Any], key_type: type
    ) -> str | None:
        """return bad(f"{name} has the wrong type for key {key}")"""
        for key in student_dict:
            if not isinstance(key, key_type):
                return f"{self.name} has the wrong type for key {key}, expected type {key_type}"
        return None

    def values_length_mismatch(self, ref: dict[Any, Any], data: dict[Any, Any]) -> str:
        """return f"{name} has the wrong number of values: expected {len(ref.values())}, got {len(data.values())}" """
        return f"{self.name} has the wrong number of values: expected {len(ref.values())}, got {len(data.values())}"

    def extra_value(self, ref: dict[Any, Any], data: dict[Any, Any]) -> str | None:
        """return bad(f"{name} contains an extra value: {value}")"""
        for value in data.values():
            if value not in ref.values():
                return f"{self.name} contains an extra value: {value}"
        return None

    def incorrect_dicts(self) -> str:
        """return bad(f"{name} has one or more key-value pairs that do not match")"""
        return f"{self.name} has one or more key-value pairs that do not match"


NAME = "test_check_dict"
error_codes = ErrorCodes(NAME)


@pytest.fixture(autouse=True)
def setup_feedback() -> None:
    Feedback.set_name(NAME)
    Feedback.buffer = ""


# TESTs: ALL CORRECT KEY-VALUES PAIRS #####
# Expecting No Error Message


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
    assert Feedback.check_dict(
        NAME, ref_dict, student_dict, check_keys=True, check_values=True
    )
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


# LARGE KEYS and VALUES
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_large_dicts(mock_file, mock_add_feedback) -> None:
    """Test large dictionaries with many keys and values."""
    ref_dict = {f"key_{i}": i for i in range(1000)}
    student_dict = {f"key_{i}": i for i in range(1000)}
    assert Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_not_called()


# TESTs: MISMATCH KEYS AND VALUES #####
# Expecting ErrorCode: incorrect_dicts


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_mismatched_keys1(mock_file, mock_add_feedback) -> None:
    """Test when the keys in the student dictionary do not match the reference dictionary at all."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"x": 4, "y": 5, "z": 6}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(error_codes.incorrect_dicts())


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_mismatched_keys2(mock_file, mock_add_feedback) -> None:
    """Test when the keys in the student dictionary do not match the reference dictionary at all."""
    ref_dict = {"a": 1, 2: "a", 3: "c"}
    student_dict = {"x": 4, "y": 5, "z": 6}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(error_codes.incorrect_dicts())


# TESTs: INCORRECT KEYS, BUT SAME VALUES #####
# Expecting ErrorCode: incorrect_dicts


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_incorrect_keys(mock_file, mock_add_feedback) -> None:
    """Test for incorrect keys, but same values in ref_dict, and student_dict"""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"d": 1, "b": 2, "f": 3}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(error_codes.incorrect_dicts())


# TESTs: INCORRECT VALUES, BUT SAME KEYS #####
# Expecting ErrorCode: incorrect_dicts


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_incorrect_values1(mock_file, mock_add_feedback) -> None:
    """Test for incorrect values, but same keys in ref_dict, and student_dict."""
    ref_dict = {"a": 1, "b": 2, "c": 3, "list": []}
    student_dict = {"a": 1, "b": 2, "c": 3, "list": ()}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(error_codes.incorrect_dicts())


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_incorrect_values2(mock_file, mock_add_feedback) -> None:
    """Test for incorrect values, but same keys in ref_dict, and student_dict."""
    ref_dict = {"a": 1, "b": 2, "c": 3, 0: "c"}
    student_dict = {"a": 1, "b": 3, "c": 2, 0: ""}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(error_codes.incorrect_dicts())


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_incorrect_values3(mock_file, mock_add_feedback) -> None:
    """Test when a value in the student dict does not match the reference dict."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 5, "c": 3}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(error_codes.incorrect_dicts())


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_with_different_none_values(mock_file, mock_add_feedback) -> None:
    """Test when one dictionary has None, and the other has a value for the same key."""
    ref_dict = {"a": None, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 2, "c": None}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(error_codes.incorrect_dicts())


# NESTED DICTS, Same Keys, incorrect values
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_nested_dicts_mismatch(mock_file, mock_add_feedback) -> None:
    """Test when nested dictionaries have different values."""
    ref_dict = {"a": 1, "b": {"nested_key": 10}, "c": 3}
    student_dict = {"a": 1, "b": {"nested_key": 20}, "c": 3}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(error_codes.incorrect_dicts())


# Large keys and values
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_large_dicts_mismatch(mock_file, mock_add_feedback) -> None:
    """Test large dictionaries with a slight mismatch in one value."""
    ref_dict = {f"key_{i}": i for i in range(1000)}
    student_dict = {f"key_{i}": i for i in range(1000)}
    student_dict["key_500"] = 999  # mismatch
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(error_codes.incorrect_dicts())


# TESTs: Dicts (keys) of different lengths #####
# Expecting ErrorCode: keys_length_mismatch


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_extra_key(mock_file, mock_add_feedback) -> None:
    """Test when student dict has an extra key."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 2, "c": 3, "d": 4}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(
        error_codes.keys_length_mismatch(ref_dict, student_dict)
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_missing_key(mock_file, mock_add_feedback) -> None:
    """Test when student dict is missing a key."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 2}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(
        error_codes.keys_length_mismatch(ref_dict, student_dict)
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_student_empty_ref_not(mock_file, mock_add_feedback) -> None:
    """Test when the student dictionary is empty but the reference is not."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(
        error_codes.keys_length_mismatch(ref_dict, student_dict)
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_ref_empty_student_not(mock_file, mock_add_feedback) -> None:
    """Test when the reference dictionary is empty but the student dictionary is not."""
    ref_dict = {}
    student_dict = {"a": 1, "b": 2, "c": 3}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)
    mock_add_feedback.assert_called_with(
        error_codes.keys_length_mismatch(ref_dict, student_dict)
    )


# TESTs: PARTIAL KEYS #####
# Expecting ErrorCode: None (if all partial keys present ref_dict) || missing_partial_key (otherwise)


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_partial_keys_correct(mock_file, mock_add_feedback) -> None:
    """Test when partial keys are correct."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 2, "c": 3, "d": 4}
    assert Feedback.check_dict(NAME, ref_dict, student_dict, partial_keys=["a", "b"])
    mock_add_feedback.assert_not_called()


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_partial_keys_missing(mock_file, mock_add_feedback) -> None:
    """Test when a partial key is missing."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "c": 3, "d": 4}
    partial_keys = ["a", "b"]
    assert not Feedback.check_dict(
        NAME, ref_dict, student_dict, partial_keys=partial_keys
    )
    mock_add_feedback.assert_called_with(
        error_codes.missing_partial_key(student_dict, partial_keys)
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_with_partial_key_matching(mock_file, mock_add_feedback) -> None:
    """Test when only some keys match between reference and student dictionaries."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "d": 4}
    partial_keys = ["d"]
    assert Feedback.check_dict(NAME, ref_dict, student_dict, partial_keys=partial_keys)
    mock_add_feedback.assert_not_called()


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_with_partial_key_missing(mock_file, mock_add_feedback) -> None:
    """Test when only some keys match between reference and student dictionaries."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": 20, "d": 4}
    partial_keys = ["a", "b", "c"]
    assert not Feedback.check_dict(
        NAME, ref_dict, student_dict, partial_keys=partial_keys
    )
    mock_add_feedback.assert_called_with(
        error_codes.missing_partial_key(student_dict, partial_keys)
    )


# TESTs: CHECK ONLY KEYS #####
# Expecting ErrorCode:


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_check_keys(mock_file, mock_add_feedback) -> None:
    """Test when only keys are compared and they match."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 10, "b": 20, "c": 30}
    assert Feedback.check_dict(NAME, ref_dict, student_dict, check_keys=True)
    mock_add_feedback.assert_not_called()


# TESTs: CHECK ONLY VALUES #####
# Expecting ErrorCode:


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_check_values(mock_file, mock_add_feedback) -> None:
    """Test when only values are compared and they match."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"x": 1, "y": 2, "z": 3}
    assert Feedback.check_dict("test_dict", ref_dict, student_dict, check_values=True)
    mock_add_feedback.assert_not_called()


# TESTs: CHECK ONLY KEY TYPES  #####
# Expecting ErrorCode: key_type_error


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_wrong_key_type(mock_file, mock_add_feedback) -> None:
    """Test when keys are of the wrong type."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {1: 1, "b": 2, "c": 3}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict, key_type=str)
    mock_add_feedback.assert_called_with(
        error_codes.key_type_error(student_dict, key_type=str)
    )


# key_type_error
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_wrong_key_type1(mock_file, mock_add_feedback) -> None:
    """Test when only keys are compared and they match."""
    ref_dict = {"1": 1, "2": 2, "3": 3}
    student_dict = {1: 10, 2: 20, 3: 30}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict, key_type=str)
    mock_add_feedback.assert_called_with(
        error_codes.key_type_error(student_dict, key_type=str)
    )


# key_type_error
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_wrong_key_type1_only_keys(mock_file, mock_add_feedback) -> None:
    """Test when only keys are compared and they match."""
    ref_dict = {"1": 1, "2": 2, "3": 3}
    student_dict = {1: 10, 2: 20, 3: 30}
    assert not Feedback.check_dict(
        NAME, ref_dict, student_dict, check_keys=True, key_type=str
    )
    mock_add_feedback.assert_called_with(
        error_codes.key_type_error(student_dict, key_type=str)
    )


# KeyTypeCheck, CheckOnlyValues
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_wrong_key_type1_only_values_extra(
    mock_file, mock_add_feedback
) -> None:
    """Test when only values are compared and they match."""
    ref_dict = {"1": 1, "2": 2, "3": 3}
    student_dict = {1: 10, 2: 20, 3: 30}
    assert not Feedback.check_dict(
        NAME, ref_dict, student_dict, check_values=True, key_type=int
    )
    mock_add_feedback.assert_called_with(
        error_codes.extra_value(ref_dict, student_dict)
    )


# KeyTypeCheck, CheckOnlyValues - value length mismatch
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_wrong_key_type1_only_values_length(
    mock_file, mock_add_feedback
) -> None:
    """Test when only keys are compared and they match."""
    ref_dict = {"1": 1, "2": 2, "3": 3, "4": 4}
    student_dict = {1: 10, 2: 20, 3: 30}
    assert not Feedback.check_dict(
        NAME, ref_dict, student_dict, check_values=True, key_type=int
    )
    mock_add_feedback.assert_called_with(
        error_codes.values_length_mismatch(ref_dict, student_dict)
    )


# KeyTypeCheck, CheckOnlyKeys, CheckOnlyValues - value length mismatch
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_wrong_key_type1_only_values_only_keys(
    mock_file, mock_add_feedback
) -> None:
    """Test when only keys are compared and they match."""
    ref_dict = {"1": 1, "2": 2, "3": 3, "4": 4}
    student_dict = {1: 10, 2: 20, 3: 30}
    assert not Feedback.check_dict(
        NAME,
        ref_dict,
        student_dict,
        check_keys=True,
        check_values=True,
        key_type=int,
    )
    mock_add_feedback.assert_called_with(
        error_codes.values_length_mismatch(ref_dict, student_dict)
    )


# key_type_error
@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_check_keys2(mock_file, mock_add_feedback) -> None:
    """Test when only keys are compared and they match."""
    ref_dict = {"1": 1, "2": 2, 3: 3}
    student_dict = {"1": 1, "2": 2, 3: 3}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict, key_type=str)
    mock_add_feedback.assert_called_with(
        error_codes.key_type_error(student_dict, key_type=str)
    )


# TESTs: CHECK ONLY VALUE TYPES  #####
# Expecting ErrorCode:


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_wrong_value_type(mock_file, mock_add_feedback) -> None:
    """Test when values are of the wrong type."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = {"a": 1, "b": "2", "c": 3}
    assert not Feedback.check_dict(NAME, ref_dict, student_dict, value_type=int)
    mock_add_feedback.assert_called_with(
        error_codes.value_type_error(student_dict, value_type=int)
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
    assert not Feedback.check_dict(NAME, ref_dict, student_dict, value_type=int)
    mock_add_feedback.assert_called_with(
        error_codes.value_type_error(student_dict, value_type=int)
    )


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_wrong_value_type1_only_values(mock_file, mock_add_feedback) -> None:
    """
    This will pass the type check on the values.
    but will fail at the check_values because values are different among both the dicts
    Error Expected: extra_value
    """
    ref_dict = {"a": 1, "b": "string", "c": [1, 2, 3]}
    student_dict = {"a": 1, "b": 100, "c": 43}
    assert not Feedback.check_dict(
        NAME, ref_dict, student_dict, check_values=True, value_type=int
    )
    mock_add_feedback.assert_called_with(
        error_codes.extra_value(ref_dict, student_dict)
    )


# TESTs: student_dict is NONE or UN-DEFINED  #####
# Expecting ErrorCode: name_not_defined


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_none_data(mock_file, mock_add_feedback) -> None:
    """Test when student dict is None."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = None
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)  # type: ignore
    mock_add_feedback.assert_called_with(error_codes.name_not_defined())


# TESTs: student_dict is NOT VALID DICT  #####
# Expecting ErrorCode:


@patch("code_feedback.Feedback.add_feedback")
@patch("builtins.open", new_callable=mock_open)
def test_check_dict_not_a_dict(mock_file, mock_add_feedback) -> None:
    """Test when student input is not a dict."""
    ref_dict = {"a": 1, "b": 2, "c": 3}
    student_dict = [("a", 1), ("b", 2), ("c", 3)]
    assert not Feedback.check_dict(NAME, ref_dict, student_dict)  # type: ignore
    mock_add_feedback.assert_called_with(error_codes.not_valid_dict())
