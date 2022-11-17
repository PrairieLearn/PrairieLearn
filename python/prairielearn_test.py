# lol
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../lib')))

import prairielearn as pl  # noqa: E402
import lxml.html           # noqa: E402
import pytest
from typing import Dict, Optional, Any, Tuple


def test_inner_html():
    e = lxml.html.fragment_fromstring('<div>test</div>')
    assert pl.inner_html(e) == 'test'

    e = lxml.html.fragment_fromstring('<div>test&gt;test</div>')
    assert pl.inner_html(e) == 'test&gt;test'


@pytest.mark.parametrize(
    "question_name, student_answer, feedback_field, weight, expected_grade",
    [('base', 'a', 'base', 1, True),
    ('base', 'a, b', 'base', 1, False),
    ('base', '', 'home', 2, False),
    ('home', 'b', 'base', 2, True),
    ('base', 'c', None, 3, True),
    ('base', '<>', None, 3, True),
    ('base', '><', None, 3, False)
    ]
)
def test_grade_question_parametrized_correct(question_name: str,
                                                student_answer: str,
                                                feedback_field: Optional[str],
                                                weight: int,
                                                expected_grade: bool) -> None:
    data: Dict[str, Dict[str, Any]] = dict()
    data['partial_scores'] = dict()
    data['submitted_answers'] = {question_name: student_answer}
    data['feedback'] = dict()
    good_feedback = ' you did good'
    bad_feedback = 'thats terrible'

    def grading_function(submitted_answer: str) -> Tuple[bool, Optional[str]]:
        if submitted_answer in {'a', 'b', 'c', 'd', '<>'}:
            return True, good_feedback
        return False, bad_feedback

    pl.grade_question_parameterized(data,
                                               question_name,
                                               grading_function,
                                               weight,
                                               feedback_field)

    if feedback_field is None:
        feedback_field = question_name

    expected_score = 1.0 if expected_grade else 0.0
    assert data['partial_scores'][question_name]['score'] == expected_score
    assert type(data['partial_scores'][question_name]['score']) == float
    assert data['partial_scores'][question_name]['weight'] == weight

    expected_feedback = good_feedback if expected_grade else bad_feedback

    assert data['feedback'][feedback_field] == expected_feedback
    assert data['partial_scores'][question_name]['feedback'] == expected_feedback

@pytest.mark.parametrize(
    "student_ans, should_raise",
    [('<evil javascript>', True),
     ('><', True),
     ('a < b', False),
     ('b > a', False)
    ]
)
def test_grade_question_parametrized_exception(student_ans: str,
                                                 should_raise: bool) -> None:
    question_name = 'name'

    data: Dict[str, Dict[str, Any]] = dict()
    data['partial_scores'] = dict()
    data['submitted_answers'] = {question_name: student_ans}
    data['feedback'] = dict()

    def grading_function(ans: str) -> Tuple[bool, Optional[str]]:
        return True, f"The answer {ans} is right"

    if should_raise:
        with pytest.raises(ValueError, match='input should not be present'):
            pl.grade_question_parameterized(data,
                                                      question_name,
                                                      grading_function)
    else:
        pl.grade_question_parameterized(data,
                                                  question_name,
                                                  grading_function)

        assert data['partial_scores'][question_name]['score'] == 1.0


def test_grade_question_parametrized_bad_grade_function() -> None:
    question_name = 'name'

    data: Dict[str, Dict[str, Any]] = dict()
    data['partial_scores'] = dict()
    data['submitted_answers'] = {question_name: 'True'}
    data['feedback'] = dict()

    def grading_function(ans: str):
        return 'True', f"The answer {ans} is right"

    with pytest.raises(AssertionError):
        pl.grade_question_parameterized(data,
                                                  question_name,
                                                  grading_function)

def test_grade_question_parametrized_key_error_blank() -> None:
    question_name = 'name'

    data: Dict[str, Dict[str, Any]] = dict()
    data['partial_scores'] = dict()
    data['submitted_answers'] = {question_name: 'True'}
    data['feedback'] = dict()

    def grading_function(ans: str) -> Tuple[bool, Optional[str]]:
        decoy_dict: Dict[str, str] = dict()
        decoy_dict['junk']  # This is to throw a key error
        return (True, None)

    with pytest.raises(KeyError):
        pl.grade_question_parameterized(data, question_name, grading_function)

    # Empty out submitted answers
    data['submitted_answers'] = dict()
    data['format_errors'] = dict()
    pl.grade_question_parameterized(data, question_name, grading_function)

    assert data['format_errors'][question_name] == 'No answer was submitted'
