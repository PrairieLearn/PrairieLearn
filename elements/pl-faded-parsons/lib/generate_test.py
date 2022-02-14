from io import StringIO
from typing import Final


STUB: Final[str] = """
from pl_helpers import name, points
from pl_unit_test import PLTestCase
from code_feedback import Feedback


def score_cases(student_fn, ref_fn, *cases):
    \""" Compares the results of `student_fn` to `ref_fn` over each case,
        and sets the feedback score to the ratio of cases that had the
        correct result over the total number of cases
    \"""
    correct = 0
    for case in cases:
        user_val = Feedback.call_user(student_fn, *case)
        ref_val = ref_fn(*case)
        if user_val == ref_val:
            correct += 1
    
    # set_score must be in range 0.0 to 1.0
    if cases:
        Feedback.set_score(correct / len(cases))
    else:
        Feedback.set_score(1.0)


class Test(PLTestCase):
""".strip()


class Writer:
    def __init__(self) -> None:
        self.indent = 0
        self.indent_text = '    '
        self.stream = StringIO()

    def writeln(self, text: str = '\n') -> None:
        """Writes lines of text to stream at current indent level"""
        ind = self.indent * self.indent_text
        self.stream.writelines(f'{ind}{line}\n' for line in text.splitlines())

    def __str__(self) -> str:
        return self.stream.getvalue()


def expect_type(clz: type, obj: object, context: str):
    if obj.__class__ != clz:
        raise SyntaxError(f"{context} expected a {clz}, got a {obj.__class__} ({obj})")
    return obj


def expect_value(obj: dict, key: str, clz: type, context: str):
    if key in obj:
        return expect_type(clz, obj[key], f'key "{key}" in {context}')
    raise SyntaxError(
        f'{context} is missing required key "{key}" (has {", ".join(map(str, obj.keys()))})'
    )

def clean_input_iter(inputs: list, context: str):
    for i, inp in enumerate(inputs):
        inp: str = expect_type(str, inp.strip(), f'input {i} in {context}')
        # format into tuple if necessary
        if not inp.startswith('(') and not inp.endswith(')'):
            inp = f'({inp},)'
        yield inp

def make_test_file(json: dict) -> str:
    """ Expects a dict with the following structure:
        ```
        {
            "functionName": str,
            "tests": list[{
                "name": str,
                "points": number,
                "cases": list[str of fn arguments]
            }]
        }
        ```
    """
    context = 'top-level object'
    fn_name = expect_value(json, 'functionName', str, context)
    tests = expect_value(json, 'tests', list, context)

    def make_decorator(obj: dict, key: str, clz: type, context: str):
        return f'@{key}({repr(expect_value(obj, key, clz, context))})'

    w = Writer()
    w.writeln(STUB)
    w.indent = 1
    expect_type(list, tests, context)
    if not tests:
        raise SyntaxError('tests are required to generate file')
    for i, test in enumerate(tests):
        context = f'test {i}'
        expect_type(dict, test, context)
        w.writeln(make_decorator(test, 'name', str, context))
        context = f'test {i} "{test["name"]}"'
        w.writeln(make_decorator(test, 'points', int, context))
        w.writeln(f'def test_{i}(self):')
        w.indent += 1
        w.writeln(f'score_cases(self.st.{fn_name}, self.ref.{fn_name},')
        w.indent += 1
        inputs = expect_value(test, 'inputs', list, context)
        w.writeln(',\n'.join(clean_input_iter(inputs, context)))
        w.indent -= 1
        w.writeln(')')
        w.indent -= 1
        w.writeln()

    return str(w)


def __main__():
    from json import load
    from argparse import ArgumentParser, RawDescriptionHelpFormatter

    parser = ArgumentParser(
        formatter_class=RawDescriptionHelpFormatter,
        description="""A tool to generate boilerplate PrairieLearn tests from a json in the form:
        {
            "functionName": str,
            "tests": list[{
                "name": str,
                "points": number,
                "cases": list[str of fn arguments]
            }]
        }"""
    )

    parser.add_argument('path_to_json', help='a path to a well formatted json')

    args = parser.parse_args()
    
    with open(args.path_to_json, 'r') as f:
        json = load(f)
    
    print(make_test_file(json))


if __name__ == '__main__':
    __main__()
