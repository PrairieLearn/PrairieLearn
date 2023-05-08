import pytest
from check_data import check_data


def test_check_data_extra_props() -> None:
    with pytest.raises(ValueError, match="data contains extra keys: bad_key"):
        check_data(
            {"panel": "question"}, {"panel": "question", "bad_key": {}}, "render"
        )


def test_check_data_missing_props() -> None:
    with pytest.raises(ValueError, match="data is missing keys: panel"):
        check_data({"panel": "question"}, {}, "render")


def test_check_data_invalid_type() -> None:
    with pytest.raises(ValueError, match="Expected data.score to be a number"):
        check_data({"score": 1}, {"score": "string"}, "render")


def test_check_data_invalid_modification() -> None:
    with pytest.raises(ValueError, match="data.panel has been illegally modified"):
        check_data({"panel": "question"}, {"panel": "submission"}, "render")


def test_check_data_invalid_modification_nested() -> None:
    with pytest.raises(ValueError, match="data.params has been illegally modified"):
        check_data({"params": {"foo": "bar"}}, {"params": {"foo": "baz"}}, "test")
