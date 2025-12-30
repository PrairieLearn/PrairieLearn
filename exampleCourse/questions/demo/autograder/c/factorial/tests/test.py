#! /usr/bin/python3

import cgrader
from clang.cindex import CursorKind, Index


def find_node(node, test):
    if node is None:
        return None
    if test(node):
        return node
    for child in node.get_children():
        found = find_node(child, test)
        if found is not None:
            return found
    return None


def find_function(node, function_name):
    return find_node(
        node,
        lambda n: n.kind == CursorKind.FUNCTION_DECL and n.spelling == function_name,
    )


def find_function_call(node, function_name):
    return find_node(
        node,
        lambda n: n.kind == CursorKind.CALL_EXPR and n.spelling == function_name,
    )


def find_loop(node):
    return find_node(
        node,
        lambda n: (
            n.kind in (CursorKind.FOR_STMT, CursorKind.WHILE_STMT, CursorKind.DO_STMT)
        ),
    )


class QuestionGrader(cgrader.CPPGrader):
    def tests(self):
        index = Index.create()
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
