# An example wrapper script that takes existing autograder output
# and converts it to a format readable by the grading machine

import student.autograder as ag
import os
import json


def main(job_id):
    # Call the autograder, we expect it to write to results.txt
    ag.main()

    # Start generating the grading results json
    grading_result = {'job_id': job_id}

    # Read all the lines from results.txt as a array and store in the grading_result
    file = open('results.txt', 'r')
    lines = file.readlines()
    grading_result['output'] = file.read()

    earned_points = 0
    total_points = 0

    if len(lines) > 1 and (len(lines)) % 4 == 0:
        # Tests ran successfully
        grading_result['testedCompleted'] = 'true'
        tests = []

        # Traverse through all the lines, storing the results
        # Autograder's test output are in the format: name, points scored, max points, message
        line_num = 0
        for i in range(0, int(len(lines) / 4)):
            test = {}
            test['name'] = lines[line_num][:-1]
            test['id'] = i
            test['point'] = lines[line_num + 1][:-1]
            earned_points += int(lines[line_num + 1][:-1])
            test['maxPoints'] = lines[line_num + 2][:-1]
            total_points += int(lines[line_num + 2][:-1])
            test['output'] = lines[line_num + 3][:-1]
            test['message'] = ''
            line_num += 4
            tests.append(test)

        # Add the tests to the grading result
        grading_result['tests'] = tests

        print("earned_points: ", earned_points);
        print("total_points: ", total_points);
        grading_result['score'] = float(earned_points) / float(total_points)

    elif len(lines) == 1:
        # Compiler error in autograder
        grading_result['testedCompleted'] = 'false'

    else:
        # No tests ran or something bad happened
        grading_result['testedCompleted'] = 'false'

    # Remove the results file
    # os.remove('results.txt')

    # Write the grading results to a file
    with open('/grade/results.json', 'w') as f:
        json.dump(grading_result, f)

if __name__ == '__main__':
    # Pass in a dummy job id
    main(49)
