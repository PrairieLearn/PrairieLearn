# lol
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../lib')))

import prairielearn as pl  # noqa: E402
import lxml.html           # noqa: E402
import pytest
from typing import Callable, Dict, Any
import math

def test_inner_html():
    e = lxml.html.fragment_fromstring('<div>test</div>')
    assert pl.inner_html(e) == 'test'

    e = lxml.html.fragment_fromstring('<div>test&gt;test</div>')
    assert pl.inner_html(e) == 'test&gt;test'


@pytest.mark.parametrize(
    "weight_set_function, score_1, score_2, score_3, expected_score",
    [
     # Check set weighted score data
     (pl.set_weighted_score_data, 0., 0.0, 0., 0.),
     (pl.set_weighted_score_data, 0., 0.5, 0., 2. / 7.),
     (pl.set_weighted_score_data, 0., 0.75, 1., 4. / 7.),
     (pl.set_weighted_score_data, 0.5, 0.75, 1., 5. / 7.),
     (pl.set_weighted_score_data, 1., 1., 1., 1.),
     # Check all or nothing weighted score data
     (pl.set_all_or_nothing_score_data, 0., 0., 0., 0.),
     (pl.set_all_or_nothing_score_data, 0.5, 0., 1, 0.),
     (pl.set_all_or_nothing_score_data, 0.5, 0.75, 1., 0.),
     (pl.set_all_or_nothing_score_data, 1., 1., 1., 1.),
    ]
)
def test_set_score_data(weight_set_function: Callable[[Dict[str, Any]], None],
                          score_1: float,
                          score_2: float,
                          score_3: float,
                          expected_score: float) -> None:

    def prepare_partial_score_dict(score: float, weight: int) -> Dict[str, Any]:
        return {'score': score, 'weight': weight}

    data: Dict[str, Any] = dict()
    data['partial_scores'] = {
        'p1': prepare_partial_score_dict(score_1, 2),
        'p2': prepare_partial_score_dict(score_2, 4),
        'p3': prepare_partial_score_dict(score_3, 1)
    }

    # Assert equality
    weight_set_function(data)
    assert math.isclose(data['score'], expected_score)
