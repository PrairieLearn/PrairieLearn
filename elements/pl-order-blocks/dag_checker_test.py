import pytest
from dag_checker import dag_to_nx, grade_dag, lcs_partial_credit, solve_dag

problem_1_dag = {
    "1": [],
    "2": ["1"],
    "3": ["1"],
    "4": ["2", "3"],
    "5": ["1"],
    "6": ["2"],
    "7": ["4", "5", "6"],
    "8": [],
    "9": ["7", "8"],
    "10": ["9"],
}
problem_1_groups = {str(i): None for i in range(1, 11)}
problem_1_submissions = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    ["8", "1", "3", "2", "6", "4", "5", "7", "9", "10"],
    ["1", "2", "3", "4", "5", "6", "7", "9", "8", "10"],
    ["1", "2", "6", "3", "4", "5"],
]
problem_1_expected = [
    10,
    10,
    7,
    6,
]
problem_1_expected_ed = [
    0,
    0,
    2,
    4,
]

problem_2_dag = {
    "1": [],
    "2": ["1"],
    "3": ["2"],
    "4": [],
    "5": ["4"],
    "6": ["5"],
    "7": ["g1", "g2"],
    "g1": [],
    "g2": [],
}
problem_2_groups = {
    "1": "g1",
    "2": "g1",
    "3": "g1",
    "4": "g2",
    "5": "g2",
    "6": "g2",
    "7": None,
}
problem_2_submissions = [
    ["1", "2", "3", "4", "5", "6", "7"],
    ["4", "5", "6", "1", "2", "3", "7"],
    ["4", "5", "6", "1", "2", "7"],
    ["1", "2", "4", "3", "5", "6", "7"],
    ["1", "2", "3", "7"],
    ["1", "5", "6", "2", "3"],
    ["1", "6", "5", "2", "3"],
    ["2", None, "3"],
]
problem_2_expected = [7, 7, 5, 2, 3, 1, 1, 0]
problem_2_expected_ed_groups = [0, 0, 1, 2, 3, 4, 6, 6]
problem_2_dag_no_groups = {
    "1": [],
    "2": ["1"],
    "3": ["2"],
    "4": [],
    "5": ["4"],
    "6": ["5"],
    "7": ["3", "6"],
}
problem_2_expected_ed_no_groups = [0, 0, 1, 0, 3, 2, 4, 6]


def test_grade_dag():
    for submission, expected, expected_ed in zip(
        problem_1_submissions, problem_1_expected, problem_1_expected_ed
    ):
        assert grade_dag(submission, problem_1_dag, problem_1_groups) == (expected, 10)
        assert lcs_partial_credit(submission, problem_1_dag, {}) == expected_ed

    for submission, expected, expected_ed_no_groups, expected_ed_groups in zip(
        problem_2_submissions,
        problem_2_expected,
        problem_2_expected_ed_no_groups,
        problem_2_expected_ed_groups,
    ):
        assert grade_dag(submission, problem_2_dag, problem_2_groups) == (expected, 7)
        assert (
            lcs_partial_credit(submission, problem_2_dag_no_groups, {})
            == expected_ed_no_groups
        )
        assert (
            lcs_partial_credit(submission, problem_2_dag, problem_2_groups)
            == expected_ed_groups
        )


problem_3_invalid_dag_1 = {
    "1": [],
    "2": ["1"],
    "3": ["2"],
    "4": ["1"],
    "5": ["4"],
    "6": ["g1", "g2"],
}
problem_3_invalid_dag_2 = {
    "1": [],
    "2": [],
    "3": ["2"],
    "4": [],
    "5": ["4"],
    "6": ["3", "5"],
}
problem_3_invalid_dag_3 = {
    "1": [],
    "2": [],
    "3": ["2"],
    "4": [],
    "5": ["4", "g1"],
    "6": ["g1", "g2"],
}
problem_3_dag = {
    "1": [],
    "2": [],
    "3": ["2"],
    "4": [],
    "5": ["4"],
    "6": ["g1", "g2"],
    "g1": [],
    "g2": [],
}
problem_3_groups = {"1": None, "2": "g1", "3": "g1", "4": "g2", "5": "g2", "6": None}


def test_problem_validation():
    dag_to_nx(problem_1_dag, problem_1_groups)
    dag_to_nx(problem_2_dag, problem_2_groups)
    with pytest.raises(Exception):
        dag_to_nx(problem_3_invalid_dag_1, problem_3_groups)
    with pytest.raises(Exception):
        dag_to_nx(problem_3_invalid_dag_2, problem_3_groups)
    with pytest.raises(Exception):
        dag_to_nx(problem_3_invalid_dag_3, problem_3_groups)
    dag_to_nx(problem_3_dag, problem_3_groups)


def test_solve_dag():
    problems = [
        (problem_1_dag, problem_1_groups),
        (problem_2_dag, problem_2_groups),
        (problem_3_dag, problem_3_groups),
    ]
    for depends_graph, group_belonging in problems:
        solution = solve_dag(depends_graph, group_belonging)
        assert len(solution) == grade_dag(solution, depends_graph, group_belonging)[0]
