#! /usr/bin/python3

import cgrader
import clang.cindex


# For debugging purposes, you can print the AST of the translation unit.
# Comment out as much as possible (especially #include statements) limit output.
def print_ast(node, indent=0):
    print(" " * indent + str(node.spelling) + " (" + str(node.kind) + ")")
    for child in node.get_children():
        print_ast(child, indent + 2)


def find_factorial_function(node):
    if node.kind == clang.cindex.CursorKind.FUNCTION_DECL and node.spelling == "factorial":
        return node
    for child in node.get_children():
        found = find_factorial_function(child)
        if found is not None:
            return found
    return None


def find_if_statement(node):
    if node.kind == clang.cindex.CursorKind.IF_STMT:
        return node
    for child in node.get_children():
        found = find_if_statement(child)
        if found is not None:
            return found
    return None


def find_call_to_factorial(node):
    if node.kind == clang.cindex.CursorKind.CALL_EXPR and node.spelling == "factorial":
        return node
    for child in node.get_children():
        found = find_call_to_factorial(child)
        if found is not None:
            return found
    return None


def find_loop(node):
    if node.kind == clang.cindex.CursorKind.FOR_STMT or node.kind == clang.cindex.CursorKind.WHILE_STMT:
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

        # Uncomment to print the AST
        # print_ast(translation_unit.cursor)
        factorial_function = find_factorial_function(translation_unit.cursor)
        if factorial_function is None:
            self.add_test_result("factorial function not found", points=0, max_points=1)
            return
        self.add_test_result("factorial function found")

        call_to_factorial = find_call_to_factorial(factorial_function)
        if call_to_factorial is None:
            self.add_test_result("call to factorial function not found in factorial()", points=0, max_points=1)
        else:
            self.add_test_result("call to factorial function found")

        loop = find_loop(translation_unit.cursor)
        if loop is not None:
            self.add_test_result("should not use a loop!", points=0, max_points=1)
        else:
            self.add_test_result("loop not found")

        self.test_compile_file(
            "student.c", "student", flags="-Wall -Wextra -pedantic -Werror",
            add_c_file="/grade/tests/main.c"
        )
        self.test_run("./student", exp_output="SUCCESS", max_points=3)


g = QuestionGrader()
g.start()
