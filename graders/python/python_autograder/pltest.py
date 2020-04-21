from unittest import TestLoader, TestSuite
import json
import traceback
import os
from collections import defaultdict
from pl_result import PrairieTestResult


"""
The main python entrypoint for the autograder framework.
Loads and executes test cases.
"""


def add_files(results):
    BASE_DIR = "/grade/run/"

    for test in results:
        test["files"] = test.get("files", [])
        image_fname = BASE_DIR + "image_" + test["name"] + ".png"
        if os.path.exists(image_fname):
            with open(image_fname, 'r') as content_file:
                imgsrc = content_file.read()
            test["files"].append({"name":"image_" + test["filename"] + ".png",
                                  "imgsrc":imgsrc})
            os.remove(image_fname)
        feedback_fname = BASE_DIR + "feedback_" + test["filename"] + ".txt"
        if os.path.exists(feedback_fname):
            with open(feedback_fname, 'r', encoding='utf-8') as content_file:
                text_output = content_file.read()
            test["files"].append({"name":"feedback_" + test["filename"] + ".txt",
                                  "text_output":text_output})
            os.remove(feedback_fname)


if __name__ == '__main__':
    try:
        from filenames.test import Test

        with open('filenames/output-fname.txt', 'r') as f:
            output_fname = f.read()
        os.remove('filenames/output-fname.txt')

        # Run the tests with our custom setup
        loader = TestLoader()
        all_results = []
        format_errors = []
        gradable = True
        for i in range(Test.total_iters):
            suite = loader.loadTestsFromTestCase(Test)
            result = PrairieTestResult()
            suite.run(result)
            all_results.append(result.getResults())
            if not result.getGradable():
                gradable = False
                format_errors = result.format_errors
                break

        if len(all_results) > 1:
            # Combine results into big dict and then back to list of dicts
            results_dict = defaultdict(lambda: {'max_points': 0, 'points': 0})
            for res_list in all_results:
                for res in res_list:
                    this_result = results_dict[res['name']]
                    this_result['points'] += res['points']
                    this_result['max_points'] += res['max_points']
                    this_result['filename'] = res['filename']
                    this_result['name'] = res['name']
            results = []
            for key in results_dict:
                results.append(results_dict[key])
        else:
            results = all_results[0]

        # Compile total number of points
        max_points = Test.get_total_points()
        earned_points = sum([test['points'] for test in results])

        # load output files to results
        add_files(results)

        text_output = ""
        if os.path.exists("/grade/run/output.txt"):
            with open("output.txt", 'r', encoding='utf-8') as content_file:
                 text_output = content_file.read()
            os.remove("/grade/run/output.txt")

        # Assemble final grading results
        grading_result = {}
        grading_result['tests'] = results
        grading_result['score'] = float(earned_points) / float(max_points)
        grading_result['succeeded'] = True
        grading_result['gradable'] = gradable
        grading_result['max_points'] = max_points
        if text_output:
            grading_result['output'] = text_output
        if len(format_errors) > 0:
            grading_result['format_errors'] = format_errors

        all_img_num = 0
        for img_iter in range(Test.total_iters):
            img_num = 0
            has_img = True
            while has_img:
                img_in = "image_%d_%d.png" % (img_iter, img_num)
                if os.path.exists(img_in):
                    with open(img_in, 'r') as content_file:
                        img_out = "image_%d" % all_img_num
                        grading_result[img_out] = content_file.read()
                    os.remove("/grade/run/%s" % img_in)
                    img_num += 1
                    all_img_num += 1
                else:
                    has_img = False

        grading_result['num_images'] = all_img_num
        with open(output_fname, mode='w', encoding='utf-8') as out:
            json.dump(grading_result, out)
    except:
        # Last-ditch effort to capture meaningful error information
        grading_result = {}
        grading_result['score'] = 0.0
        grading_result['succeeded'] = False
        grading_result['output'] = traceback.format_exc()

        with open(output_fname, mode='w') as out:
            json.dump(grading_result, out)
