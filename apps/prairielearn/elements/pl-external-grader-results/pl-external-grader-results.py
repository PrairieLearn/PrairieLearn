from typing import Any

import ansi2html.style as ansi2html_style
import chevron
import lxml.html
import prairielearn as pl
from ansi2html import Ansi2HTMLConverter
from colors import PLColor

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

conv: Ansi2HTMLConverter = Ansi2HTMLConverter(inline=True, scheme="iterm")


def ansi_to_html(output: str | None) -> str | None:
    if output is None:
        return None
    try:
        return conv.convert(output, full=False)
    except Exception as e:
        return f"[Error converting ANSI to HTML: {e}]\n\n{output}"


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs: list[str] = []
    optional_attribs: list[str] = []
    pl.check_attribs(element, required_attribs, optional_attribs)


def round_value(value: float, digits: int = 2) -> str:
    """
    Round the given value to the specified precision; default is 2 digits.

    Remove trailing 0s and '.'s, e.g., convert "1.00" to "1".
    """
    return f"{value:.{digits}f}".rstrip("0").rstrip(".")


def render(element_html: str, data: pl.QuestionData) -> str:
    # Early-exit if not the submission panel
    if data["panel"] != "submission":
        return ""

    feedback = data["feedback"]
    results = feedback.get("results", None)

    grading_succeeded = bool(feedback.get("succeeded", False))

    format_errors = data.get("format_errors", {})
    grader_format_errors = format_errors.get("_external_grader", [])

    html_params = {
        "uuid": pl.get_uuid(),
        "graded": bool(feedback),
        "gradable": (
            results["gradable"]
            if (results is not None and "gradable" in results)
            else True
        ),
        "grading_succeeded": grading_succeeded,
        "format_errors": grader_format_errors,
        "has_format_errors": bool(grader_format_errors),
    }

    if grading_succeeded and results:
        html_params["score"] = round_value(results.get("score", 0) * 100)
        html_params["achieved_max_points"] = results.get("score", 0) >= 1.0

        html_params["results_color"] = (
            PLColor("correct_green")
            if (results.get("score", 0) >= 1.0)
            else PLColor("incorrect_red")
        )

        message = results.get("message", None)
        html_params["message"] = ansi_to_html(message)
        html_params["has_message"] = bool(message)

        output = results.get("output", None)
        html_params["output"] = ansi_to_html(output)
        html_params["has_output"] = bool(output)

        images = results.get("images", [])
        html_params["images"] = images
        html_params["has_images"] = bool(images)

        html_params["has_message_or_output_or_image"] = (
            html_params["has_message"]
            or html_params["has_output"]
            or html_params["has_images"]
        )

        results_tests = results.get("tests", None)
        html_params["has_tests"] = bool(results_tests)

        if results_tests:
            # Let's not assume that people give us a valid array of tests
            # If any test is missing either points or max_points (or they're set to `None`),
            # we'll disable detailed scores for all questions
            tests_missing_points = any(
                test.get("points") is None or test.get("max_points") is None
                for test in results_tests
            )
            html_params["tests_missing_points"] = tests_missing_points

            if not tests_missing_points:
                points_sum = sum(test["points"] for test in results_tests)
                html_params["points"] = round_value(points_sum)

                max_points_sum = sum(test["max_points"] for test in results_tests)
                html_params["max_points"] = round_value(max_points_sum)

            tests: list[dict[str, Any]] = []
            for index, results_test in enumerate(results_tests):
                name = results_test.get("name", "")
                message = results_test.get("message", None)
                output = results_test.get("output", None)
                description = results_test.get("description", None)
                images = results_test.get("images", [])

                test: dict[str, Any] = {
                    "index": index,
                    "name": name,
                    "message": ansi_to_html(message),
                    "has_message": bool(message),
                    "output": ansi_to_html(output),
                    "has_output": bool(output),
                    "description": description,
                    "has_description": bool(description),
                    "show_points": not tests_missing_points,
                    "images": images,
                    "has_images": bool(images),
                }

                if not tests_missing_points:
                    test.update(
                        points=round_value(results_test.get("points")),
                        max_points=round_value(results_test.get("max_points")),
                    )

                    # Don't consider points for test cases that are 0/0
                    # to be correct. We compare with a string because
                    # `round_value()` returns a string.
                    if test["max_points"] == "0":
                        test.update(
                            results_color=PLColor("gray3"),
                            results_icon="fa-circle-info",
                        )
                    elif test["points"] != test["max_points"]:
                        test.update(
                            results_color=PLColor("incorrect_red"),
                            results_icon="fa-times",
                        )
                    else:
                        test.update(
                            results_color=PLColor("correct_green"),
                            results_icon="fa-check",
                        )

                tests.append(test)
            html_params["tests"] = tests
    elif not grading_succeeded:
        html_params["message"] = ansi_to_html(feedback.get("message", None))

    with open("pl-external-grader-results.mustache", "r", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
