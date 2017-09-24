import numpy as np
import sympy

# FIXME: It would be possible to extract a list of variables from a sympy
# expression or sympy matrix and to encode/decode with these variables as
# well, using a safe method of conversion via AST and a whitelist as is
# being done in <pl_symbolic_input>.
#
# Here is a security risk. Suppose a student is asked to input a dictionary
# and they submit the string '{'type': 'sympy', 'value': 'something horrible'}.
# The result may be to add {'type': 'sympy', 'value': 'something horrible'} as
# a key-value pair to submitted_answers. When this is decoded on the next call
# to python-called-trampoline, it will do sympy.sympify('something horrible'),
# which could indeed result in something horrible.
#
# Again, this is only going to happen if the student is allowed to submit
# arbitrary key-value pairs. We may wish to accept this risk for now.

def encode_to_json(d):
    """encode_to_json(d)

    Walks through the mutable dict d to replace any value v of standard types
    with a {'type':..., 'value':...} pair that can be json serialized:

        complex -> 'type': 'complex'
        non-complex ndarray (assumes each element can be json serialized) -> 'type': 'ndarray'
        complex ndarray -> 'type': 'complex_ndarray'
        sympy.Expr (i.e., any scalar sympy expression) -> 'type': 'sympy'
        sympy.Matrix -> 'type': 'sympy_matrix'

    This function does not try to preserve information like the dtype of an
    ndarray or the assumptions on variables in a sympy expression.
    """
    for k, v in d.items():
        if isinstance(v, dict):
            encode_to_json(v)
        elif np.isscalar(v) and np.iscomplexobj(v):
            d[k] = {'type': 'complex', 'value': {'real': v.real, 'imag': v.imag}}
        elif isinstance(v, np.ndarray):
            if np.isrealobj(v):
                d[k] = {'type': 'ndarray', 'value': v.tolist()}
            elif np.iscomplexobj(v):
                d[k] = {'type': 'complex_ndarray', 'value': {'real': v.real.tolist(), 'imag': v.imag.tolist()}}
        elif isinstance(v, sympy.Expr):
            d[k] = {'type': 'sympy', 'value': str(d[k])}
        elif isinstance(v, sympy.Matrix):
            d[k] = {'type': 'sympy_matrix', 'value': str(d[k])}

def decode_from_json(d):
    """encode_to_json(d)

    Walks through the mutable dict d to replace any {'type':..., 'value':...}
    pair with its standard type:

        'type': 'complex' -> complex
        'type': 'ndarray' -> non-complex ndarray
        'type': 'complex_ndarray' -> complex ndarray
        'type': 'sympy' -> sympy.Expr
        'type': 'sympy_matrix' -> sympy.Matrix

    This function does not try to recover information like the dtype of an
    ndarray or the assumptions on variables in a sympy expression.

    WARNING: This function uses sympy.sympify to decode type 'sympy' and
    'sympy_matrix'. This, in turn, uses 'eval'. It is not safe and should not
    be applied to untrusted input.
    """

    for k, v in d.items():
        if isinstance(v, dict):
            if 'type' in v:
                if v['type'] == 'complex':
                    if ('value' in v) and ('real' in v['value']) and ('imag' in v['value']):
                        d[k] = complex(v['value']['real'], v['value']['imag'])
                    else:
                        raise Exception('variable {:s} of type complex should have value with real and imaginary pair'.format(k))
                elif v['type'] == 'ndarray':
                    if ('value' in v):
                        d[k] = np.array(v['value'])
                    else:
                        raise Exception('variable {:s} of type ndarray should have value'.format(k))
                elif v['type'] == 'complex_ndarray':
                    if ('value' in v) and ('real' in v['value']) and ('imag' in v['value']):
                        d[k] = np.array(v['value']['real']) + np.array(v['value']['imag'])*1j
                    else:
                        raise Exception('variable {:s} of type complex_ndarray should have value with real and imaginary pair'.format(k))
                elif v['type'] == 'sympy':
                    if ('value' in v):
                        d[k] = sympy.sympify(v['value'])
                    else:
                        raise Exception('variable {:s} of type sympy should have value'.format(k))
                elif v['type'] == 'sympy_matrix':
                    if ('value' in v):
                        d[k] = sympy.sympify(v['value'])
                    else:
                        raise Exception('variable {:s} of type sympy_matrix should have value'.format(k))
                else:
                    raise Exception('variable {:s} has unknown type {:s}'.format(k, v['type']))
            else:
                decode_from_json(v)
