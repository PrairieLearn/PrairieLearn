import json
import pytest
import python_helper_sympy as phs
import sympy
from typing import List


class TestSympy:
    M, N = sympy.symbols('m n')

    EXPR_STRINGS = [
        'n * m',
        'm + 1',
        'm**2 + n**2 + 4 * n',
        'n * sin(m) + m**2 * cos(n)',
        'i * n + m',
        'i * i * n',
        'sqrt(100)',
        'cos(m)',
        'sin(m)',
        'tan(m)',
        'arccos(m)',
        'arcsin(m)',
        'arctan(m)',
        'acos(m)',
        'asin(m)',
        'atan(m)',
        'arctan2(m, n)',
        'atan2(m, n)',
    ]

    EXPR_LIST: List[sympy.Expr] = [
        M * N,
        M + 1,
        M * M + N * N + 4 * N,
        N * sympy.sin(M) + M * M * sympy.cos(N),
        sympy.I * N + M,
        - N,
        10,
        sympy.cos(M),
        sympy.sin(M),
        sympy.tan(M),
        sympy.acos(M),
        sympy.asin(M),
        sympy.atan(M),
        sympy.acos(M),
        sympy.asin(M),
        sympy.atan(M),
        sympy.atan2(M, N),
        sympy.atan2(M, N),
    ]

    @pytest.mark.parametrize('a_sub, sympy_ref', zip(EXPR_STRINGS, EXPR_LIST))
    def test_string_conversion(self, a_sub: str, sympy_ref: sympy.Expr) -> None:
        assert sympy_ref == phs.convert_string_to_sympy(a_sub, ['n', 'm'], allow_complex=True)

    @pytest.mark.parametrize('a_sub, sympy_ref', [
        ('i', sympy.I),
        ('j', sympy.I),
        ('i*i', -1),
        ('j*j', -1)
    ])
    def test_string_conversion_no_complex(self, a_sub: str, sympy_ref: sympy.Expr) -> None:
        assert sympy_ref != phs.convert_string_to_sympy(a_sub, ['i', 'j'], allow_complex=False)

    @pytest.mark.parametrize('a_sub', EXPR_STRINGS)
    def test_json_conversion(self, a_sub: str) -> None:
        sympy_expr = phs.convert_string_to_sympy(a_sub, ['n', 'm'], allow_complex=True)
        json_expr = phs.sympy_to_json(sympy_expr)

        # Check that json serialization works
        assert type(json.dumps(json_expr)) == str

        # Check equivalence after converting back
        json_converted_expr = phs.json_to_sympy(json_expr)

        assert sympy_expr == json_converted_expr


class TestExceptions:
    VARIABLES = ['n']

    @pytest.mark.parametrize('a_sub', ['i', '5 * i', 'j'])
    def test_not_allowed_complex(self, a_sub: str) -> None:
        with pytest.raises(phs.HasInvalidVariableError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES, allow_complex=False)

    @pytest.mark.parametrize('a_sub', ['i', '5 * i', 'j'])
    def test_reserved_variables(self, a_sub: str) -> None:
        expr = phs.convert_string_to_sympy(a_sub, ['i', 'j'], allow_complex=True)
        with pytest.raises(ValueError):
            phs.sympy_to_json(expr)

    @pytest.mark.parametrize('a_sub', ['3.5', '3.5*n', '3.14159*n**2'])
    def test_no_floats(self, a_sub: str) -> None:
        with pytest.raises(phs.HasFloatError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize('a_sub', ['5==5', '5!=5', '5>5', '5<5', '5>=5', '5<=5'])
    def test_invalid_expression(self, a_sub: str) -> None:
        with pytest.raises(phs.HasInvalidExpressionError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize('a_sub', ['eval(n)', 'f(n)', 'g(n)', 'dir(n)'])
    def test_invalid_function(self, a_sub: str) -> None:
        with pytest.raises(phs.HasInvalidFunctionError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize('a_sub', ['x', 'y', 'z*n'])
    def test_invalid_variable(self, a_sub: str) -> None:
        with pytest.raises(phs.HasInvalidVariableError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize('a_sub', ['(', 'n**', 'n**2+'])
    def test_parse_error(self, a_sub: str) -> None:
        with pytest.raises(phs.HasParseError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize('a_sub', ['\\', 'n + 2 \\', '2 \\'])
    def test_escape_error(self, a_sub: str) -> None:
        with pytest.raises(phs.HasEscapeError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)

    @pytest.mark.parametrize('a_sub', ['#', 'n + 2 # comment', '# x'])
    def test_comment_error(self, a_sub: str) -> None:
        with pytest.raises(phs.HasCommentError):
            phs.convert_string_to_sympy(a_sub, self.VARIABLES)
