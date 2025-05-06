#! /usr/bin/python3

import cgrader
import clang.cindex as ci


def find_function(node, function_name):
    if node is None:
        return None
    if node.kind == ci.CursorKind.FUNCTION_DECL and node.spelling == function_name:
        return node
    for child in node.get_children():
        found = find_function(child, function_name)
        if found is not None:
            return found
    return None


def find_function_call(node, function_name):
    if node is None:
        return None
    if node.kind == ci.CursorKind.CALL_EXPR and node.spelling == function_name:
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
        ci.CursorKind.FOR_STMT,
        ci.CursorKind.WHILE_STMT,
        ci.CursorKind.DO_STMT,
    ):
        return node
    for child in node.get_children():
        found = find_loop(child)
        if found is not None:
            return found
    return None


class QuestionGrader(cgrader.CPPGrader):
    def tests(self):
        index = ci.Index.create()
        translation_unit = index.parse("student.c", args=["-x", "c"])

        factorial_function = find_function(translation_unit.cursor, "factorial")
        self.add_test_result(
            "Declares factorial function",
            points=1 if factorial_function else 0,
        )
        recursive_call = find_function_call(factorial_function, "factorial")
        self.add_test_result(
            "Function contains a recursive call to itself",
            points=1 if recursive_call else 0,
        )
        loop = find_loop(factorial_function)
        self.add_test_result(
            "Function does not contain a loop",
            points=0 if loop else 1,
            output=f"Your function contains a loop at line {loop.location.line}"
            if loop
            else "",
        )

        self.test_compile_file(
            "student.c",
            "student",
            flags="-Wall -Wextra -pedantic -Werror",
            add_c_file="/grade/tests/main.c",
            pkg_config_flags="check",
        )
        self.run_check_suite("./student", use_unit_test_id=False)


g = QuestionGrader()
g.start()
