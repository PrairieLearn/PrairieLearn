import json
import math
import os
import traceback
from collections import defaultdict
from os.path import join
from typing import Any
from unittest import TestLoader

from pl_result import PLTestResult

"""
The main python entrypoint for the autograder framework.
Loads and executes test cases.
"""

OUTPUT_FILE = "output-fname.txt"


def add_files(results: list[dict[str, Any]]) -> None:
    base_dir = os.environ.get("MERGE_DIR")
    if base_dir is None:
        raise ValueError("MERGE_DIR not set in environment variables")

    for test in results:
        test["files"] = test.get("files", [])
        image_fname = join(base_dir, "image_" + test["name"] + ".png")
        if os.path.exists(image_fname):
            with open(image_fname) as content_file:
                imgsrc = content_file.read()
            if "images" not in test:
                test["images"] = []
            test["images"].append(imgsrc)
            os.remove(image_fname)
        feedback_fname = join(base_dir, "feedback_" + test["filename"] + ".txt")
        if os.path.exists(feedback_fname):
            with open(feedback_fname, encoding="utf-8") as content_file:
                text_feedback = content_file.read()
            test["message"] = text_feedback
            os.remove(feedback_fname)


if __name__ == "__main__":
    output_fname = None
    try:
        filenames_dir = os.environ.get("FILENAMES_DIR")
        if filenames_dir is None:
            raise ValueError("FILENAMES_DIR not set in environment variables")
        base_dir = os.environ.get("MERGE_DIR")
        if base_dir is None:
            raise ValueError("MERGE_DIR not set in environment variables")

        # Read the output filename from a file, and then delete it
        # We could do this via command-line arg but there's a chance of
        # a student picking it up by calling `ps` for example.
        with open(join(filenames_dir, OUTPUT_FILE)) as output_f:
            output_fname = output_f.read()
        os.remove(join(filenames_dir, OUTPUT_FILE))

        from filenames.test import Test as TestCase  # type: ignore

        # Update the working directory so tests may access local files
        prev_wd = os.getcwd()
        os.chdir(base_dir)

        # Run the tests with our custom setup
        loader = TestLoader()
        all_results = []
        format_errors = []
        gradable = True
        has_test_cases = False
        for _ in range(TestCase.total_iters):
            suite = loader.loadTestsFromTestCase(TestCase)
            has_test_cases = suite.countTestCases() > 0
            result = PLTestResult()
            suite.run(result)
            all_results.append(result.getResults())
            if not result.getGradable():
                gradable = False
                format_errors = result.format_errors
                break

        # Change back to previous directory
        os.chdir(prev_wd)

        if len(all_results) > 1:
            # Combine results into big dict and then back to list of dicts
            results_dict = defaultdict(lambda: {"max_points": 0, "points": 0})
            for res_list in all_results:
                for res in res_list:
                    this_result = results_dict[res["name"]]
                    this_result["points"] += res["points"]
                    this_result["max_points"] += res["max_points"]
                    this_result["filename"] = res["filename"]
                    this_result["name"] = res["name"]
            results = list(results_dict.values())
        else:
            results = all_results[0]

        # Compile total number of points
        max_points = TestCase.get_total_points()
        earned_points = sum([test["points"] for test in results])
        score = (
            0
            if math.isclose(float(max_points), 0)
            else float(earned_points) / float(max_points)
        )

        # load output files to results
        add_files(results)

        text_output = ""
        if os.path.exists(join(base_dir, "output.txt")):
            with open(join(base_dir, "output.txt"), encoding="utf-8") as content_file:
                text_output = content_file.read()
            os.remove(join(base_dir, "output.txt"))

        # Assemble final grading results
        grading_result = {}
        grading_result["tests"] = results
        grading_result["score"] = score
        grading_result["succeeded"] = True
        grading_result["gradable"] = gradable
        grading_result["max_points"] = max_points
        if text_output:
            grading_result["output"] = text_output
        if len(format_errors) > 0:
            grading_result["format_errors"] = format_errors

        # Instructors may have named their tests incorrectly or somehow misconfigured things.
        # Help point them in the right direction.
        if not has_test_cases:
            grading_result["message"] = "No tests were found."

        # Save images
        grading_result["images"] = []
        all_img_num = 0
        for img_iter in range(TestCase.total_iters):
            img_num = 0
            while True:
                # Save each image as image_{test iteration}_{image number}
                img_in = join(base_dir, f"image_{img_iter}_{img_num}.png")
                if os.path.exists(img_in):
                    with open(img_in) as content_file:
                        grading_result["images"].append(content_file.read())
                    os.remove(img_in)
                    img_num += 1
                    all_img_num += 1
                else:
                    break

        with open(output_fname, mode="w", encoding="utf-8") as out:
            json.dump(grading_result, out)
    except BaseException as exc:
        # Last-ditch effort to capture meaningful error information
        grading_result = {}
        grading_result["score"] = 0.0
        grading_result["succeeded"] = False
        grading_result["output"] = traceback.format_exc()
        if not output_fname:
            raise ValueError(
                "No output_fname, can't capture error information"
            ) from exc

        with open(output_fname, mode="w") as out:
            json.dump(grading_result, out)
