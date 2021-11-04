import unittest
from dag_checker import grade_dag

problem_1_dag = {'1': [], '2': ['1'], '3': ['1'], '4': ['2', '3'], '5': ['1'], '6': ['2'], '7': ['4', '5', '6'], '8': [], '9': ['7', '8'], '10': ['9']}
problem_1_groups = {str(i): None for i in range(1, 11)}
problem_1_submissions = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    ['8', '1', '3', '2', '6', '4', '5', '7', '9', '10'],
    ['1', '2', '3', '4', '5', '6', '7', '9', '8', '10'],
    ['1', '2', '6', '3', '4', '5']
]
problem_1_expected = [
    (10, -1),
    (10, -1),
    (7, 7),
    (6, -1)
]


problem_2_dag = {'1': [], '2': ['1'], '3': ['2'], '4': [], '5': ['4'], '6': ['5'], '7': ['3', '6']}
problem_2_groups = {'1': 1, '2': 1, '3': 1, '4': 2, '5': 2, '6': 2, '7': None}
problem_2_submissions = [
    ['1', '2', '3', '4', '5', '6', '7'],
    ['4', '5', '6', '1', '2', '3', '7'],
    ['4', '5', '6', '1', '2', '7'],
    ['1', '2', '4', '3',  '5', '6', '7'],
    ['1', '2', '3', '7'],
]
problem_2_expected = [
    (7, -1),
    (7, -1),
    (5, 5),
    (2, 2),
    (3, 3),
]

class TestDAGChecker(unittest.TestCase):

    def test_grade_dag(self):
        for submission, expected in zip(problem_1_submissions, problem_1_expected):
            self.assertEqual(grade_dag(submission, problem_1_dag, problem_1_groups), expected)

        for submission, expected in zip(problem_2_submissions, problem_2_expected):
            self.assertEqual(grade_dag(submission, problem_2_dag, problem_2_groups), expected)


if __name__ == '__main__':
    unittest.main()