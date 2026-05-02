from typing import Required, TypedDict

import pytest
from mathjson import MathJsonExpression, MathJsonNumberObject
from validate import validate

type StringList = list[str]


class TotalFalseSchema(TypedDict, total=False):
    name: Required[str]
    description: str


def test_validate_supports_type_alias() -> None:
    assert validate(["a", "b"], StringList) == ["a", "b"]

    with pytest.raises(TypeError):
        validate(["a", 1], StringList)


def test_validate_supports_total_false_typed_dict() -> None:
    assert validate({"name": "Add"}, TotalFalseSchema) == {"name": "Add"}

    with pytest.raises(ValueError, match="missing required key: name"):
        validate({}, TotalFalseSchema)


def test_validate_supports_mathjson_type_aliases() -> None:
    assert validate({"num": "1"}, MathJsonNumberObject) == {"num": "1"}
    assert validate(["Add", "x", {"num": "1"}], MathJsonExpression) == (
        "Add",
        "x",
        {"num": "1"},
    )
    assert validate({"fn": ["Add", "x", 1]}, MathJsonExpression) == {
        "fn": ("Add", "x", 1)
    }


def test_validate_uses_generated_mathjson_function_arities() -> None:
    assert validate(["Sin", "x"], MathJsonExpression) == ("Sin", "x")
    assert validate(["Apply", "f"], MathJsonExpression) == ("Apply", "f")
    assert validate(["Random"], MathJsonExpression) == ("Random",)
    assert validate(["Random", 1, 2], MathJsonExpression) == ("Random", 1, 2)

    with pytest.raises(TypeError):
        validate(["Sin"], MathJsonExpression)

    with pytest.raises(TypeError):
        validate(["Add"], MathJsonExpression)

    with pytest.raises(TypeError):
        validate(["NoSuchFunction", "x"], MathJsonExpression)


def test_validate_rejects_invalid_mathjson_expression() -> None:
    with pytest.raises(TypeError):
        validate(["Add", object()], MathJsonExpression)
