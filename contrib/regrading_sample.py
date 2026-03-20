#! /usr/bin/python3

# This is a sample script for regrading questions with updated grading scripts.
# It reads a CSV file obtained from PrairieLearn, updates the feedback for a
# specific question, and writes the updated data to a new CSV file. It receives
# two arguments: the input CSV file (corresponding to the
# "XYZ_submissions_for_manual_grading.csv" file obtained from PrairieLearn) and
# the output CSV file to be generated. The resulting CSV file can then be used
# to upload the new scores and feedback for each submission.

# ruff: noqa: F841
# pyright: reportUnusedVariable=false

import argparse
import csv
import json

OFFENDING_QID = "QID_OF_OFFENDING_QUESTION"  # TODO: replace with actual QID


def update_externally_graded_question(row: dict[str, str]) -> None:
    #######################################################################
    # If the question was externally graded, the information created by the
    # external grader in the original grading process is available in
    # `feedback["results"]`. In particular, the tests created by the
    # external grader are available in `feedback["results"]["tests"]`.
    # Depending on the updates in the grading process, it may be necessary
    # to update the information in these tests, such as the points awarded
    # for each test or the maximum points for each test. The following is an
    # example of how to update the points and maximum points for each test
    # based on a new grading process.
    feedback = json.loads(row["old_feedback"])
    tests = feedback["results"]["tests"]

    # TODO Update tests accordingly. Each test is a dictionary with the following structure:
    # {
    #     "name": "NAME_OF_TEST",
    #     "description": "DESCRIPTION_OF_TEST",
    #     "points": POINTS_AWARDED_FOR_TEST,
    #     "max_points": MAX_POINTS_FOR_TEST,
    #     "output": "OUTPUT_FROM_TEST",
    #     "message": "MESSAGE_FROM_TEST",
    # }

    # After updating the necessary information in the tests based on the new
    # grading process, the overall points, maximum points, and score percentage
    # are updated accordingly. The updated feedback is then written back to the
    # row, which will be used to upload the new scores and feedback for each
    # submission.
    feedback["results"]["points"] = sum(t["points"] for t in tests)
    feedback["results"]["max_points"] = sum(t["max_points"] for t in tests)
    feedback["results"]["score"] = (
        (feedback["results"]["points"] / feedback["results"]["max_points"])
        if feedback["results"]["max_points"] > 0
        else 0
    )
    feedback["results"]["tests"] = tests
    row["feedback_json"] = json.dumps(feedback)
    row["score_perc"] = feedback["results"]["score"] * 100


def update_internally_graded_question(row: dict[str, str]) -> None:
    # If the question was internally graded, the grading process can take the
    # values of individual elements into account, as well as params and original
    # correct_answers.
    params = json.loads(row["params"])
    correct = json.loads(row["true_answer"])
    submitted = json.loads(row["submitted_answer"])
    partial = json.loads(row["old_partial_scores"])

    # TODO Update `partial` accordingly based on the new grading process.
    # This follows a similar structure available in the `grade()` function
    # of the question
    # (https://docs.prairielearn.com/question/server/#step-5-grade), so you
    # will typically update `partial[answer_name]`, where `answer_name` is
    # the name assigned to the element that needs to be updated. Note that
    # updating `score_perc` is not necessary, as the upload process will
    # automatically compute the new score percentage based on the updated
    # partial scores.

    row["partial_scores"] = json.dumps(partial)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input_file", help="CSV file obtained from PrairieLearn")
    parser.add_argument("output_file", help="CSV file to be generated")
    args = parser.parse_args()

    with (
        open(args.input_file, newline="") as csvin,
        open(args.output_file, "w", newline="") as csvout,
    ):
        reader = csv.DictReader(csvin)
        fields = [*(reader.fieldnames or []), "feedback_json"]
        writer = csv.DictWriter(csvout, fieldnames=fields)
        writer.writeheader()

        for row in reader:
            if row["qid"] == OFFENDING_QID:
                row["feedback_json"] = ""

                # TODO Call either `update_externally_graded_question(row)` or `update_internally_graded_question(row)`

                writer.writerow(row)
