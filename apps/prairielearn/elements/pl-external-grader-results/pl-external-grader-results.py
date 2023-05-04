import ansi2html.style as ansi2html_style
import chevron
import lxml.html
import prairielearn as pl
from ansi2html import Ansi2HTMLConverter

# No built-in support for custom schemes, so we'll monkey-patch our own colors
# into the module. Colors borrowed from the "Dark Background" color preset in
# iTerm2; blue tweaked a bit for better legibility on black.
# order: black red green yellow blue magenta cyan white
# first set of 8 is normal, second set of 8 is bright
ansi2html_style.SCHEME["iterm"] = (
    "#000000",
    "#c91b00",
    "#00c200",
    "#c7c400",
    "#0037da",
    "#c930c7",
    "#00c5c7",
    "#c7c7c7",
    "#676767",
    "#ff6d67",
    "#5ff967",
    "#fefb67",
    "#6871ff",
    "#ff76ff",
    "#5ffdff",
    "#feffff",
)
conv = Ansi2HTMLConverter(inline=True, scheme="iterm")


def ansi_to_html(output):
    if output is None:
        return None
    try:
        return conv.convert(output, full=False)
    except Exception as e:
        return f"[Error converting ANSI to HTML: {e}]\n\n{output}"


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = []
    optional_attribs = []
    pl.check_attribs(element, required_attribs, optional_attribs)


def round_value(val, digits=2):
    return format(val, f".{digits}f").rstrip("0").rstrip(".")


def render(element_html, data):
    if data["panel"] == "submission":
        html_params = {"submission": True, "graded": True, "uuid": pl.get_uuid()}

        feedback = data["feedback"]
        html_params["graded"] = bool(feedback)
        grading_succeeded = bool(feedback.get("succeeded", None))
        html_params["grading_succeeded"] = grading_succeeded
        results = feedback.get("results", None)

        # Gradable
        gradable = True
        if results is not None and "gradable" in results:
            gradable = results["gradable"]
        html_params["gradable"] = gradable

        # Format Errors
        format_errors = data.get("format_errors", {})
        grader_format_errors = format_errors.get("_external_grader", [])
        html_params["format_errors"] = grader_format_errors
        html_params["has_format_errors"] = len(grader_format_errors) > 0

        if not grading_succeeded:
            html_params["message"] = ansi_to_html(feedback.get("message", None))
        else:
            results = feedback.get("results", None)
            if grading_succeeded and results:
                html_params["succeeded"] = bool(results.get("succeeded", None))
                html_params["score"] = round_value(results.get("score", 0) * 100)
                html_params["achieved_max_points"] = results.get("score", 0) >= 1.0
                html_params["results_color"] = (
                    "#4CAF50" if (results.get("score", 0) >= 1.0) else "#F44336"
                )
                html_params["has_message"] = bool(results.get("message", False))
                html_params["message"] = ansi_to_html(results.get("message", None))
                html_params["has_output"] = bool(results.get("output", False))
                html_params["output"] = ansi_to_html(results.get("output", None))
                html_params["images"] = results.get("images", [])
                html_params["has_images"] = len(html_params["images"]) > 0
                html_params["has_message_or_output_or_image"] = bool(
                    html_params["has_message"]
                    or html_params["has_output"]
                    or html_params["has_images"]
                )

                results_tests = results.get("tests", None)
                html_params["has_tests"] = bool(results.get("tests", None))
                if results_tests:
                    # Let's not assume that people give us a valid array of tests
                    # If any test is missing either points or max_points, we'll
                    # disable detailed scores for all questions
                    tests_missing_points = False
                    for test in results_tests:
                        if test.get("points", None) is None:
                            tests_missing_points = True
                        if test.get("max_points", None) is None:
                            tests_missing_points = True
                    html_params["tests_missing_points"] = tests_missing_points

                    if not tests_missing_points:
                        html_params["points"] = round_value(
                            sum(test["points"] for test in results_tests)
                        )
                        html_params["max_points"] = round_value(
                            sum(test["max_points"] for test in results_tests)
                        )

                    # We need to build a new tests array to massage data a bit
                    tests = []
                    for index, results_test in enumerate(results_tests):
                        test = {}
                        test["index"] = index
                        test["name"] = results_test.get("name", "")
                        test["has_message"] = bool(results_test.get("message", None))
                        test["message"] = ansi_to_html(
                            results_test.get("message", None)
                        )
                        test["has_output"] = bool(results_test.get("output", None))
                        test["output"] = ansi_to_html(results_test.get("output", None))
                        test["has_description"] = bool(
                            results_test.get("description", None)
                        )
                        test["description"] = results_test.get("description", None)
                        test["show_points"] = not tests_missing_points
                        if not tests_missing_points:
                            test["points"] = round_value(results_test.get("points"))
                            test["max_points"] = round_value(
                                results_test.get("max_points")
                            )

                            if test["max_points"] != test["points"]:
                                test["results_color"] = "#E70000"
                                test["results_icon"] = "fa-times"
                            # Don't consider points for test cases that are 0/0
                            # to be correct. We compare with a string because
                            # `round_value()` returns a string.
                            elif test["max_points"] == "0":
                                test["results_color"] = "#757575"
                                test["results_icon"] = "fa-circle-info"
                            else:
                                test["results_color"] = "#008900"
                                test["results_icon"] = "fa-check"

                        test["images"] = results_test.get("images", [])
                        test["has_images"] = len(test["images"]) > 0
                        tests.append(test)

                    html_params["tests"] = tests

        with open("pl-external-grader-results.mustache", "r", encoding="utf-8") as f:
            html = chevron.render(f, html_params).strip()
    else:
        html = ""

    return html
