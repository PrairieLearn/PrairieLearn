import sympy
from sympy.core.singleton import Singleton
from sympy import S
from sympy import Function, Symbol, Dummy, Number, NumberSymbol, MatrixSymbol
from sympy import Rational, Float, Poly, UnevaluatedExpr
from sympy.utilities.lambdify import implemented_function

r""" SciPy mathematical constants, physical constants, and unit definitions:
     SEE: https://docs.scipy.org/doc/scipy/reference/constants.html
"""
import scipy.constants as spconst

class ScipyConstantValue:
        
    def __new__(self, spcValue, spcName):
        super(ScipyConstantValue, self).__init__(self)
        return self

    def __init__(self, spcValue, spcName):
        self.name = spcName
        self.value = spcValue
        super(ScipyConstantValue, self).__init__(self, spcName)
        self.nargs = 0

    def toSympy(self):
        return str(self.name)

    def setValue(self, spconstValue):
        self.value = spconstValue

    def setName(self, spconstName):
        self.name = spconstName

    def __str__(self):
        if self.name is None:
            raise ValueError
        return str(self.name)

    def _latex(self):
        return str(self)

    def __unicode__(self):
        return str(self)

    def __float__(self):
        if self.value is None:
            raise ValueError
        return float(self.value)

    def __int__(self):
        if self.value is None:
            raise ValueError
        return int(self.value)

    def _evalf(self):
        if isinstance(self.value, int):
            return int(self)
        else:
            return float(self)

    def _eval_expand_func(self):
        return self._evalf()

class PLConstantValue(NumberSymbol):

    DEFAULT_NPREC = 2**12
        
    def __new__(self, text_symbol, sympy_impl, latex_symbol, unicode_symbol, docstr):
        if text_symbol == None or len(text_symbol) == 0:
            raise ValueError("Parameter 'text_symbol' must be non-empty and defined!")
        elif sympy_impl == None:
            raise ValueError("Constant needs a sympy-style definition!")
        self.latex_symbol = latex_symbol if latex_symbol is not None else text_symbol
        self.unicode_symbol = unicode_symbol if unicode_symbol is not None else text_symbol
        self.sympy_impl = sympy_impl
        self.docstr = docstr if docstr is not None else ""
        return self

    def _latex(self, printer):
        return self.latex_symbol

    def __doc__(self):
        docstr = "%s ≈ %1.5f (%s)" % (self.unicode_symbol, self._eval_evalf(nprec=DEFAULT_NPREC), self.docstr)
        return docstr

    def __str__(self):
        return self.text_symbol

    def __unicode__(self):
        return self.unicode_symbol

    def _eval_expand_func(self, **hints):
        if isinstance(self.sympy_impl, ScipyConstantValue):
            return self.sympy_impl.toSympy()._eval_expand_func(function=isFunc)
        isFunc = False
        if isinstance(self.sympy_impl, Function):
            isFunc = True
        return self.sympy_impl._eval_expand_func(function=isFunc)

    def _eval_evalf(self, prec=DEFAULT_NPREC):
        #if isinstance(self.sympy_impl, ScipyConstantValue):
        #    return self.sympy_impl.toSympy()
        numericalConstApprox = self.sympy_impl._evalf()._evalf(nprec)
        return Float(numericalConstApprox, precision=prec)

    def evalf(self, prec=DEFAULT_NPREC):
        return self._eval_evalf(prec)

    @property
    def sympy_impl(self):
        if isinstance(self.sympy_impl, ScipyConstantValue):
            return self.sympy_impl.toSympy()
        return self.sympy_impl

    def _prec(self):
        return DEFAULT_NPREC

    def __add__(self, other_obj):
        return self.evalf() + other_obj

    def __mul__(self, other_obj):
        return self.evalf() * other_obj

    def __sub__(self, other_obj):
        return self.evalf() - other_obj

class PLConstants:

    r""" Default SymPy printing and display configuration:
         SEE: https://docs.sympy.org/latest/modules/printing.html
    """
    DEFAULT_SYMPY_PRINT_CONFIG = {
        'use_unicode' : True, 
        'use_latex'   : True,
        'no_global'   : False,
        'euler'       : True,
        'latex_mode'  : 'inline',
    }

    r""" Default LaTeX symbol and printing configuration:
         SEE: https://github.com/sympy/sympy/blob/46e00feeef5204d896a2fbec65390bd4145c3902/sympy/printing/latHasInvalidFunctionErrorex.py#L2745
    """
    DEFAULT_LATEX_PRINT_CONFIG = {
        'inv_trig_style' : 'full',
        'ln_notation'    : False,
        'mode'           : 'inline',
        'symbol_names'   : {},
    }

    OPTION_NAMED_CONSTANTS = "named-constants"
    NAMED_CONSTANTS_DICT = {
        'inf'          : {
            'unicode_symbol' : u'∞',
            'latex_symbol'   : r'\infty',
            'sympy_impl'     : S.Infinity,
            'docstr'         : 'Unsigned extended real infinity',
        },
        'zoo'          : {
            'unicode_symbol' : u'∞̃',
            'latex_symbol'   : r'\tilde{\infty}',
            'sympy_impl'     : S.ComplexInfinity,
            'docstr'         : 'Unsigned complex infinity',
        },
        'NaN'          : {
            'unicode_symbol' : u'∅',
            'latex_symbol'   : r'\operatorname{NaN}',
            'sympy_impl'     : S.NaN,
            'docstr'         : 'Not a number (NaN) symbol',
        },
        'golden_ratio' : {
            'unicode_symbol' : u'𝞍',
            'latex_symbol'   : r'\varphi',
            'sympy_impl'     : S.GoldenRatio,
            'docstr'         : 'The golden ratio',
        },
        'catalanK'     : {
            'unicode_symbol' : u'𝜥',
            'latex_symbol'   : r'\kappa',
            'sympy_impl'     : S.Catalan,
            'docstr'         : 'Catalan\'s constant (K, or G)',
        },
        'euler_gamma'  : {
            'unicode_symbol' : u'𝜸',
            'latex_symbol'   : r'\gamma',
            'sympy_impl'     : S.EulerGamma,
            'docstr'         : 'The Euler-Mascheroni constant',
        },
        'zeta2'        : {
            'unicode_symbol' : u'𝜻(2)',
            'latex_symbol'   : r'\zeta(2)',
            'sympy_impl'     : sympy.zeta(2),
            'docstr'         : 'The famous Basel constant (PI^2/6)', 
        },
        'zeta3'        : {
            'unicode_symbol' : u'𝜻(3)',
            'latex_symbol'   : r'\zeta(3)',
            'sympy_impl'     : sympy.zeta(3),
            'docstr'         : 'Apery\'s irrational constant',
        },
        'log2'         : {
            'unicode_symbol' : u'㏑2',
            'latex_symbol'   : r'\ln(2)',
            'sympy_impl'     : sympy.log(2, sympy.E),
            'docstr'         : 'The natural logarithm of two',
        },
        'sqrtpi'       : {
            'unicode_symbol' : u'√𝜋',
            'latex_symbol'   : r'\sqrt{\pi}',
            'sympy_impl'     : sympy.sqrt(S.Pi),
            'docstr'         : 'The square root of PI',
        },
        'sqrt2'        : {
            'unicode_symbol' : u'√2',
            'latex_symbol'   : r'\sqrt{2}',
            'sympy_impl'     : sympy.sqrt(2),
            'docstr'         : 'The square root of two',
        },
        'log2e'        : {
            'unicode_symbol' : u'㏒₂(e)',
            'latex_symbol'   : r'\log_2(e)',
            'sympy_impl'     : sympy.log(sympy.E, 2),
            'docstr'         : 'The base-2 logarithm of E',
        },
        'log10e'       : {
            'unicode_symbol' : u'㏒₁₀(e)',
            'latex_symbol'   : r'\log_{10}(e)',
            'sympy_impl'     : sympy.log(sympy.E, 10),
            'docstr'         : 'The base-10 logarithm of E',
        },
        'ln10'         : {
            'unicode_symbol' : u'㏑10',
            'latex_symbol'   : r'\ln(10)',
            'sympy_impl'     : sympy.log(10, sympy.E),
            'docstr'         : 'The natural logarithm of ten',
        },
        'cbrt_omega'   : {
            'unicode_symbol' : u'𝟂',
            'latex_symbol'   : r'\omega',
            'sympy_impl'     : (1 + sympy.I * sympy.sqrt(3)) / 2,
            'docstr'         : 'The primitive cube root of unity',
        },
    }

    OPTION_NAMED_UNITS = "named-units"
    NAMED_UNITS_DICT = {
        'peta_si'  : {
            'unicode_symbol' : u'P', 
            'latex_symbol'   : r'\mathrm{P}',
            'sympy_impl'     : float(spconst.peta), 
            'docstr'         : 'SI unit - 10^15',
        },
        'tera_si'  : {
            'unicode_symbol' : u'T', 
            'latex_symbol'   : r'\mathrm{T}',
            'sympy_impl'     : float(spconst.tera), 
            'docstr'         : 'SI unit - 10^12',
        },
        'giga_si'  : {
            'unicode_symbol' : u'G', 
            'latex_symbol'   : r'\mathrm{G}',
            'sympy_impl'     : float(spconst.giga), 
            'docstr'         : 'SI unit - 10^9',
        },
        'mega_si'  : {
            'unicode_symbol' : u'M', 
            'latex_symbol'   : r'\mathrm{M}',
            'sympy_impl'     : float(spconst.mega), 
            'docstr'         : 'SI unit - 10^6',
        },
        'kilo_si'  : {
            'unicode_symbol' : u'k', 
            'latex_symbol'   : r'\mathrm{k}',
            'sympy_impl'     : float(spconst.kilo), 
            'docstr'         : 'SI unit - 10^3',
        },
        'deci_si'  : {
            'unicode_symbol' : u'd', 
            'latex_symbol'   : r'\mathrm{d}',
            'sympy_impl'     : float(spconst.deci), 
            'docstr'         : 'SI unit - 10^-1',
        },
        'centi_si' : {
            'unicode_symbol' : u'c', 
            'latex_symbol'   : r'\mathrm{c}',
            'sympy_impl'     : float(spconst.centi), 
            'docstr'         : 'SI unit - 10^-2',
        },
        'milli_si' : {
            'unicode_symbol' : u'm', 
            'latex_symbol'   : r'\mathrm{m}',
            'sympy_impl'     : float(spconst.milli), 
            'docstr'         : 'SI unit - 10^-3',
        },
        'micro_si' : {
            'unicode_symbol' : u'μ', 
            'latex_symbol'   : r'\mu',
            'sympy_impl'     : float(spconst.micro), 
            'docstr'         : 'SI unit - 10^-6',
        },
        'nano_si'  : {
            'unicode_symbol' : u'n', 
            'latex_symbol'   : r'\mathrm{n}',
            'sympy_impl'     : float(spconst.nano), 
            'docstr'         : 'SI unit - 10^-9',
        },
        'pico_si'  : {
            'unicode_symbol' : u'p', 
            'latex_symbol'   : r'\mathrm{p}',
            'sympy_impl'     : float(spconst.pico), 
            'docstr'         : 'SI unit - 10^-12',
        },
        'kibi'     : {
            'unicode_symbol' : u'㎅', 
            'latex_symbol'   : r'\mathrm{KiB}',
            'sympy_impl'     : float(spconst.kibi), 
            'docstr'         : 'Binary unit - 2^10',
        },
        'mibi'     : {
            'unicode_symbol' : u'㎆', 
            'latex_symbol'   : r'\mathrm{MiB}',
            'sympy_impl'     : ScipyConstantValue(spconst.mebi, 'mibi'), 
            'docstr'         : 'Binary unit - 2^20',
        },
        'gibi'     : {
            'unicode_symbol' : u'㎇', 
            'latex_symbol'   : r'\mathrm{GiB}',
            'sympy_impl'     : float(spconst.gibi), 
            'docstr'         : 'Binary unit - 2^30',
        }, 
        'tebi'     : {
            'unicode_symbol' : u'㎔', 
            'latex_symbol'   : r'\mathrm{TiB}',
            'sympy_impl'     : float(spconst.tebi), 
            'docstr'         : 'Binary unit - 2^40',
        },
    }

    OPTION_NAMED_PHYSICAL_CONSTANTS = "named-physical-constants"
    NAMED_PHYSICAL_CONSTANTS_DICT = {
        'speed_of_light' : {
            'unicode_symbol' : u'c',
            'latex_symbol'   : r'\mathrm{c}',
            'sympy_impl'     : ScipyConstantValue(spconst.speed_of_light, 'speed_of_light'), 
            'docstr'         : 'The speed of light in a vacuum'
        },
        'planck_h'       : {
            'unicode_symbol' : u'h',
            'latex_symbol'   : r'\mathrm{h}',
            'sympy_impl'     : float(spconst.Planck), 
            'docstr'         : 'The Planck constant'
        },
        'newton_G'       : {
            'unicode_symbol' : u'G',
            'latex_symbol'   : r'\mathrm{G}',
            'sympy_impl'     : float(spconst.gravitational_constant), 
            'docstr'         : 'Newtonian constant of gravitation'
        },
        'acc_g'          : {
            'unicode_symbol' : u'g',
            'latex_symbol'   : r'\mathrm{g}',
            'sympy_impl'     : float(spconst.g), 
            'docstr'         : 'Standard acceleration of gravity'
        },
        'molgas_R'       : {
            'unicode_symbol' : u'R-㏖',
            'latex_symbol'   : r'\mathrm{R}',
            'sympy_impl'     : float(spconst.gas_constant), 
            'docstr'         : 'The molar gas constant'
        },
        'boltzmann_k'    : {
            'unicode_symbol' : u'k',
            'latex_symbol'   : r'\mathrm{k}',
            'sympy_impl'     : float(spconst.Boltzmann), 
            'docstr'         : 'The Boltzmann constant'
        },
        'liter'          : {
            'unicode_symbol' : u'ℓ',
            'latex_symbol'   : r'\ell',
            'sympy_impl'     : float(spconst.liter), 
            'docstr'         : 'One liter in cubic meters'
        },
        'speed_of_sound' : {
            'unicode_symbol' : u'Mach',
            'latex_symbol'   : r'\mathrm{Mach}',
            'sympy_impl'     : float(spconst.speed_of_sound), 
            'docstr'         : 'One Mach (approx., at 15 C, 1 atm) in meters per second'
        },
        'zero_celsius'   : {
            'unicode_symbol' : u'0C',
            'latex_symbol'   : r'\mathrm{0C}',
            'sympy_impl'     : float(spconst.zero_Celsius), 
            'docstr'         : 'Zero of Celsius scale in Kelvin'
        },
        'one_degree_F'   : {
            'unicode_symbol' : u'℉',
            'latex_symbol'   : r'^{\circ}\mathrm{F}',
            'sympy_impl'     : float(spconst.degree_Fahrenheit), 
            'docstr'         : 'One Fahrenheit (only differences) in Kelvins'
        },
        'eV'             : {
            'unicode_symbol' : u'eV',
            'latex_symbol'   : r'\mathrm{eV}',
            'sympy_impl'     : float(spconst.electron_volt), 
            'docstr'         : 'One electron volt in Joules'
        },
        'calorie'        : {
            'unicode_symbol' : u'㎈',
            'latex_symbol'   : r'\mathrm{cal}',
            'sympy_impl'     : float(spconst.calorie), 
            'docstr'         : 'One calorie (thermochemical) in Joules'
        },
        'Btu'            : {
            'unicode_symbol' : u'Btu',
            'latex_symbol'   : r'\mathrm{btu}',
            'sympy_impl'     : float(spconst.Btu), 
            'docstr'         : 'One British thermal unit (International Steam Table) in Joules'
        }, 
        'pound_force'    : {
            'unicode_symbol' : u'lbf',
            'latex_symbol'   : r'\mathrm{lbf}',
            'sympy_impl'     : float(spconst.pound_force), 
            'docstr'         : 'One pound force in newtons'
        },
        'kilogram_force' : {
            'unicode_symbol' : u'kgf',
            'latex_symbol'   : r'\mathrm{kgf}',
            'sympy_impl'     : float(spconst.kilogram_force), 
            'docstr'         : 'One kilogram force in newtons'
        },
    }
 
    @staticmethod
    def ResolveNamedConstantsFromDict(namedConstsDict):
        namedConstsDictReturn = dict([])
        for constNameKey in namedConstsDict.keys():
            constParamsDict = namedConstsDict[constNameKey]
            constParamsDict.update({ 'text_symbol' : constNameKey })
            sympyConstObj = PLConstantValue(**constParamsDict)
            namedConstsDictReturn[constNameKey] = constParamsDict['sympy_impl']
        return namedConstsDictReturn

    @staticmethod
    def GetAllNamedConstants():
        return PLConstants.ResolveNamedConstantsFromDict(PLConstants.NAMED_CONSTANTS_DICT)

    @staticmethod
    def GetAllUnitConstants():
        return PLConstants.ResolveNamedConstantsFromDict(PLConstants.NAMED_UNITS_DICT)

    @staticmethod
    def GetAllPhysicalConstants():
        return PLConstants.ResolveNamedConstantsFromDict(PLConstants.NAMED_PHYSICAL_CONSTANTS_DICT)

    r""" Storing these neat symbols for later applications as a comment:
         OTHER_UNICODE = r'≝ | ≜ | ≔ | ≕ | ㎭'
    """

def GetConstantVariablesByGroup(cvarGrpId=None):
    varsDict = dict([])
    allVarGroupsDict = { 
        PLConstants.OPTION_NAMED_CONSTANTS          : lambda: PLConstants.GetAllNamedConstants(),
        PLConstants.OPTION_NAMED_UNITS              : lambda: PLConstants.GetAllUnitConstants(),
        PLConstants.OPTION_NAMED_PHYSICAL_CONSTANTS : lambda: PLConstants.GetAllPhysicalConstants(),
    }   
    varGroupsToAdd = [ cvarGrpId ]
    if cvarGrpId is None:
        varGroupsToAdd = [ 
            PLConstants.OPTION_NAMED_CONSTANTS,
            PLConstants.OPTION_NAMED_UNITS,
            PLConstants.OPTION_NAMED_PHYSICAL_CONSTANTS
        ]   
    for varGrp in varGroupsToAdd:
        if varGrp not in allVarGroupsDict.keys():
            raise ValueError("Invalid constant group requested: '%s'!" % varGrp)
        varsDict.update(allVarGroupsDict[varGrp]())
    return varsDict

class PLSymbolicFunctions:
        
    r""" Include definitions for basic (non-hyperbolic) trigonometric functions: 
         - cos, sin, tan, sec, cot, csc;
         - acos, asin, atan, asec; atan2; 
    """
    FUNC_CLASS_TRIG = "trig-base"
    FUNC_CLASS_TRIG_DICT = {
        # The following trig functions are now included by default: 
        #'cos'    : sympy.cos,
        #'sin'    : sympy.sin,
        #'tan'    : sympy.tan,
        #'sec'    : sympy.sec,
        #'csc'    : sympy.csc,
        #'cot'    : sympy.cot,
        #'arccos' : sympy.acos,
        #'arcsin' : sympy.asin,
        #'arctan' : sympy.atan,
        #'atan2'  : sympy.atan2,
        'acos'   : sympy.acos,
        'asin'   : sympy.asin,
        'atan'   : sympy.atan,
        'asec'   : sympy.asec,
        'acot'   : sympy.acot,
        'acsc'   : sympy.acsc,
    }
    
    r""" Include definitions for hyperbolic trig functions and their inverses:
         - cosh, sinh, tanh, sech, csch, coth; 
         - acosh, asinh, atanh, asech, acsch, acoth;
    """
    FUNC_CLASS_TRIG_HYPERBOLIC = "trig-hyperbolic"
    FUNC_CLASS_TRIG_HYPERBOLIC_DICT = {
        'cosh'  : sympy.cosh, 
        'sinh'  : sympy.sinh,
        'tanh'  : sympy.tanh,
        'sech'  : sympy.sech,
        'csch'  : sympy.csch,
        'coth'  : sympy.coth,
        'acosh' : sympy.acosh,
        'asinh' : sympy.asinh,
        'atanh' : sympy.atanh,
        'asech' : sympy.asech,
        'acsch' : sympy.acsch,
        'acoth' : sympy.acoth,
    }

    r""" Include definitions for standard functions used with complex variables:
         - arg, re, im, conj;
    """
    FUNC_CLASS_COMPLEX_VARS = "complex-variables"
    FUNC_CLASS_COMPLEX_VARS_DICT = {
        'arg'  : sympy.arg,
        'mod'  : sympy.Abs,
        're'   : sympy.re,
        'im'   : sympy.im,
        'conj' : sympy.conjugate,
    }
    
    r""" Include definitions for common variants on notation for a few logarithm functions:
         - log, ln, lg, log2, log10; 
         - loglog, exp; 
    """
    FUNC_CLASS_LOGARITHMS = "logarithmic"
    FUNC_CLASS_LOGARITHMS_DICT = {
        'log'    : sympy.log,
        'ln'     : implemented_function('ln', lambda x: sympy.log(x, sympy.E)),
        'lg'     : implemented_function('lg', lambda x: sympy.log(x, 2)),
        'log2'   : implemented_function('log2', lambda x: sympy.log(x, 2)),
        'log10'  : implemented_function('log10', lambda x: sympy.log(x, 10)),
        'exp'    : sympy.exp,
    }

    r""" Include definitions for functions that are otherwise common in discrete math and / or 
         theory classes, but that do not need to be enabled by default:
         - max, min, floor, ceil, abs, sgn; 
         - gcd, lcm; 
         - sqrt, frac (fractional part); 
    """
    FUNC_CLASS_PROG_EXT = "prog-extended"
    FUNC_CLASS_PROG_EXT_DICT = {
        'max'    : sympy.Max,
        'min'    : sympy.Min,
        'ceil'   : sympy.ceiling,
        'floor'  : sympy.floor,
        'frac'   : sympy.frac,
        'abs'    : sympy.Abs,
        'sgn'    : sympy.sign,
        'gcd'    : sympy.igcd,
        'lcm'    : sympy.ilcm,
        'sqrt'   : sympy.sqrt,
    }
    
    r""" Include definitions for function names and implementations that are common in problem sets 
         for typical introductory courses in differential and integral calculus:
         - exp, ln; 
         - trigonometric and hyperbolic trig functions and their inverses (see above documentation); 
    """
    FUNC_CLASS_CALC_EXT = "calculus-extended"
    FUNC_CLASS_CALC_EXT_DICT = {
        'cos'    : sympy.cos,
        'sin'    : sympy.sin,
        'tan'    : sympy.tan,
        'sec'    : sympy.sec,
        'csc'    : sympy.csc,
        'cot'    : sympy.cot,
        'arccos' : sympy.acos,
        'arcsin' : sympy.asin,
        'arctan' : sympy.atan,
        'atan2'  : sympy.atan2,
        'acos'   : sympy.acos,
        'asin'   : sympy.asin,
        'atan'   : sympy.atan,
        'asec'   : sympy.asec,
        'acot'   : sympy.acot,
        'acsc'   : sympy.acsc,
        'cosh'   : sympy.cosh, 
        'sinh'   : sympy.sinh,
        'tanh'   : sympy.tanh,
        'sech'   : sympy.sech,
        'csch'   : sympy.csch,
        'coth'   : sympy.coth,
        'acosh'  : sympy.acosh,
        'asinh'  : sympy.asinh,
        'atanh'  : sympy.atanh,
        'asech'  : sympy.asech,
        'acsch'  : sympy.acsch,
        'acoth'  : sympy.acoth,
        'ln'     : implemented_function('ln', lambda x: sympy.log(x, sympy.E)),
        'exp'    : sympy.exp,
    }

    FUNCTION_INCLUDE_CLASS_TYPES = {
        FUNC_CLASS_TRIG            : FUNC_CLASS_TRIG_DICT,
        FUNC_CLASS_TRIG_HYPERBOLIC : FUNC_CLASS_TRIG_HYPERBOLIC_DICT,
        FUNC_CLASS_COMPLEX_VARS    : FUNC_CLASS_COMPLEX_VARS_DICT,
        FUNC_CLASS_LOGARITHMS      : FUNC_CLASS_LOGARITHMS_DICT,
        FUNC_CLASS_PROG_EXT        : FUNC_CLASS_PROG_EXT_DICT,
        FUNC_CLASS_CALC_EXT        : FUNC_CLASS_CALC_EXT_DICT,
    }

    MAX_FUNCTION_NAME_LENGTH = 6

def GetCustomFunctionsByGroup(funcGrpId=None):
    funcsDict = dict([])
    funcGroupsToAdd = [ funcGrpId ]
    if funcGrpId is None:
        funcGroupsToAdd = PLSymbolicFunctions.FUNCTION_INCLUDE_CLASS_TYPES.keys()
    for funcGrp in funcGroupsToAdd:
        if funcGrp not in PLSymbolicFunctions.FUNCTION_INCLUDE_CLASS_TYPES.keys():
            raise ValueError("Invalid function group requested: '%s'!" % funcGrp)
        funcGrpDict = PLSymbolicFunctions.FUNCTION_INCLUDE_CLASS_TYPES[funcGrp]
        for funcName in funcGrpDict.keys():
            if funcName not in funcsDict:
                funcsDict[funcName] = funcGrpDict[funcName]
    return funcsDict
