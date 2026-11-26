import pytest
from pytest_prairielearn_grader.assertions import assert_fn_equal
from pytest_prairielearn_grader.fixture import (
    DataFixture,
    StudentFixture,
)


@pytest.mark.grading_data(name="Test expected inputs", points=4)
def test_input(
    sandbox: StudentFixture, data_json: DataFixture, subtests: pytest.Subtests
) -> None:
    params = data_json["params"]
    function_name = params["function_name"]

    for pair in params["pairs"]:
        with subtests.test():
            assert_fn_equal(
                sandbox,
                function_name,
                args=(pair["input"],),
                expected=pair["output"],
                description=f'{function_name}("{pair["input"]}")',
            )


@pytest.mark.grading_data(name="Test default output", points=1)
def test_default_output(sandbox: StudentFixture, data_json: DataFixture) -> None:
    params = data_json["params"]
    function_name = params["function_name"]
    func_input = params["invalid_input"]
    expected_output = params["default_output"]

    assert_fn_equal(
        sandbox,
        function_name,
        args=(func_input,),
        expected=expected_output,
        description=f'{function_name}("{func_input}")',
    )
