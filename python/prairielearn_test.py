# lol
import os
import sys

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../lib"))
)

import json
from typing import Any, Union, cast

import lxml.html  # noqa: E402
import numpy as np
import prairielearn as pl  # noqa: E402
import pytest


def test_inner_html() -> None:
    e = lxml.html.fragment_fromstring("<div>test</div>")
    assert pl.inner_html(e) == "test"

    e = lxml.html.fragment_fromstring("<div>test&gt;test</div>")
    assert pl.inner_html(e) == "test&gt;test"


@pytest.mark.parametrize(
    "numpy_object",
    [
        np.int64(5),
        np.int32(-12),
        np.uint8(55),
        np.float128(-1100204.04010340),
        np.float32(2.1100044587483),
        np.float16(0.00000184388328),
        np.int64((2**53)+5),
        np.arange(15),
        np.array([1.2, 3.5, 5.1]),
        np.array([1, 2, 3, 4]),
        np.array([(1.5, 2, 3), (4, 5, 6)]),
        np.array([[1, 2], [3, 4]], dtype=complex),
        np.ones((2, 3, 4), dtype=np.int16),
    ],
)
def test_numpy_serialization(numpy_object: Any) -> None:
    """Test equality after conversion of various numpy objects"""

    json_object = json.dumps(pl.to_json(numpy_object), allow_nan=False)

    assert np.array_equal(
        numpy_object, cast(Any, pl.from_json(json.loads(json_object)))
    )


@pytest.mark.parametrize(
    "non_numpy_object",
    [1, 1.45, 2.2, 10],
)
def test_non_numpy_serialization(non_numpy_object: Union[float, int]) -> None:
    """Test that normal integers / floats aren't serialized"""

    assert non_numpy_object == pl.to_json(non_numpy_object)
