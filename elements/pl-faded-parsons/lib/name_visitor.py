from ast import *
from typing import Union, Any

from dataclasses import dataclass

from lib.consts import Bcolors, SERVER_DEFAULT


@dataclass(init=True, repr=True, frozen=True)
class AnnotatedName:
    id: str
    annotation: str = None
    description: str = None


class GlobalNameVisitor(NodeVisitor):
    @staticmethod
    def get_names(code: str) -> list[AnnotatedName]:
        if not code:
            return list()

        visitor = GlobalNameVisitor()
        visitor.visit(parse(code))
        return [AnnotatedName(n, *t) if t else AnnotatedName(n) for n, t in visitor.names.items()]

    def __init__(self) -> None:
        super().__init__()
        self.names: dict[str, str] = dict()

    def visit_Assign(self, node: Assign) -> Any:
        for t in node.targets:
            if isinstance(t, Name) and t.id not in self.names:
                self.names[t.id] = None

    def visit_AnnAssign(self, node: AnnAssign) -> Any:
        key = node.target.id
        if node.simple:
            ann, desc = node.annotation, None
            # if hasattr(ann, 'slice'):
            #     if isinstance(ann.slice, Constant):
            #         if isinstance(ann.slice.value, str):
            #             desc = ann.slice.value
            #             ann = ann.value
            # use unparse to stringify compound types like list[int]
            # and simple types like int
            self.names[key] = (unparse(ann), desc)
        elif key not in self.names:
            self.names[key] = None

    def visit_FunctionDef(self, node: FunctionDef) -> Any:
        self.names[node.name] = (
            get_function_type(node), get_function_desc(node))

    def visit_AsyncFunctionDef(self, node: AsyncFunctionDef) -> Any:
        self.names[node.name] = (
            get_function_type(node), get_function_desc(node))


def get_function_desc(node: Union[FunctionDef, AsyncFunctionDef]) -> str:
    doc = get_docstring(node, clean=True)
    if not doc:
        return doc
    # cannot allow newlines, will break server.py file
    return doc.replace('\n', '<br>').strip()


def get_function_type(node: Union[FunctionDef, AsyncFunctionDef]) -> str:
    if node.type_comment:
        return node.type_comment

    def unparse_ann(a): return unparse(a.annotation) if a.annotation else None
    arg_types = list(map(unparse_ann, node.args.args))
    kw_only_types = [(a.arg, unparse_ann(a)) for a in node.args.kwonlyargs]
    ret_type = node.returns and unparse(node.returns)
    if ret_type or any(arg_types) or any(t for _, t in kw_only_types):
        out = 'python fn('
        out += ', '.join(x or 'Any' for x in arg_types)
        if kw_only_types:
            out += ', *, '
            out += ', '.join(n + ': ' + (t or 'Any') for n, t in kw_only_types)
        out += ')'
        if ret_type:
            out += ' -> '
            out += ret_type
        return out
    return 'python function'


def generate_server(setup_code: str, answer_code: str, *,
                    no_ast: bool = False, tab: str = '    ') -> tuple[str, list[AnnotatedName], list[AnnotatedName]]:
    """Generates a server file by performing analysis on provided code"""
    if no_ast:
        return (SERVER_DEFAULT, [], [])

    try:
        setup_names = GlobalNameVisitor.get_names(setup_code)
    except SyntaxError:
        Bcolors.warn('SyntaxError: Could not extract exports from setup')
        setup_names = []

    try:
        answer_names = GlobalNameVisitor.get_names(answer_code)
    except SyntaxError:
        Bcolors.warn('SyntaxError: Could not extract exports from answer')
        answer_names = []

    if not setup_names and not answer_names:
        return (SERVER_DEFAULT, [], [])

    def format_annotated_name(name: AnnotatedName) -> str:
        type = name.annotation or 'python var'
        desc = name.description or ''
        return '{"name": "' + name.id + '", "description": "' + desc + '", "type": "' + type + '"},'

    lines = \
        [ (0, '# AUTO-GENERATED FILE')
        , (0, '# go to https://prairielearn.readthedocs.io/en/latest/python-grader/#serverpy for more info')
        , (0, '')
        , (0, 'def generate(data):')
        , (1, '# Define incoming variables here')
        , (1, 'names_for_user = [')
        ]
    
    if setup_names:
        lines.extend((2, format_annotated_name(n)) for n in setup_names)
    else:
        lines.append((2, '# ex: student receives a matrix m'))
        lines.append(
            (2, '# {"name": "m", "description": "a 2x2 matrix", "type": "numpy array"}'))

    lines += \
        [ (1, ']')
        , (1, '# Define outgoing variables here')
        , (1, 'names_from_user = [')
        ]
    
    if answer_names:
        lines.extend((2, format_annotated_name(n)) for n in answer_names)
    else:
        lines.append((2, '# ex: student defines a determinant function name det'))
        lines.append((2, '# {"name": "det", "description": "determinant for a 2x2 matrix", "type": "python function"}'))
    
    lines += \
        [ (1, ']')
        , (0, '')
        , (1, 'data["params"]["names_for_user"] = names_for_user')
        , (1, 'data["params"]["names_from_user"] = names_from_user')
        , (0, '')
        , (1, 'return data')
        , (0, '')
        ]

    return ('\n'.join(tab * n + t for n, t in lines), setup_names, answer_names)
