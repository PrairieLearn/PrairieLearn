import json
import os
import traceback
from collections import defaultdict
from pathlib import Path
from unittest import TestLoader

from pl_result import PLTestResult

"""
The main python entrypoint for the autograder framework.
Loads and executes test cases.
"""

OUTPUT_FILE = "output-fname.txt"


def add_files(results):
    base_dir = os.environ.get("MERGE_DIR")

    for test in results:
        test["files"] = test.get("files", [])
        image_fname = Path(base_dir) / "image_" + test["name"] + ".png"
        if image_fname.exists():
            with open(image_fname) as content_file:
                imgsrc = content_file.read()
            if "images" not in test:
                test["images"] = []
            test["images"].append(imgsrc)
            image_fname.unlink()
        feedback_fname = Path(base_dir) / "feedback_" + test["filename"] + ".txt"
        if feedback_fname.exists():
            with open(feedback_fname, encoding="utf-8") as content_file:
                text_feedback = content_file.read()
            test["message"] = text_feedback
            feedback_fname.unlink()


if __name__ == "__main__":
    try:
        filenames_dir = os.environ.get("FILENAMES_DIR")
        base_dir = os.environ.get("MERGE_DIR")

        # Read the output filename from a file, and then delete it
        # We could do this via command-line arg but there's a chance of
        # a student picking it up by calling `ps` for example.
        output_file = Path(filenames_dir) / OUTPUT_FILE
        with open(output_file) as output_f:
            output_fname = output_f.read()
        output_file.unlink()

        from filenames.test import Test as TestCase

        # Update the working directory so tests may access local files
        prev_wd = Path.getcwd()
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
            results = []
            for key in results_dict:
                results.append(results_dict[key])
        else:
            results = all_results[0]

        # Compile total number of points
        max_points = TestCase.get_total_points()
        earned_points = sum([test["points"] for test in results])
        score = (
            0 if float(max_points) == 0 else float(earned_points) / float(max_points)
        )

        # load output files to results
        add_files(results)

        text_output = ""
        output_txt = Path(base_dir) / "output.txt"
        if output_txt.exists():
            with open(output_txt, encoding="utf-8") as content_file:
                text_output = content_file.read()
            output_txt.unlink()

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
                img_in = Path(base_dir) / f"image_{img_iter}_{img_num}.png"
                if img_in.exists():
                    with open(img_in) as content_file:
                        grading_result["images"].append(content_file.read())
                    img_in.unlink()
                    img_num += 1
                    all_img_num += 1
                else:
                    break

        with open(output_fname, mode="w", encoding="utf-8") as out:
            json.dump(grading_result, out)
    except:  # noqa: E722
        # Last-ditch effort to capture meaningful error information
        grading_result = {}
        grading_result["score"] = 0.0
        grading_result["succeeded"] = False
        grading_result["output"] = traceback.format_exc()

        with open(output_fname, mode="w") as out:
            json.dump(grading_result, out)
