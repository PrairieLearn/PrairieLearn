#! /usr/bin/python3

import cgrader
import clang.cindex


def find_function(node, function_name):
    if node is None:
        return None
    if (
        node.kind == clang.cindex.CursorKind.FUNCTION_DECL
        and node.spelling == function_name
    ):
        return node
    for child in node.get_children():
        found = find_function(child, function_name)
        if found is not None:
            return found
    return None


def find_function_call(node, function_name):
    if node is None:
        return None
    if (
        node.kind == clang.cindex.CursorKind.CALL_EXPR
        and node.spelling == function_name
    ):
        return node
    for child in node.get_children():
        found = find_function_call(child, function_name)
        if found is not None:
            return found
    return None


def find_loop(node):
    if node is None:
        return None
    if node.kind in (
        clang.cindex.CursorKind.FOR_STMT,
        clang.cindex.CursorKind.WHILE_STMT,
        clang.cindex.CursorKind.DO_STMT,
    ):
        return node
    for child in node.get_children():
        found = find_loop(child)
        if found is not None:
            return found
    return None


class QuestionGrader(cgrader.CPPGrader):
    def tests(self):
        index = clang.cindex.Index.create()
        translation_unit = index.parse("student.c", args=["-x", "c"])

        factorial_function = find_function(translation_unit.cursor, "factorial")
        self.add_test_result(
            "Declares factorial function",
            points=1 if factorial_function else 0,
            max_points=1,
        )
        self.add_test_result(
            "Function contains a recursive call to itself",
            points=1 if find_function_call(factorial_function, "factorial") else 0,
            max_points=1,
        )
        self.add_test_result(
            "Function does not contain a loop",
            points=1 if find_loop(factorial_function) else 0,
            max_points=1,
        )

        self.test_compile_file(
            "student.c",
            "student",
            flags="-Wall -Wextra -pedantic -Werror",
            add_c_file="/grade/tests/main.c",
        )
        self.test_run("./student", exp_output="SUCCESS", max_points=3)


g = QuestionGrader()
g.start()
