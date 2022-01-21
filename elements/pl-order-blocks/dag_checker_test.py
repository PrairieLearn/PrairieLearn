from dag_checker import grade_dag, lcs_partial_credit

problem_1_dag = {'1': [], '2': ['1'], '3': ['1'], '4': ['2', '3'], '5': ['1'], '6': ['2'], '7': ['4', '5', '6'], '8': [], '9': ['7', '8'], '10': ['9']}
problem_1_groups = {str(i): None for i in range(1, 11)}
problem_1_submissions = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    ['8', '1', '3', '2', '6', '4', '5', '7', '9', '10'],
    ['1', '2', '3', '4', '5', '6', '7', '9', '8', '10'],
    ['1', '2', '6', '3', '4', '5']
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

problem_2_dag = {'1': [], '2': ['1'], '3': ['2'], '4': [], '5': ['4'], '6': ['5'], '7': ['3', '6']}
problem_2_groups = {'1': 1, '2': 1, '3': 1, '4': 2, '5': 2, '6': 2, '7': None}
problem_2_submissions = [
    ['1', '2', '3', '4', '5', '6', '7'],
    ['4', '5', '6', '1', '2', '3', '7'],
    ['4', '5', '6', '1', '2', '7'],
    ['1', '2', '4', '3', '5', '6', '7'],
    ['1', '2', '3', '7'],
]
problem_2_expected = [
    7,
    7,
    5,
    2,
    3,
]


def test_grade_dag():
    for submission, expected, expected_ed in zip(problem_1_submissions, problem_1_expected, problem_1_expected_ed):
        assert grade_dag(submission, problem_1_dag, problem_1_groups) == expected
        assert lcs_partial_credit(submission, problem_1_dag) == expected_ed

    for submission, expected in zip(problem_2_submissions, problem_2_expected):
        assert grade_dag(submission, problem_2_dag, problem_2_groups) == expected
