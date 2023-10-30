import numpy as np
import pandas as pd
import pytest
from prairielearn import QuestionData


@pytest.fixture
def city_dataframe() -> pd.DataFrame:
    x = [
        {
            "city": "Champaign",
            "job": "Professor",
            "age": 35,
            "time": pd.to_datetime("2022-10-06 12:00"),
        },
        {
            "city": "Sunnyvale",
            "job": "Driver",
            "age": 20,
            "time": pd.to_datetime("2020-05-09 12:00"),
        },
        {
            "city": "Mountain View",
            "job": "Data Scientist",
            "age": np.nan,
            "time": pd.to_datetime("2021-12-14 12:00"),
        },
    ]
    return pd.DataFrame(x)


@pytest.fixture
def breast_cancer_dataframe() -> pd.DataFrame:
    pd_dict = {
        0: {0: 842302, 1: 842517, 2: 84300903, 3: 84348301, 4: 84358402},
        1: {0: "M", 1: "M", 2: "M", 3: "M", 4: "M"},
        2: {0: 17.99, 1: 20.57, 2: 19.69, 3: 11.42, 4: 20.29},
        3: {0: 10.38, 1: 17.77, 2: 21.25, 3: 20.38, 4: 14.34},
        4: {0: 122.8, 1: 132.9, 2: 130.0, 3: 77.58, 4: 135.1},
        5: {0: 1001.0, 1: 1326.0, 2: 1203.0, 3: 386.1, 4: 1297.0},
        6: {0: 0.1184, 1: 0.08474, 2: 0.1096, 3: 0.1425, 4: 0.1003},
        7: {0: 0.2776, 1: 0.07864, 2: 0.1599, 3: 0.2839, 4: 0.1328},
        8: {0: 0.3001, 1: 0.0869, 2: 0.1974, 3: 0.2414, 4: 0.198},
        9: {0: 0.1471, 1: 0.07017, 2: 0.1279, 3: 0.1052, 4: 0.1043},
        10: {0: 0.2419, 1: 0.1812, 2: 0.2069, 3: 0.2597, 4: 0.1809},
        11: {0: 0.07871, 1: 0.05667, 2: 0.05999, 3: 0.09744, 4: 0.05883},
        12: {0: 1.095, 1: 0.5435, 2: 0.7456, 3: 0.4956, 4: 0.7572},
        13: {0: 0.9053, 1: 0.7339, 2: 0.7869, 3: 1.156, 4: 0.7813},
        14: {0: 8.589, 1: 3.398, 2: 4.585, 3: 3.445, 4: 5.438},
        15: {0: 153.4, 1: 74.08, 2: 94.03, 3: 27.23, 4: 94.44},
        16: {0: 0.006399, 1: 0.005225, 2: 0.00615, 3: 0.00911, 4: 0.01149},
        17: {0: 0.04904, 1: 0.01308, 2: 0.04006, 3: 0.07458, 4: 0.02461},
        18: {0: 0.05373, 1: 0.0186, 2: 0.03832, 3: 0.05661, 4: 0.05688},
        19: {0: 0.01587, 1: 0.0134, 2: 0.02058, 3: 0.01867, 4: 0.01885},
        20: {0: 0.03003, 1: 0.01389, 2: 0.0225, 3: 0.05963, 4: 0.01756},
        21: {0: 0.006193, 1: 0.003532, 2: 0.004571, 3: 0.009208, 4: 0.005115},
        22: {0: 25.38, 1: 24.99, 2: 23.57, 3: 14.91, 4: 22.54},
        23: {0: 17.33, 1: 23.41, 2: 25.53, 3: 26.5, 4: 16.67},
        24: {0: 184.6, 1: 158.8, 2: 152.5, 3: 98.87, 4: 152.2},
        25: {0: 2019.0, 1: 1956.0, 2: 1709.0, 3: 567.7, 4: 1575.0},
        26: {0: 0.1622, 1: 0.1238, 2: 0.1444, 3: 0.2098, 4: 0.1374},
        27: {0: 0.6656, 1: 0.1866, 2: 0.4245, 3: 0.8663, 4: 0.205},
        28: {0: 0.7119, 1: 0.2416, 2: 0.4504, 3: 0.6869, 4: 0.4},
        29: {0: 0.2654, 1: 0.186, 2: 0.243, 3: 0.2575, 4: 0.1625},
        30: {0: 0.4601, 1: 0.275, 2: 0.3613, 3: 0.6638, 4: 0.2364},
        31: {0: 0.1189, 1: 0.08902, 2: 0.08758, 3: 0.173, 4: 0.07678},
    }

    return pd.DataFrame.from_dict(pd_dict)


@pytest.fixture
def r_types_dataframe() -> pd.DataFrame:
    return pd.DataFrame(
        {
            # Scalars
            "integer": 1,
            "numeric": 3.14,
            "logical": False,
            "character": "foo",
            # TODO adding in complex numbers won't deserialize correctly, fix this (somehow?)
            # "complex": complex(1, 2),
            # Series
            "numeric-list": pd.Series([1.0] * 3, dtype="float64"),
            "integer-list": pd.Series([1] * 3, dtype="int64"),
            # "complex-list": pd.Series(np.array([1, 2, 3]) + np.array([4, 5, 6]) *1j).astype("complex128"),
            "character-list": pd.Series(["hello", "world", "stat"]),
            "logical-list": pd.Series([True, False, True]),
            "character-string-list": pd.Series(["a", "b", "c"]),
            # Time Dependency: https://pandas.pydata.org/docs/user_guide/timeseries.html
            "POSIXct-POSIXt-timestamp": pd.Timestamp("2023-01-02T00:00:00.0000000"),
            "POSIXct-POSIXt-date_range": pd.date_range("2023", freq="D", periods=3),
        }
    )


@pytest.fixture
def question_data() -> QuestionData:
    return {
        "params": dict(),
        "correct_answers": dict(),
        "submitted_answers": dict(),
        "format_errors": dict(),
        "partial_scores": dict(),
        "score": 0.0,
        "feedback": dict(),
        "variant_seed": "",
        "options": dict(),
        "raw_submitted_answers": dict(),
        "editable": False,
        "panel": "question",
        "extensions": dict(),
        "num_valid_submissions": 0,
        "manual_grading": False,
        "answers_names": dict(),
    }
