# lol
import sys
import os

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../lib"))
)

from typing import Any, cast
import prairielearn as pl  # noqa: E402
import lxml.html  # noqa: E402
import pandas as pd
import json
import pytest
import numpy as np
from pytest_lazyfixture import lazy_fixture


def test_inner_html() -> None:
    e = lxml.html.fragment_fromstring("<div>test</div>")
    assert pl.inner_html(e) == "test"

    e = lxml.html.fragment_fromstring("<div>test&gt;test</div>")
    assert pl.inner_html(e) == "test&gt;test"


@pytest.mark.parametrize(
    "df", lazy_fixture(["city_dataframe", "breast_cancer_dataframe"])
)
def test_encoding_pandas(df: pd.DataFrame) -> None:
    """Test that new json encoding works"""

    # Test encoding as json doesn't throw exceptions
    json_df = pl.to_json(df, df_encoding_version=2)
    json_str = json.dumps(json_df)

    assert type(json_str) == str

    # Deserialize and check equality
    loaded_str = json.loads(json_str)
    deserialized_df = cast(pd.DataFrame, pl.from_json(loaded_str))

    # Column types get erased, need to account for this in testing
    reference_df = df.copy()
    reference_df.columns = reference_df.columns.astype("string").astype("object")

    pd.testing.assert_frame_equal(deserialized_df, reference_df)


@pytest.mark.parametrize(
    "df", lazy_fixture(["city_dataframe", "breast_cancer_dataframe"])
)
def test_encoding_legacy(df: pd.DataFrame) -> None:
    """Add compatibility test for legacy encoding"""

    reserialized_dataframe = cast(pd.DataFrame, pl.from_json(pl.to_json(df)))

    pd.testing.assert_frame_equal(df, reserialized_dataframe)

@pytest.mark.parametrize(
    "numpy_object", [
        np.int64(5),
        np.int32(-12),
        np.uint8(55),
        np.float128(-1100204.04010340),
        np.float32(2.1100044587483),
        np.float16(0.00000184388328),
        np.arange(15),
        np.array([1.2, 3.5, 5.1, np.nan]),
        np.array([1, 2, 3, 4]),
        np.array([(1.5, 2, 3), (4, 5, 6)]),
        np.array([[1, 2], [3, 4]], dtype=complex),
        np.ones((2, 3, 4), dtype=np.int16)
    ]
)
def test_numpy_serialization(numpy_object: Any) -> None:
    """Test equality after conversion of various numpy objects"""

    json_object = json.dumps(pl.to_json(numpy_object))

    assert np.array_equal(numpy_object, pl.from_json(json.loads(json_object)), equal_nan=True)
