import numpy as np
import pytest
from pytest_prairielearn_grader.assertions import assert_true
from pytest_prairielearn_grader.fixture import StudentFixture

pytestmark = pytest.mark.output(level="friendly")

sandbox_timeout = 15


@pytest.fixture
def expected_solution(data_json: dict) -> tuple[int, np.ndarray]:
    sw_to_acid = int(data_json["params"]["sw_to_acid"]) / 100
    sw_to_culture = int(data_json["params"]["sw_to_culture"]) / 100
    acid_to_co2 = int(data_json["params"]["acid_to_co2"]) / 100
    acid_to_culture = int(data_json["params"]["acid_to_culture"]) / 100
    co2_to_acid = int(data_json["params"]["co2_to_acid"]) / 100

    initial_sw = int(data_json["params"]["initial_sw"]) / 100
    initial_culture = int(data_json["params"]["initial_culture"]) / 100

    M = np.array([
        [
            1.0 - (sw_to_acid + sw_to_culture),
            sw_to_acid,
            0,
            sw_to_culture,
        ],  # Sugar water
        [
            0,
            1.0 - (acid_to_co2 + acid_to_culture),
            acid_to_co2,
            acid_to_culture,
        ],  # Acid
        [0, co2_to_acid, 1.0 - co2_to_acid, 0],  # CO2
        [0, 0, 0, 1],  # Culture
    ]).T

    composition = np.array([initial_sw, 0, 0, initial_culture])
    hours = 0

    percentage = data_json["params"]["percent_composition"] / 100

    while composition[0] > percentage:
        composition = M @ composition
        hours += 1
    return hours, composition


@pytest.mark.grading_data(name="hours", points=2)
def test_hours(
    sandbox: StudentFixture, expected_solution: tuple[int, np.ndarray]
) -> None:
    expected, _ = expected_solution
    value = sandbox.query("hours")
    assert_true(
        isinstance(value, (complex, float, int, np.number)),
        msg="'hours' is not a number",
    )
    assert_true(
        abs(expected - value) < abs(expected) * 1e-5 or abs(expected - value) < 1e-8,
        msg="'hours' is inaccurate",
    )


@pytest.mark.grading_data(name="composition", points=2)
def test_composition(
    sandbox: StudentFixture, expected_solution: tuple[int, np.ndarray]
) -> None:
    _, expected = expected_solution
    value = sandbox.query("composition")
    assert_true(isinstance(value, np.ndarray), msg="'composition' is not a numpy array")
    assert_true(
        value.shape == expected.shape,
        msg=f"'composition' does not have correct shape--got: '{value.shape}', expected: '{expected.shape}'",
    )
    assert_true(
        value.dtype.kind == expected.dtype.kind,
        msg=f"'composition' does not have correct data type--got: '{value.dtype}', expected: '{expected.dtype}'",
    )
    assert_true(
        np.allclose(expected, value, rtol=1e-5, atol=1e-8),
        msg="'composition' is inaccurate",
    )
