"""Convert Canvas quizzes to other formats."""

import argparse
import json
import os
from collections import OrderedDict
from typing import Any

import requests


class Canvas:
    def __init__(self) -> None:
        with open(os.path.join(os.path.dirname(__file__), "config.json")) as config:
            self.config = json.load(config)
        self.token = self.config["access_token"]
        self.api_url = self.config["api_url"]
        self.token_header = {"Authorization": f"Bearer {self.token}"}

    @staticmethod
    def add_arguments(
        parser: argparse.ArgumentParser,
        *,
        course: bool = True,
        quiz: bool = False,
    ) -> None:
        parser.add_argument(
            "-d", "--debug", action="store_true", help="Enable debugging mode"
        )
        if course:
            parser.add_argument("-c", "--course", type=int, help="Course ID")
        if quiz:
            parser.add_argument("-q", "--quiz", type=int, help="Quiz ID")

    def request(self, request: str, *, stop_at_first: bool = False) -> list[Any]:
        retval: list[Any] = []
        response = requests.get(self.api_url + request, headers=self.token_header)
        while True:
            response.raise_for_status()
            retval.append(response.json())
            if (
                stop_at_first
                or "current" not in response.links
                or "last" not in response.links
                or response.links["current"]["url"] == response.links["last"]["url"]
            ):
                break
            response = requests.get(
                response.links["next"]["url"], headers=self.token_header
            )
        return retval

    def courses(self) -> list[dict[str, Any]]:
        courses: list[dict[str, Any]] = []
        for result in self.request("/courses?include[]=term&state[]=available"):
            courses.extend(result)
        return courses

    def course(self, course_id: str | None) -> "Course":
        if course_id:
            for course in self.request(f"/courses/{course_id}?include[]=term"):
                return Course(course)

        courses = self.courses()
        for index, course in enumerate(courses):
            term = course.get("term", {}).get("name", "NO TERM")
            course_code = course.get("course_code", "UNKNOWN COURSE")
            print(f"{index:2}: {course['id']:7} - {term:10} / {course_code}")
        course_index = int(input("Which course? "))
        return Course(courses[course_index])


class Course(Canvas):
    def __init__(self, course_data: dict[str, Any]) -> None:
        super().__init__()
        self.data = course_data
        self.id = course_data["id"]
        self.url_prefix = f"/courses/{self.id}"

    def __getitem__(self, key: str) -> Any:
        """Returns the specified key from the course data."""
        return self.data[key]

    def quizzes(self) -> list["Quiz"]:
        quizzes: list[Quiz] = []
        for result in self.request(f"{self.url_prefix}/quizzes"):
            quizzes += [
                Quiz(self, quiz) for quiz in result if quiz["quiz_type"] == "assignment"
            ]
        return quizzes

    def quiz(self, quiz_id: str | None) -> "Quiz":
        if quiz_id:
            for quiz in self.request(f"{self.url_prefix}/quizzes/{quiz_id}"):
                return Quiz(self, quiz)

        quizzes = self.quizzes()
        for index, quiz in enumerate(quizzes):
            print(f"{index:2}: {quiz['id']:7} - {quiz['title']}")
        quiz_index = int(input("Which quiz? "))
        return quizzes[quiz_index]


class CourseSubObject(Canvas):
    # If not provided, the request_param_name defaults to the lower-cased class name.
    def __init__(
        self,
        parent: "Course | CourseSubObject",
        route_name: str,
        data: dict[str, Any],
        id_field: str = "id",
        request_param_name: str | None = None,
    ) -> None:
        super().__init__()

        self.parent = parent
        self.data = data
        self.id_field = id_field
        self.id = self.compute_id()
        self.route_name = route_name
        self.url_prefix = self.compute_url_prefix()
        if not request_param_name:
            request_param_name = type(self).__name__.lower()
        self.request_param_name = request_param_name

    def get_course(self) -> Course:
        if isinstance(self.parent, Course):
            return self.parent
        else:
            return self.parent.get_course()

    def compute_id(self) -> str:
        return self.data[self.id_field]

    def compute_base_url(self) -> str:
        return f"{self.parent.url_prefix}/{self.route_name}"

    def compute_url_prefix(self) -> str:
        return f"{self.compute_base_url()}/{self.id}"

    def __getitem__(self, index: str) -> Any:
        """Returns the specified key from the object data."""
        return self.data[index]


class Quiz(CourseSubObject):
    def __init__(self, course: Course, quiz_data: dict[str, Any]) -> None:
        super().__init__(course, "quizzes", quiz_data)

    def question_group(self, group_id: str | None) -> dict[str, Any] | None:
        if not group_id:
            return None
        for group in self.request(f"{self.url_prefix}/groups/{group_id}"):
            return group
        return None

    def questions(self) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
        questions: dict[str, dict[str, Any]] = {}
        groups: dict[str, dict[str, Any]] = {}
        i = 1
        for result in self.request(f"{self.url_prefix}/questions?per_page=100"):
            for question in result:
                if question["quiz_group_id"] in groups:
                    group = groups[question["quiz_group_id"]]
                else:
                    group = self.question_group(question["quiz_group_id"])
                    if group:
                        groups[question["quiz_group_id"]] = group

                if group:
                    question["points_possible"] = group["question_points"]
                    question["position"] = group["position"]
                else:
                    question["position"] = i
                    i += 1
                questions[question["id"]] = question

        for grp in groups.values():
            if not grp:
                continue

            for question in [
                q
                for q in questions.values()
                if q["position"] >= grp["position"] and q["quiz_group_id"] is None
            ]:
                question["position"] += 1

        return (
            OrderedDict(sorted(questions.items(), key=lambda t: t[1]["position"])),
            OrderedDict(sorted(groups.items(), key=lambda t: t[1]["position"])),
        )
